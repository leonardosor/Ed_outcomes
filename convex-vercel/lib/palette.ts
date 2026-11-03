/** Shared plasma step scale for grade-8 math proficiency (maps + legend). */
export const MATH_COLOR_STEPS = [
  0,  '#0d0887',
  25, '#6a00a8',
  35, '#b12a90',
  45, '#e16462',
  55, '#fca636',
  65, '#f0f921',
] as const;

export const MATH_LEGEND = [
  { color: '#0d0887', label: '<25' },
  { color: '#6a00a8', label: '25' },
  { color: '#b12a90', label: '35' },
  { color: '#e16462', label: '45' },
  { color: '#fca636', label: '55' },
  { color: '#f0f921', label: '65+' },
];

/** Hex fill for a math % value (matches the map step scale). */
export function mathColor(v: number | null | undefined): string | null {
  if (v == null) return null;
  let color: string = MATH_COLOR_STEPS[1];
  for (let i = 0; i < MATH_COLOR_STEPS.length; i += 2) {
    if (v >= (MATH_COLOR_STEPS[i] as number)) color = MATH_COLOR_STEPS[i + 1] as string;
  }
  return color;
}

/** Verbal strength label for a Pearson r. */
export function describeR(r: number | null | undefined): string {
  if (r == null) return 'Insufficient data';
  const a = Math.abs(r);
  const dir = r >= 0 ? 'positive' : 'negative';
  if (a < 0.1) return 'No meaningful link';
  if (a < 0.3) return `Weak ${dir}`;
  if (a < 0.5) return `Moderate ${dir}`;
  if (a < 0.7) return `Strong ${dir}`;
  return `Very strong ${dir}`;
}
