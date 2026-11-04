'use client';

import clsx from 'clsx';
import { describeR } from '@/lib/palette';

interface PearsonPanelProps {
  pearsonR: number | null | undefined;
  label?: string;
  schoolCount?: number;
  noSelection?: boolean;
  loading?: boolean;
  /** Smaller variant for the secondary factor cards. */
  compact?: boolean;
}

/** Position on a −1…+1 track, as a 0–100% offset. */
const pos = (r: number) => ((Math.max(-1, Math.min(1, r)) + 1) / 2) * 100;

export default function PearsonPanel({
  pearsonR,
  label,
  schoolCount,
  noSelection,
  loading,
  compact,
}: PearsonPanelProps) {
  if (loading) {
    return <div className={clsx('skeleton', compact ? 'h-28' : 'h-40')} />;
  }

  const hasR = pearsonR != null;
  const tone =
    hasR && pearsonR > 0.3 ? 'text-positive' : hasR && pearsonR < -0.3 ? 'text-negative' : 'text-ink';

  return (
    <div className={clsx('card flex flex-col', compact ? 'p-4 gap-3' : 'p-5 gap-4')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="kicker">Pearson r</div>
          {noSelection ? (
            <p className="mt-2 text-sm text-muted">Pick a state on the map to see its correlation.</p>
          ) : (
            <>
              <div className={clsx('font-serif leading-none tabular-nums mt-1.5', compact ? 'text-4xl' : 'text-5xl', tone)}>
                {hasR ? pearsonR.toFixed(2) : '—'}
              </div>
              <div className="mt-1.5 text-sm font-medium">{describeR(pearsonR)}</div>
            </>
          )}
        </div>
        {!noSelection && (
          <div className="text-right text-xs text-muted shrink-0 max-w-[45%]">
            {label && <div className="truncate font-medium text-ink">{label}</div>}
            {schoolCount != null && <div className="font-mono">n = {schoolCount.toLocaleString()}</div>}
            {!hasR && <div>fewer than 3 schools</div>}
          </div>
        )}
      </div>

      {!noSelection && (
        <div>
          <div className="relative h-1.5 rounded-full bg-sunken">
            <div className="absolute left-1/2 top-[-3px] h-[12px] w-px bg-line-strong" />
            {hasR && (
              <div
                className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-accent shadow transition-[left] duration-500"
                style={{ left: `${pos(pearsonR)}%` }}
              />
            )}
          </div>
          <div className="mt-1 flex justify-between font-mono text-[0.65rem] text-muted">
            <span>−1</span>
            <span>0</span>
            <span>+1</span>
          </div>
        </div>
      )}

      {!compact && (
        <p className="border-t border-line pt-3 text-xs leading-snug text-muted">
          Association, not causation. Many factors shape educational outcomes.
        </p>
      )}
    </div>
  );
}
