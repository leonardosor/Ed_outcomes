import { MATH_LEGEND } from '@/lib/palette';

/** Compact horizontal step legend for the math-proficiency color scale. */
export default function MathLegend({ title }: { title: string }) {
  return (
    <div className="absolute bottom-3 left-3 z-10 rounded-xl border border-line bg-surface/90 backdrop-blur px-3 py-2.5 shadow-sm">
      <div className="kicker mb-1.5">{title}</div>
      <div className="flex">
        {MATH_LEGEND.map(({ color, label }) => (
          <div key={label} className="flex flex-col items-start">
            <span className="h-2.5 w-9 first:rounded-l last:rounded-r" style={{ backgroundColor: color }} />
            <span className="mt-1 font-mono text-[0.65rem] text-muted">{label}</span>
          </div>
        ))}
        <div className="ml-3 flex flex-col items-start">
          <span className="h-2.5 w-4 rounded bg-[var(--no-data)]" />
          <span className="mt-1 font-mono text-[0.65rem] text-muted">n/a</span>
        </div>
      </div>
    </div>
  );
}
