# Education Outcomes — Income & Math Proficiency

Next.js 15 + Convex app, deployed on Vercel. Explores how household income relates to
grade-8 math proficiency across US schools (state → county → school drill-down, AI insights
via Claude in Amazon Bedrock).

All app code lives in `convex-vercel/`.

## Run

```bash
cd convex-vercel
npm install
npx convex dev        # terminal 1 — Convex backend, hot reload
npm run dev           # terminal 2 — Next.js on http://localhost:3000
```

Copy `.env.local.example` to `.env.local` and fill in the values.

Load data (pre-exported NDJSON in `scripts/convex_export/`):

```bash
npx convex import --table districts    scripts/convex_export/districts.jsonl
npx convex import --table county_stats scripts/convex_export/county_stats.jsonl
npx convex import --table state_stats  scripts/convex_export/state_stats.jsonl
```

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_CONVEX_URL` | yes | Convex deployment URL (inlined at build — redeploy after changing) |
| `BEDROCK_ACCESS_KEY_ID` | yes, for AI | AWS key for Claude in Amazon Bedrock |
| `BEDROCK_SECRET_ACCESS_KEY` | yes, for AI | AWS secret for Claude in Amazon Bedrock |
| `BEDROCK_REGION` | no | Default `us-east-1` |
| `BEDROCK_SESSION_TOKEN` | no | Temporary (STS) credentials only |
| `BEDROCK_MODEL` | no | Default `anthropic.claude-haiku-4-5` |
| `LLM_DAILY_BUDGET_USD`, `LLM_SESSION_TOKEN_CAP`, `LLM_MAX_SESSIONS_PER_DAY` | no | AI usage caps |
| `LLM_INPUT_USD_PER_MTOK`, `LLM_OUTPUT_USD_PER_MTOK` | no | Prices used for the daily budget |

## Deploy

```bash
npx convex deploy                 # push Convex functions/schema to prod deployment
vercel --prod                     # production deploy
vercel env pull .env.local        # sync cloud env vars to local
```

Vercel dashboard: set **Root Directory** to `convex-vercel`.

Other useful: `npx convex dashboard`, `npx convex logs`, `npx convex codegen`, `vercel ls`, `vercel logs <url>`.
