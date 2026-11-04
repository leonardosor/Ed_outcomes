"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import clsx from "clsx";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PearsonPanel from "@/components/PearsonPanel";
import InsightsPanel, { type InsightsContext } from "@/components/InsightsPanel";
import { loadCountyNames } from "@/lib/usCounties";
import { ABBR_TO_NAME } from "@/lib/usStates";
import { mathColor } from "@/lib/palette";
import ThemeToggle from "@/components/ThemeToggle";

const ChoroplethMap = dynamic(() => import("@/components/ChoroplethMap"), {
  ssr: false,
  loading: () => (
    <div className="skeleton h-full w-full" />
  ),
});

const CountyMap = dynamic(() => import("@/components/CountyMap"), {
  ssr: false,
  loading: () => (
    <div className="skeleton h-full w-full" />
  ),
});

const ScatterPlot = dynamic(() => import("@/components/ScatterPlot"), {
  ssr: false,
  loading: () => <div className="skeleton h-[304px]" />,
});

const IncomeBracketChart = dynamic(() => import("@/components/IncomeBracketChart"), {
  ssr: false,
  loading: () => <div className="skeleton h-[380px]" />,
});

/* ── Stats helpers (for the AI insights context) ── */
function mean(v: number[]): number | null {
  return v.length ? +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2) : null;
}

function median(v: number[]): number | null {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return +(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2).toFixed(2);
}

function pearsonR(pts: { x: number; y: number }[]): number | null {
  if (pts.length < 3) return null;
  const n = pts.length;
  const mx = pts.reduce((a, p) => a + p.x, 0) / n;
  const my = pts.reduce((a, p) => a + p.y, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const p of pts) {
    sxy += (p.x - mx) * (p.y - my);
    sxx += (p.x - mx) ** 2;
    syy += (p.y - my) ** 2;
  }
  if (sxx === 0 || syy === 0) return null;
  return +(sxy / Math.sqrt(sxx * syy)).toFixed(3);
}

/* ── Extra correlation panels (beyond income vs. math) ──
 * Each metric pairs independently against math_pct_prof: a school-level field
 * for the drilled-in scatter, and precomputed county_stats / state_stats
 * fields (avg / pearson_r / n) for the Pearson panel, mirroring the
 * income/math fields the export script already produces. */
interface ExtraMetric {
  key: string;
  label: string;
  xLabel: string;
  schoolField: string; // field on a district doc
  avgKey: string;       // field on county_stats / state_stats
  rKey: string;
  nKey: string;
}

const EXTRA_METRICS: ExtraMetric[] = [
  {
    key: 'student_teacher_ratio',
    label: 'Student:Teacher Ratio',
    xLabel: 'Students per Teacher',
    schoolField: 'student_teacher_ratio',
    avgKey: 'avg_student_teacher_ratio',
    rKey: 'pearson_r_student_teacher_ratio',
    nKey: 'n_student_teacher_ratio',
  },
  {
    key: 'walkability',
    label: 'Walkability',
    xLabel: 'Walkability Index',
    schoolField: 'avg_natwalkind',
    avgKey: 'avg_walkability',
    rKey: 'pearson_r_walkability',
    nKey: 'n_walkability',
  },
  {
    key: 'reading',
    label: 'Reading Proficiency',
    xLabel: 'Reading Prof. %',
    schoolField: 'read_high_pct',
    avgKey: 'avg_read_high_pct',
    rKey: 'pearson_r_reading',
    nKey: 'n_reading',
  },
];

/* ── Sorting helpers ── */
type SortDir = "asc" | "desc";
interface SortState {
  key: string;
  dir: SortDir;
}

function compareValues(a: unknown, b: unknown, dir: SortDir): number {
  // Nulls always sort last, regardless of direction
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  const mul = dir === "asc" ? 1 : -1;
  if (typeof a === "string" && typeof b === "string") {
    return mul * a.localeCompare(b);
  }
  return mul * ((a as number) - (b as number));
}

interface SortThProps {
  label: string;
  sortKey: string;
  sort: SortState;
  onSort: (key: string) => void;
  align?: "left" | "right";
}

function SortTh({ label, sortKey, sort, onSort, align = "left" }: SortThProps) {
  const active = sort.key === sortKey;
  return (
    <th
      onClick={() => onSort(sortKey)}
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      className={clsx(
        "kicker sticky top-0 z-[1] bg-surface px-4 py-3 font-normal cursor-pointer select-none whitespace-nowrap border-b border-line transition-colors hover:text-ink",
        align === "right" ? "text-right" : "text-left",
        active && "!text-ink"
      )}
      title={`Sort by ${label}`}
    >
      {label}
      <span className="inline-block w-3 text-accent">
        {active ? (sort.dir === "desc" ? "↓" : "↑") : ""}
      </span>
    </th>
  );
}

/* ── Presentation helpers ── */
const pct = (v: number | null | undefined) => (v != null ? `${v.toFixed(1)}%` : "—");

/** Math % with a proportional bar in the plasma colour for that band. */
function MathCell({ value }: { value: number | null | undefined }) {
  const color = mathColor(value);
  return (
    <td className="px-4 py-2.5 text-right">
      <div className="flex items-center justify-end gap-2.5">
        <div className="hidden sm:block h-1.5 w-20 rounded-full bg-sunken overflow-hidden">
          {value != null && (
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.min(100, Math.max(0, value))}%`, backgroundColor: color ?? undefined }}
            />
          )}
        </div>
        <span className="w-14 font-mono tabular-nums">{pct(value)}</span>
      </div>
    </td>
  );
}

function RCell({ r }: { r: number | null | undefined }) {
  return (
    <td
      className={clsx(
        "px-4 py-2.5 text-right font-mono tabular-nums",
        r != null && r > 0.3 ? "text-positive font-medium" : r != null && r < -0.3 ? "text-negative" : "text-muted"
      )}
    >
      {r != null ? r.toFixed(3) : "—"}
    </td>
  );
}

const rowCls = "border-t border-line transition-colors duration-500 hover:bg-hover";
const cell = "px-4 py-2.5";
const numCell = "px-4 py-2.5 text-right font-mono tabular-nums";

function Section({
  n,
  kicker,
  title,
  dek,
  children,
}: {
  n: string;
  kicker: string;
  title: React.ReactNode;
  dek?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rise space-y-6">
      <header className="grid gap-x-8 gap-y-2 border-t border-ink pt-4 md:grid-cols-[12rem_1fr]">
        <div className="kicker flex gap-3">
          <span className="text-accent">{n}</span>
          {kicker}
        </div>
        <div className="max-w-3xl">
          <h2 className="font-serif text-[1.9rem] leading-tight tracking-tight">{title}</h2>
          {dek && <p className="mt-2 text-muted leading-relaxed">{dek}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 py-4 pr-5 md:pl-5 md:first:pl-0">
      <div className="kicker">{label}</div>
      <div className="mt-1 font-serif text-3xl tabular-nums tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 truncate text-xs text-muted">{sub}</div>}
    </div>
  );
}

export default function Home() {
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [selectedCounty, setSelectedCounty] = useState<string | null>(null);
  const [countyNames, setCountyNames] = useState<Map<string, string>>(new Map());
  const [highlightSchool, setHighlightSchool] = useState<string | null>(null);
  const highlightRowRef = useRef<HTMLTableRowElement | null>(null);
  const states = useQuery(api.queries.listStates);
  const counties = useQuery(
    api.queries.listCountiesByState,
    selectedState ? { state: selectedState } : 'skip'
  );
  const schools = useQuery(
    api.queries.listDistrictsByCounty,
    selectedState && selectedCounty
      ? { state: selectedState, county_fips: selectedCounty }
      : 'skip'
  );
  const statedistricts = useQuery(
    api.queries.listDistrictsByState,
    selectedState && !selectedCounty ? { state: selectedState } : 'skip'
  );

  // Table sort state (shared slot; reset whenever drill level changes)
  const [sort, setSort] = useState<SortState>({ key: "math", dir: "desc" });
  const defaultDirs: Record<string, SortDir> = {
    name: "asc",
    schools: "desc",
    enrollment: "desc",
    math: "desc",
    income: "desc",
    pearson: "desc",
  };
  const handleSort = useCallback((key: string) => {
    setSort(prev =>
      prev.key === key
        ? { key, dir: prev.dir === "desc" ? "asc" : "desc" }
        : { key, dir: defaultDirs[key] ?? "desc" }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Patch 5: stable ref — prevents CountyMap useEffect from re-firing on every Convex tick
  const countyStatsMemo = useMemo(() => counties ?? [], [counties]);

  const scatterData = useMemo(() => {
    if (selectedState && selectedCounty) {
      return (schools ?? [])
        .filter((s): s is typeof s & { math_pct_prof: number; pct_high_income: number } =>
          s.pct_high_income != null && s.math_pct_prof != null
        )
        .map(s => ({ x: s.pct_high_income, y: s.math_pct_prof, name: s.school_name }));
    }
    if (selectedState) {
      return (statedistricts ?? [])
        .filter((s): s is typeof s & { math_pct_prof: number; pct_high_income: number } =>
          s.pct_high_income != null && s.math_pct_prof != null
        )
        .map(s => ({ x: s.pct_high_income, y: s.math_pct_prof, name: s.school_name }));
    }
    return (states ?? [])
      .filter((s): s is typeof s & { avg_pct_high_income: number; avg_math_pct_prof: number } =>
        s.avg_pct_high_income != null && s.avg_math_pct_prof != null
      )
      .map(s => ({
        x: s.avg_pct_high_income,
        y: s.avg_math_pct_prof,
        name: s.state,
      }));
  }, [selectedState, selectedCounty, schools, statedistricts, states]);

  const scatterLoading =
    (selectedState !== null && selectedCounty !== null && schools === undefined) ||
    (selectedState !== null && selectedCounty === null && statedistricts === undefined) ||
    (selectedState === null && states === undefined);

  const pearsonData = useMemo(() => {
    if (selectedState && selectedCounty) {
      const c = (counties ?? []).find(c => c.county_fips === selectedCounty);
      return {
        r: c?.pearson_r ?? null,
        count: c?.school_count,
        label: countyNames.get(selectedCounty) ?? selectedCounty,
      };
    }
    if (selectedState) {
      const s = (states ?? []).find(s => s.state === selectedState);
      return {
        r: s?.pearson_r ?? null,
        count: s?.school_count,
        label: ABBR_TO_NAME[selectedState] ?? selectedState,
      };
    }
    return null;
  }, [selectedState, selectedCounty, counties, states, countyNames]);

  const pearsonLoading =
    (selectedState !== null && selectedCounty !== null && counties === undefined) ||
    (selectedState !== null && selectedCounty === null && states === undefined);

  // Fixed extra scatter/Pearson panels — same drill-down logic as the
  // income-vs-math chart above, generalized over EXTRA_METRICS.
  const buildMetricPanel = useCallback(
    (m: ExtraMetric) => {
      type Row = Record<string, unknown> & { school_name: string; math_pct_prof?: number | null };

      let scatter: { x: number; y: number; name: string }[] = [];
      if (selectedState && selectedCounty) {
        scatter = ((schools ?? []) as unknown as Row[])
          .filter(s => s[m.schoolField] != null && s.math_pct_prof != null)
          .map(s => ({ x: s[m.schoolField] as number, y: s.math_pct_prof as number, name: s.school_name }));
      } else if (selectedState) {
        scatter = ((statedistricts ?? []) as unknown as Row[])
          .filter(s => s[m.schoolField] != null && s.math_pct_prof != null)
          .map(s => ({ x: s[m.schoolField] as number, y: s.math_pct_prof as number, name: s.school_name }));
      } else {
        scatter = ((states ?? []) as unknown as (Record<string, unknown> & { state: string; avg_math_pct_prof: number })[])
          .filter(s => s[m.avgKey] != null && s.avg_math_pct_prof != null)
          .map(s => ({ x: s[m.avgKey] as number, y: s.avg_math_pct_prof, name: s.state }));
      }

      let pearson: { r: number | null; count?: number; label: string } | null = null;
      if (selectedState && selectedCounty) {
        const c = (counties ?? []).find(c => c.county_fips === selectedCounty) as unknown as Record<string, unknown> | undefined;
        pearson = {
          r: (c?.[m.rKey] as number | null | undefined) ?? null,
          count: c?.[m.nKey] as number | undefined,
          label: countyNames.get(selectedCounty) ?? selectedCounty,
        };
      } else if (selectedState) {
        const s = (states ?? []).find(s => s.state === selectedState) as unknown as Record<string, unknown> | undefined;
        pearson = {
          r: (s?.[m.rKey] as number | null | undefined) ?? null,
          count: s?.[m.nKey] as number | undefined,
          label: ABBR_TO_NAME[selectedState] ?? selectedState,
        };
      }

      const loading =
        (selectedState !== null && selectedCounty !== null && schools === undefined) ||
        (selectedState !== null && selectedCounty === null && statedistricts === undefined) ||
        (selectedState === null && states === undefined);

      return { scatter, pearson, loading };
    },
    [selectedState, selectedCounty, schools, statedistricts, states, counties, countyNames]
  );

  const extraMetricPanels = useMemo(
    () => EXTRA_METRICS.map(m => ({ metric: m, ...buildMetricPanel(m) })),
    [buildMetricPanel]
  );

  useEffect(() => {
    if (!selectedState) return;
    setSelectedCounty(null);
    // Patch 4: clear stale names before new fetch
    setCountyNames(new Map());
    loadCountyNames(selectedState).then(setCountyNames).catch(() => {});
  }, [selectedState]);

  // Reset sort + highlight when drill level changes
  useEffect(() => {
    setSort({ key: "math", dir: "desc" });
    setHighlightSchool(null);
  }, [selectedState, selectedCounty]);

  // Scroll the highlighted school row into view, then let the flash fade
  useEffect(() => {
    if (!highlightSchool) return;
    highlightRowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(() => setHighlightSchool(null), 3000);
    return () => clearTimeout(t);
  }, [highlightSchool]);

  // Drill-through from scatter chart:
  //  • national view → point = a state → select it
  //  • county view   → point = a school → highlight its row in the table
  const handleScatterClick = useCallback(
    (name: string) => {
      if (!selectedState) {
        setSelectedState(name);
      } else if (selectedCounty) {
        setHighlightSchool(name);
      }
    },
    [selectedState, selectedCounty]
  );

  /* ── Sorted table rows ── */
  const sortedSchools = useMemo(() => {
    const acc: Record<string, (s: NonNullable<typeof schools>[number]) => unknown> = {
      name: s => s.school_name,
      enrollment: s => s.enrollment,
      math: s => s.math_pct_prof,
      income: s => s.pct_high_income,
    };
    const get = acc[sort.key] ?? acc.math;
    return (schools ?? []).slice().sort((a, b) => compareValues(get(a), get(b), sort.dir));
  }, [schools, sort]);

  const sortedCounties = useMemo(() => {
    const acc: Record<string, (c: NonNullable<typeof counties>[number]) => unknown> = {
      name: c => countyNames.get(c.county_fips) ?? c.county_fips,
      schools: c => c.school_count,
      math: c => c.avg_math_pct_prof,
      income: c => c.avg_pct_high_income,
      pearson: c => c.pearson_r,
    };
    const get = acc[sort.key] ?? acc.math;
    return (counties ?? []).slice().sort((a, b) => compareValues(get(a), get(b), sort.dir));
  }, [counties, sort, countyNames]);

  const sortedStates = useMemo(() => {
    const acc: Record<string, (s: NonNullable<typeof states>[number]) => unknown> = {
      name: s => ABBR_TO_NAME[s.state] ?? s.state,
      schools: s => s.school_count,
      math: s => s.avg_math_pct_prof,
      income: s => s.avg_pct_high_income,
      pearson: s => s.pearson_r,
    };
    const get = acc[sort.key] ?? acc.math;
    return (states ?? []).slice().sort((a, b) => compareValues(get(a), get(b), sort.dir));
  }, [states, sort]);

  /* ── AI insights context: snapshot of the on-screen data + derived stats ── */
  const insightsLevel = selectedState && selectedCounty ? 'county' : selectedState ? 'state' : 'national';
  const insightsReady =
    insightsLevel === 'county'
      ? schools !== undefined
      : insightsLevel === 'state'
      ? counties !== undefined
      : states !== undefined;

  const insightsContext = useMemo<InsightsContext>(() => {
    const level = insightsLevel as InsightsContext['level'];
    const label =
      level === 'county'
        ? `${countyNames.get(selectedCounty!) ?? selectedCounty}, ${ABBR_TO_NAME[selectedState!] ?? selectedState}`
        : level === 'state'
        ? ABBR_TO_NAME[selectedState!] ?? selectedState!
        : 'United States';

    let rows: Record<string, unknown>[];
    if (level === 'county') {
      rows = (schools ?? []).map(s => ({
        name: s.school_name,
        enrollment: s.enrollment ?? null,
        math_pct_prof: s.math_pct_prof ?? null,
        pct_high_income: s.pct_high_income ?? null,
      }));
    } else if (level === 'state') {
      rows = (counties ?? []).map(c => ({
        name: countyNames.get(c.county_fips) ?? c.county_fips,
        school_count: c.school_count,
        avg_math_pct_prof: c.avg_math_pct_prof,
        avg_pct_high_income: c.avg_pct_high_income,
        pearson_r: c.pearson_r ?? null,
      }));
    } else {
      rows = (states ?? []).map(s => ({
        name: ABBR_TO_NAME[s.state] ?? s.state,
        school_count: s.school_count,
        avg_math_pct_prof: s.avg_math_pct_prof,
        avg_pct_high_income: s.avg_pct_high_income,
        pearson_r: s.pearson_r ?? null,
      }));
    }

    const byMath = [...scatterData].sort((a, b) => b.y - a.y);
    const stats = {
      row_count: rows.length,
      paired_income_math_points: scatterData.length,
      mean_math_pct: mean(scatterData.map(d => d.y)),
      median_math_pct: median(scatterData.map(d => d.y)),
      mean_high_income_pct: mean(scatterData.map(d => d.x)),
      median_high_income_pct: median(scatterData.map(d => d.x)),
      pearson_r_on_screen: pearsonR(scatterData),
      pearson_r_precomputed: pearsonData?.r ?? null,
      top_3_by_math: byMath.slice(0, 3).map(d => ({ name: d.name, math: d.y, income: d.x })),
      bottom_3_by_math: byMath.slice(-3).reverse().map(d => ({ name: d.name, math: d.y, income: d.x })),
    };

    return { level, label, stats, rows: rows.slice(0, 400) };
  }, [insightsLevel, selectedState, selectedCounty, schools, counties, states, countyNames, scatterData, pearsonData]);

  const loaded = states !== undefined;
  const count = states?.length ?? 0;
  const totalSchools = states?.reduce((sum, s) => sum + s.school_count, 0) ?? 0;
  const ready = loaded && count > 0;

  const stateName = selectedState ? ABBR_TO_NAME[selectedState] ?? selectedState : null;
  const countyName = selectedCounty ? countyNames.get(selectedCounty) ?? selectedCounty : null;
  const unitLabel = selectedState && selectedCounty ? "schools" : selectedState ? "districts" : "states";

  /* ── KPI strip for the current drill level ── */
  const kpi = useMemo(() => {
    const schoolsHere =
      selectedState && selectedCounty
        ? schools?.length
        : selectedState
        ? states?.find(s => s.state === selectedState)?.school_count
        : totalSchools;
    return {
      schools: schoolsHere,
      math: mean(scatterData.map(d => d.y)),
      income: mean(scatterData.map(d => d.x)),
      r: pearsonData ? pearsonData.r : pearsonR(scatterData),
      rSub: pearsonData ? `within ${pearsonData.label}` : `across ${scatterData.length} states`,
    };
  }, [selectedState, selectedCounty, schools, states, totalSchools, pearsonData, scatterData]);

  const goNational = () => { setSelectedState(null); setSelectedCounty(null); };

  return (
    <div>
      {/* ── Sticky masthead + breadcrumb ── */}
      <div className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-5 py-3 sm:px-8">
          <button onClick={goNational} className="font-serif text-lg font-semibold tracking-tight whitespace-nowrap">
            Ed<span className="text-accent">·</span>Outcomes
          </button>
          <nav aria-label="Drill level" className="flex min-w-0 items-center gap-1.5 text-sm">
            <span className="text-line-strong">/</span>
            <button
              onClick={goNational}
              className={clsx("truncate rounded px-1.5 py-0.5 hover:bg-hover", !selectedState ? "font-medium" : "text-muted")}
            >
              United States
            </button>
            {selectedState && (
              <>
                <span className="text-line-strong">/</span>
                <button
                  onClick={() => setSelectedCounty(null)}
                  className={clsx("truncate rounded px-1.5 py-0.5 hover:bg-hover", !selectedCounty ? "font-medium" : "text-muted")}
                >
                  {stateName}
                </button>
              </>
            )}
            {selectedCounty && (
              <>
                <span className="text-line-strong">/</span>
                <span className="truncate px-1.5 py-0.5 font-medium">{countyName}</span>
              </>
            )}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span
              className={clsx(
                "hidden sm:inline-flex items-center gap-2 font-mono text-[0.7rem] uppercase tracking-wider",
                ready ? "text-muted" : "text-[var(--trend)]"
              )}
            >
              <span className={clsx("h-1.5 w-1.5 rounded-full", ready ? "bg-positive animate-pulse" : "bg-[var(--trend)]")} />
              {!loaded ? "Connecting" : count === 0 ? "No data" : "Live"}
            </span>
            <ThemeToggle />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl space-y-16 px-5 pb-20 sm:px-8">
        {/* ── Hero ── */}
        <header className="rise pt-12 sm:pt-16">
          <div className="kicker">Grade-8 math · US public schools · 2020–21</div>
          <h1 className="mt-4 max-w-4xl font-serif text-[2.6rem] leading-[1.05] tracking-tight sm:text-6xl">
            Does affluence predict <em className="text-accent">math scores</em>?
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">
            How closely does household wealth track grade-8 math proficiency across{" "}
            {loaded ? `${totalSchools.toLocaleString()} schools` : "US schools"} in {loaded ? count : "…"} states?
            Pick a state to see its counties, then a county to see its schools. Experimental — read the numbers
            as directional.
          </p>

          {/* KPI strip */}
          <div className="mt-10 grid grid-cols-2 border-y border-line md:grid-cols-4 md:divide-x md:divide-line">
            <Kpi
              label="Schools"
              value={kpi.schools != null ? kpi.schools.toLocaleString() : "—"}
              sub={countyName ?? stateName ?? "nationwide"}
            />
            <Kpi label="Avg. math proficient" value={pct(kpi.math)} sub={`mean of ${unitLabel}`} />
            <Kpi label="Avg. high-income share" value={pct(kpi.income)} sub="households $150k+" />
            <Kpi label="Income ↔ math r" value={kpi.r != null ? kpi.r.toFixed(2) : "—"} sub={kpi.rSub} />
          </div>
        </header>

        {/* ── 01 Map + correlation ── */}
        <Section
          n="01"
          kicker="The map"
          title={
            selectedCounty
              ? <>Schools in {countyName}</>
              : selectedState
              ? <>Counties of {stateName}</>
              : <>Proficiency, state by state</>
          }
          dek={
            selectedCounty
              ? "Each dot is a school, coloured by its math proficiency. Click one to find it in the table."
              : selectedState
              ? "Counties coloured by average math proficiency. Click one to see its schools."
              : "States coloured by average grade-8 math proficiency. Click a state — or a dot in the chart — to drill in."
          }
        >
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="h-[420px] lg:col-span-2 lg:h-[560px]">
              {ready ? (
                selectedState ? (
                  counties === undefined ? (
                    <div className="skeleton h-full w-full" />
                  ) : (
                    <CountyMap
                      stateAbbr={selectedState}
                      countyStats={countyStatsMemo}
                      onBack={goNational}
                      onCountySelect={setSelectedCounty}
                      selectedCounty={selectedCounty}
                      schools={selectedCounty ? schools ?? [] : []}
                      onSchoolSelect={setHighlightSchool}
                    />
                  )
                ) : (
                  <ChoroplethMap stateStats={states!} onStateSelect={setSelectedState} />
                )
              ) : (
                <div className="flex h-full items-center justify-center rounded-[14px] border border-dashed border-line-strong text-sm text-muted">
                  {!loaded ? "Connecting to Convex…" : "No data — run npx convex import"}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-5">
              <PearsonPanel
                pearsonR={pearsonData?.r ?? null}
                label={pearsonData?.label}
                schoolCount={pearsonData?.count}
                noSelection={pearsonData === null}
                loading={pearsonLoading}
              />
              <div>
                <div className="kicker mb-2">High-income share vs. math, by {unitLabel.replace(/s$/, "")}</div>
                <ScatterPlot
                  data={scatterData}
                  loading={scatterLoading}
                  xLabel={selectedState ? "Income %" : "Avg Income %"}
                  yLabel={selectedState ? "Math %" : "Avg Math %"}
                  onPointClick={handleScatterClick}
                  height={selectedState ? 250 : 280}
                />
              </div>
            </div>
          </div>
        </Section>

        {ready && (
          <>
            {/* ── 02 Other factors ── */}
            <Section
              n="02"
              kicker="Beyond income"
              title="What else moves with math scores?"
              dek="The same lens, pointed at class size, neighbourhood walkability and reading proficiency."
            >
              <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                {extraMetricPanels.map(({ metric, scatter, pearson, loading }) => (
                  <div key={metric.key} className="flex flex-col gap-3">
                    <h3 className="font-serif text-xl">{metric.label}</h3>
                    <PearsonPanel
                      pearsonR={pearson?.r ?? null}
                      label={pearson?.label}
                      schoolCount={pearson?.count}
                      noSelection={pearson === null}
                      loading={loading}
                      compact
                    />
                    <ScatterPlot
                      data={scatter}
                      loading={loading}
                      xLabel={selectedState ? metric.xLabel : `Avg ${metric.xLabel}`}
                      yLabel={selectedState ? "Math %" : "Avg Math %"}
                      onPointClick={handleScatterClick}
                      height={230}
                    />
                  </div>
                ))}
              </div>
            </Section>

            {/* ── 03 AI read ── */}
            <Section
              n="03"
              kicker="The AI read"
              title={<>What stands out in {insightsContext.label}</>}
              dek="A generated narrative over the figures on screen, plus open-ended questions."
            >
              <InsightsPanel context={insightsContext} ready={insightsReady} />
            </Section>

            {/* ── 04 Income brackets ── */}
            <Section
              n="04"
              kicker="Distribution"
              title="Proficiency by income bracket"
              dek={
                <>
                  {selectedState && selectedCounty
                    ? `Schools in ${countyName}`
                    : selectedState
                    ? `Districts in ${stateName}`
                    : "State averages across the US"}
                  , split into income quintiles — each bar holds about a fifth of the {unitLabel}.
                </>
              }
            >
              <IncomeBracketChart data={scatterData} loading={scatterLoading} unitLabel={unitLabel} />
            </Section>

            {/* ── 05 Table ── */}
            <Section
              n="05"
              kicker="The data"
              title={
                selectedState && selectedCounty
                  ? <>Every school in {countyName}</>
                  : selectedState
                  ? <>Counties of {stateName}</>
                  : "State summaries"
              }
              dek={
                selectedState && selectedCounty
                  ? "Grade-8 math proficiency by school. Click a column to sort."
                  : "Click a row to drill in, or a column header to sort."
              }
            >
              <div className="card max-h-[640px] overflow-auto">
                <table className="w-full text-[0.95rem]">
                  {selectedState && selectedCounty ? (
                    /* ── Level 3: schools ── */
                    <>
                      <thead>
                        <tr>
                          <SortTh label="School" sortKey="name" sort={sort} onSort={handleSort} />
                          <SortTh label="Enrollment" sortKey="enrollment" sort={sort} onSort={handleSort} align="right" />
                          <SortTh label="Math prof." sortKey="math" sort={sort} onSort={handleSort} align="right" />
                          <SortTh label="High income" sortKey="income" sort={sort} onSort={handleSort} align="right" />
                        </tr>
                      </thead>
                      <tbody>
                        {schools === undefined ? (
                          <tr>
                            <td colSpan={4} className="px-4 py-6 text-center text-muted">Loading…</td>
                          </tr>
                        ) : (
                          sortedSchools.map(s => {
                            const isHighlighted = highlightSchool === s.school_name;
                            return (
                              <tr
                                key={s._id}
                                ref={isHighlighted ? highlightRowRef : undefined}
                                className={clsx(rowCls, isHighlighted && "bg-accent/20")}
                              >
                                <td className={cell}>{s.school_name}</td>
                                <td className={numCell}>{s.enrollment != null ? s.enrollment.toLocaleString() : "—"}</td>
                                <MathCell value={s.math_pct_prof} />
                                <td className={numCell}>{pct(s.pct_high_income)}</td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </>
                  ) : selectedState ? (
                    /* ── Level 2: counties ── */
                    <>
                      <thead>
                        <tr>
                          <SortTh label="County" sortKey="name" sort={sort} onSort={handleSort} />
                          <SortTh label="Schools" sortKey="schools" sort={sort} onSort={handleSort} align="right" />
                          <SortTh label="Math prof." sortKey="math" sort={sort} onSort={handleSort} align="right" />
                          <SortTh label="High income" sortKey="income" sort={sort} onSort={handleSort} align="right" />
                          <SortTh label="Pearson r" sortKey="pearson" sort={sort} onSort={handleSort} align="right" />
                        </tr>
                      </thead>
                      <tbody>
                        {sortedCounties.map(c => (
                          <tr
                            key={c.county_fips}
                            onClick={() => setSelectedCounty(c.county_fips)}
                            className={clsx(rowCls, "cursor-pointer")}
                          >
                            <td className={cell}>{countyNames.get(c.county_fips) ?? c.county_fips}</td>
                            <td className={numCell}>{c.school_count.toLocaleString()}</td>
                            <MathCell value={c.avg_math_pct_prof} />
                            <td className={numCell}>{pct(c.avg_pct_high_income)}</td>
                            <RCell r={c.pearson_r} />
                          </tr>
                        ))}
                      </tbody>
                    </>
                  ) : (
                    /* ── Level 1: states ── */
                    <>
                      <thead>
                        <tr>
                          <SortTh label="State" sortKey="name" sort={sort} onSort={handleSort} />
                          <SortTh label="Schools" sortKey="schools" sort={sort} onSort={handleSort} align="right" />
                          <SortTh label="Math prof." sortKey="math" sort={sort} onSort={handleSort} align="right" />
                          <SortTh label="High income" sortKey="income" sort={sort} onSort={handleSort} align="right" />
                          <SortTh label="Pearson r" sortKey="pearson" sort={sort} onSort={handleSort} align="right" />
                        </tr>
                      </thead>
                      <tbody>
                        {sortedStates.map(s => (
                          <tr
                            key={s.state}
                            onClick={() => setSelectedState(s.state)}
                            className={clsx(rowCls, "cursor-pointer")}
                          >
                            <td className={clsx(cell, "font-medium")}>{ABBR_TO_NAME[s.state] ?? s.state}</td>
                            <td className={numCell}>{s.school_count.toLocaleString()}</td>
                            <MathCell value={s.avg_math_pct_prof} />
                            <td className={numCell}>{pct(s.avg_pct_high_income)}</td>
                            <RCell r={s.pearson_r} />
                          </tr>
                        ))}
                      </tbody>
                    </>
                  )}
                </table>
              </div>
            </Section>
          </>
        )}
      </div>
    </div>
  );
}
