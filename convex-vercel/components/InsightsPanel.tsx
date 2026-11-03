'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** The on-screen data snapshot sent to the LLM. */
export interface InsightsContext {
  level: 'national' | 'state' | 'county';
  label: string;
  stats: Record<string, unknown>;
  rows: Record<string, unknown>[];
}

interface InsightsPanelProps {
  context: InsightsContext;
  /** False while the underlying Convex queries are still loading. */
  ready: boolean;
}

interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTIONS = [
  'Which areas punch above their income level?',
  'How strong is the income–score relationship here?',
  'What are the biggest outliers and why might that be?',
];

/** Stable per-browser-session ID for server-side usage caps. */
function getSessionId(): string {
  if (typeof window === 'undefined') return 'ssr';
  let id = sessionStorage.getItem('insights-session-id');
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem('insights-session-id', id);
  }
  return id;
}

async function streamInsights(
  body: unknown,
  onChunk: (text: string) => void,
  signal: AbortSignal
): Promise<void> {
  const res = await fetch('/api/insights', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    if (res.status === 503) {
      // Service (or its usage tracking) is down — keep it friendly.
      throw new Error('GenAI service currently offline, please check back tomorrow.');
    }
    const detail = await res.text().catch(() => '');
    throw new Error(detail || `Request failed (${res.status})`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    onChunk(decoder.decode(value, { stream: true }));
  }
}

export default function InsightsPanel({ context, ready }: InsightsPanelProps) {
  const [summary, setSummary] = useState('');
  const [summaryStatus, setSummaryStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [summaryError, setSummaryError] = useState('');
  const [chat, setChat] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState('');

  // Latest context for chat sends; avoids stale closures
  const contextRef = useRef(context);
  contextRef.current = context;

  const summaryAbort = useRef<AbortController | null>(null);
  const chatAbort = useRef<AbortController | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const generateSummary = useCallback(() => {
    summaryAbort.current?.abort();
    const ctrl = new AbortController();
    summaryAbort.current = ctrl;
    setSummary('');
    setSummaryError('');
    setSummaryStatus('loading');
    streamInsights(
      { mode: 'summary', context: contextRef.current, sessionId: getSessionId() },
      chunk => setSummary(prev => prev + chunk),
      ctrl.signal
    )
      .then(() => { if (!ctrl.signal.aborted) setSummaryStatus('done'); })
      .catch((err: Error) => {
        if (ctrl.signal.aborted) return;
        setSummaryError(err.message);
        setSummaryStatus('error');
      });
  }, []);

  // Auto-generate when the drill level / selection changes (once data is ready)
  useEffect(() => {
    if (!ready || context.rows.length === 0) return;
    generateSummary();
    return () => summaryAbort.current?.abort();
    // Re-run only when the view identity changes, not on every data tick
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, context.level, context.label]);

  const ask = useCallback((questionRaw: string) => {
    const question = questionRaw.trim();
    if (!question || chatBusy) return;
    chatAbort.current?.abort();
    const ctrl = new AbortController();
    chatAbort.current = ctrl;
    setChatError('');
    setChatBusy(true);
    setInput('');

    setChat(prev => {
      const history = prev;
      const next: ChatTurn[] = [
        ...prev,
        { role: 'user', content: question },
        { role: 'assistant', content: '' },
      ];
      streamInsights(
        {
          mode: 'chat',
          context: contextRef.current,
          question,
          history,
          sessionId: getSessionId(),
        },
        chunk =>
          setChat(cur => {
            const copy = cur.slice();
            const last = copy[copy.length - 1];
            if (last?.role === 'assistant') {
              copy[copy.length - 1] = { ...last, content: last.content + chunk };
            }
            return copy;
          }),
        ctrl.signal
      )
        .then(() => { if (!ctrl.signal.aborted) setChatBusy(false); })
        .catch((err: Error) => {
          if (ctrl.signal.aborted) return;
          setChatError(err.message);
          setChatBusy(false);
        });
      return next;
    });
  }, [chatBusy]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [chat]);

  return (
    <div className="card overflow-hidden">
      <div className="grid lg:grid-cols-[1.25fr_1fr]">
        {/* ── Narrative summary ── */}
        <div className="p-6 sm:p-8 lg:border-r border-line">
          <div className="flex items-center justify-between gap-3">
            <div className="kicker flex items-center gap-2">
              <span className="text-accent text-sm">✦</span> The read on {context.label}
            </div>
            <button
              onClick={generateSummary}
              disabled={summaryStatus === 'loading' || !ready}
              className="rounded-full border border-line px-3 py-1 text-xs font-medium text-muted transition-colors hover:border-line-strong hover:text-ink disabled:opacity-50"
            >
              {summaryStatus === 'loading' && summary === '' ? 'Thinking…' : '↻ Regenerate'}
            </button>
          </div>

          <div className="mt-4">
            {summaryStatus === 'error' ? (
              <p className="text-sm text-negative">{summaryError}</p>
            ) : summary === '' && summaryStatus === 'loading' ? (
              <div className="space-y-2.5">
                <div className="skeleton h-5 w-full rounded" />
                <div className="skeleton h-5 w-11/12 rounded" />
                <div className="skeleton h-5 w-4/5 rounded" />
                <div className="skeleton h-5 w-2/3 rounded" />
              </div>
            ) : (
              <p className="font-serif text-[1.18rem] leading-[1.65] whitespace-pre-wrap">
                {summary || <span className="text-muted">Select data to generate a summary.</span>}
                {summaryStatus === 'loading' && <span className="animate-pulse text-accent">▍</span>}
              </p>
            )}
          </div>
          <p className="mt-5 text-xs text-muted">
            AI-generated from the figures on screen. Treat as a starting point, not a finding.
          </p>
        </div>

        {/* ── Q&A ── */}
        <div className="flex flex-col gap-3 bg-sunken/50 p-6 sm:p-8 border-t lg:border-t-0 border-line">
          <div className="kicker">Ask the data</div>

          {chat.length === 0 && (
            <div className="flex flex-col gap-2">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => ask(s)}
                  disabled={chatBusy || !ready}
                  className="group flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-left text-sm transition-colors hover:border-accent disabled:opacity-50"
                >
                  {s}
                  <span className="text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent">→</span>
                </button>
              ))}
            </div>
          )}

          {chat.length > 0 && (
            <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
              {chat.map((turn, i) => (
                <div
                  key={i}
                  className={
                    turn.role === 'user'
                      ? 'ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-accent px-3.5 py-2 text-sm text-accent-ink'
                      : 'max-w-[95%] whitespace-pre-wrap text-sm leading-relaxed'
                  }
                >
                  {turn.content}
                  {turn.role === 'assistant' &&
                    chatBusy &&
                    i === chat.length - 1 && <span className="animate-pulse text-accent">▍</span>}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
          )}

          {chatError && <p className="text-sm text-negative">{chatError}</p>}

          <form
            onSubmit={e => {
              e.preventDefault();
              ask(input);
            }}
            className="mt-auto flex gap-2 rounded-full border border-line bg-surface p-1 pl-4 focus-within:border-accent transition-colors"
          >
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask about the data on screen…"
              disabled={!ready}
              className="min-w-0 flex-1 bg-transparent text-sm placeholder:text-muted focus:outline-none"
            />
            <button
              type="submit"
              disabled={chatBusy || !input.trim() || !ready}
              className="rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {chatBusy ? '…' : 'Ask'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
