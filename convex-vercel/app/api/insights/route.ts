import { NextRequest } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import Anthropic from "@anthropic-ai/sdk";
import { AnthropicBedrockMantle } from "@anthropic-ai/bedrock-sdk";

/**
 * /api/insights — GenAI narrative summaries + open-ended Q&A
 *
 * POST body:
 *   {
 *     mode: "summary" | "chat",
 *     context: {            // the data currently on screen (built client-side)
 *       level: string,      // "national" | "state" | "county"
 *       label: string,      // e.g. "Washtenaw County, Michigan"
 *       stats: object,      // derived aggregates (means, medians, pearson, extremes)
 *       rows: object[],     // the on-screen rows (capped client-side)
 *     },
 *     question?: string,    // chat mode only
 *     history?: { role: "user" | "assistant"; content: string }[],
 *   }
 *
 * Streams plain text back (model stream unwrapped server-side).
 *
 * Calls Claude in Amazon Bedrock (Mantle Messages endpoint) with SigV4 auth.
 * Required env: BEDROCK_ACCESS_KEY_ID, BEDROCK_SECRET_ACCESS_KEY.
 * Optional env: BEDROCK_SESSION_TOKEN (temporary creds), BEDROCK_REGION
 * (default us-east-1), BEDROCK_MODEL (default anthropic.claude-haiku-4-5).
 * Names are BEDROCK_-prefixed because Vercel reserves AWS_* variable names.
 */

// Node runtime: the AWS SigV4 signing / credential code is not edge-safe.
// Node functions on Vercel still stream responses.
export const runtime = "nodejs";

const MODEL = process.env.BEDROCK_MODEL ?? "anthropic.claude-haiku-4-5";

// ── Cost controls (env-overridable) ──────────────────────────────────────────
const DAILY_BUDGET_USD = Number(process.env.LLM_DAILY_BUDGET_USD ?? 2);
const SESSION_TOKEN_CAP = Number(process.env.LLM_SESSION_TOKEN_CAP ?? 50_000);
const MAX_SESSIONS_PER_DAY = Number(process.env.LLM_MAX_SESSIONS_PER_DAY ?? 25);
// Claude Haiku 4.5 Anthropic list prices. Bedrock bills
// at AWS's own rates — set these to your Bedrock pricing for accurate budgets.
const INPUT_USD_PER_MTOK = Number(process.env.LLM_INPUT_USD_PER_MTOK ?? 1);
const OUTPUT_USD_PER_MTOK = Number(process.env.LLM_OUTPUT_USD_PER_MTOK ?? 5);

let bedrock: AnthropicBedrockMantle | null = null;

/** Lazily built so a missing credential surfaces as a 500, not a crash at import. */
function getBedrock(): AnthropicBedrockMantle | null {
  if (bedrock) return bedrock;
  const awsAccessKey = process.env.BEDROCK_ACCESS_KEY_ID;
  const awsSecretAccessKey = process.env.BEDROCK_SECRET_ACCESS_KEY;
  if (!awsAccessKey || !awsSecretAccessKey) return null;
  bedrock = new AnthropicBedrockMantle({
    awsRegion: process.env.BEDROCK_REGION ?? "us-east-1",
    awsAccessKey,
    awsSecretAccessKey,
    awsSessionToken: process.env.BEDROCK_SESSION_TOKEN || null,
  });
  return bedrock;
}

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

function getConvex(): ConvexHttpClient | null {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  return url ? new ConvexHttpClient(url) : null;
}

const SYSTEM_PROMPT = `You are the analytics narrator for "Educational Insights", a dashboard exploring the relationship between household income (% of households earning $150k+ in a school's ZIP) and grade-8 math proficiency across US schools (2020-21, Urban Institute EdFacts + Census ACS).

You will receive the data currently visible on the user's screen as JSON: a drill level (national / state / county), derived statistics, and the underlying rows.

Rules:
- Ground every claim in the provided data. Compute derived figures (averages, gaps, ratios, correlations, comparisons) from the rows when useful. Never invent data you weren't given.
- If a question can't be answered from the provided data, say so briefly and suggest what drill level or view would help.
- Pearson r measures linear association; always note correlation is not causation when interpreting it.
- Write in clear, plain prose for a general audience. No markdown headers or bullet lists — flowing sentences and short paragraphs only.
- Round percentages to one decimal. Name specific schools/counties/states when they illustrate a trend.
- Be concise: summaries ~120-180 words, answers usually shorter.`;

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export async function POST(req: NextRequest) {
  const client = getBedrock();
  if (!client) {
    return new Response(
      "Server is missing BEDROCK_ACCESS_KEY_ID / BEDROCK_SECRET_ACCESS_KEY — add them in Vercel project settings.",
      { status: 500 }
    );
  }

  let body: {
    mode: "summary" | "chat";
    context: unknown;
    question?: string;
    history?: ChatTurn[];
    sessionId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const sessionId = (body.sessionId ?? "").slice(0, 64);
  if (!sessionId) {
    return new Response("Missing sessionId", { status: 400 });
  }

  // ── Enforce daily budget / session caps (atomic, fail-closed) ────────────
  // authorizeUsage is a Convex MUTATION: the limit check and session
  // registration run in one serializable transaction, so concurrent requests
  // cannot race past the caps.
  const convex = getConvex();
  const day = utcDay();
  if (!convex) {
    // No usage tracking → no cost control → refuse to spend.
    return new Response(
      "AI assistant is unavailable: usage tracking is not configured.",
      { status: 503 }
    );
  }
  try {
    const auth = (await convex.mutation(anyApi.usage.authorizeUsage, {
      day,
      session_id: sessionId,
      daily_budget_usd: DAILY_BUDGET_USD,
      session_token_cap: SESSION_TOKEN_CAP,
      max_sessions_per_day: MAX_SESSIONS_PER_DAY,
    })) as {
      allowed: boolean;
      reason?: "budget" | "session_tokens" | "max_sessions";
    };
    if (!auth.allowed) {
      const messages: Record<string, string> = {
        budget: `The AI assistant's daily budget ($${DAILY_BUDGET_USD}) has been used up. It resets at midnight UTC.`,
        session_tokens:
          "This session has reached its AI usage limit. Refresh the page tomorrow to keep exploring.",
        max_sessions:
          "Today's limit on new AI sessions has been reached. Please try again tomorrow.",
      };
      return new Response(
        messages[auth.reason ?? ""] ?? "AI usage limit reached.",
        { status: 429 }
      );
    }
  } catch (err) {
    // Fail CLOSED: if the budget can't be verified, don't spend.
    console.error("usage check failed", err);
    return new Response(
      "AI assistant is temporarily unavailable (usage tracking error). Please try again shortly.",
      { status: 503 }
    );
  }

  const contextJson = JSON.stringify(body.context ?? {});
  if (contextJson.length > 400_000) {
    return new Response("Context too large", { status: 413 });
  }

  const messages: Anthropic.MessageParam[] = [];

  if (body.mode === "summary") {
    messages.push({
      role: "user",
      content: `Here is the data currently on screen:\n\n${contextJson}\n\nWrite a narrative summary of what this view shows: overall proficiency levels, how they relate to income, notable outliers or standouts, and the strength of the income-score relationship. Make it informative and engaging.`,
    });
  } else {
    // Chat: replay prior turns, then ask the new question with fresh context
    for (const turn of (body.history ?? []).slice(-10)) {
      if (turn.role === "user" || turn.role === "assistant") {
        messages.push({ role: turn.role, content: turn.content });
      }
    }
    const question = (body.question ?? "").slice(0, 2000).trim();
    if (!question) return new Response("Missing question", { status: 400 });
    messages.push({
      role: "user",
      content: `Data currently on screen:\n\n${contextJson}\n\nQuestion: ${question}`,
    });
  }

  // Opening the stream awaits the HTTP response, so auth / model / quota
  // errors surface here (before any bytes are sent) and map to a 502.
  let upstream: AsyncIterable<Anthropic.RawMessageStreamEvent>;
  try {
    upstream = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      stream: true,
      system: SYSTEM_PROMPT,
      messages,
    });
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      console.error("Bedrock request failed", err.status, err.message);
      return new Response(`LLM request failed (${err.status ?? "network"}): ${err.message.slice(0, 300)}`, {
        status: 502,
      });
    }
    throw err;
  }

  // Unwrap the event stream into plain text, tracking token usage
  const encoder = new TextEncoder();
  let inputTokens = 0;
  let outputTokens = 0;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const evt of upstream) {
          if (evt.type === "content_block_delta" && evt.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(evt.delta.text));
          } else if (evt.type === "message_start") {
            inputTokens = evt.message.usage.input_tokens ?? 0;
          } else if (evt.type === "message_delta") {
            // cumulative output token count
            outputTokens = evt.usage.output_tokens ?? outputTokens;
            if (evt.delta.stop_reason === "refusal") {
              controller.enqueue(
                encoder.encode("\n\n(The model declined to answer this one — try rephrasing the question.)")
              );
            } else if (evt.delta.stop_reason === "max_tokens") {
              controller.enqueue(encoder.encode(" …"));
            }
          }
        }
      } catch (err) {
        console.error("Bedrock stream failed", err);
        controller.enqueue(encoder.encode("\n\n(The response was interrupted. Please try again.)"));
      } finally {
        // Record actual spend BEFORE closing the response stream — once the
        // response completes, serverless runtimes may terminate the function
        // and an in-flight mutation would be lost.
        if (convex && (inputTokens > 0 || outputTokens > 0)) {
          const costUsd =
            (inputTokens / 1_000_000) * INPUT_USD_PER_MTOK +
            (outputTokens / 1_000_000) * OUTPUT_USD_PER_MTOK;
          try {
            await convex.mutation(anyApi.usage.recordUsage, {
              day,
              session_id: sessionId,
              tokens: inputTokens + outputTokens,
              cost_usd: costUsd,
            });
          } catch (err) {
            console.error("usage recording failed", err);
          }
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
