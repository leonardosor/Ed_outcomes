import type { ReactNode } from 'react';

/** Hover card for map features, positioned at the pointer. */
export default function MapTip({
  x,
  y,
  title,
  subtitle,
  hint,
  children,
}: {
  x: number;
  y: number;
  title: string;
  subtitle?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="floating-tip" style={{ left: x + 14, top: y + 14 }}>
      <div className="font-semibold leading-snug">{title}</div>
      {subtitle && <div className="font-mono text-[0.7rem] text-muted">{subtitle}</div>}
      <div className="mt-1.5 grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5">{children}</div>
      {hint && <div className="mt-2 border-t border-line pt-1.5 text-[0.72rem] text-muted">{hint}</div>}
    </div>
  );
}

export function TipRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="text-muted">{label}</span>
      <span className="text-right font-mono tabular-nums">{value}</span>
    </>
  );
}
