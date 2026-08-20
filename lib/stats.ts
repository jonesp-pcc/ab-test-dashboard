// Statistical helpers shared across metrics comparisons.
// Originally inline in the demo dashboard artifact; split out here since
// funnel.ts/upsell.ts and the eventual components all need the same
// z-test/t-test logic rather than each reimplementing it.

function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741,
        a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

export function normCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.sqrt(2)));
}

export function pFromZ(z: number): number {
  return 2 * (1 - normCdf(Math.abs(z)));
}

export interface RateAgg {
  sessions: number;
  conversions: number;
}

export interface StatTestResult {
  diff: number;
  p: number;
  significant: boolean;
  ciLow: number;
  ciHigh: number;
}

// Two-proportion z-test — pooled SE for the test statistic, unpooled SE for
// the 95% CI. Matches the convention already validated in the Power BI model
// (see pcc_ab_test_technical_reference.md's DAX significance measures).
export function zTestCVR(a: RateAgg, b: RateAgg): StatTestResult | null {
  const { sessions: n1, conversions: x1 } = a;
  const { sessions: n2, conversions: x2 } = b;
  if (!n1 || !n2) return null;
  const p1 = x1 / n1, p2 = x2 / n2;
  const pooledP = (x1 + x2) / (n1 + n2);
  const sePooled = Math.sqrt(pooledP * (1 - pooledP) * (1 / n1 + 1 / n2));
  const z = sePooled ? (p1 - p2) / sePooled : 0;
  const p = pFromZ(z);
  const seUnpooled = Math.sqrt((p1 * (1 - p1)) / n1 + (p2 * (1 - p2)) / n2);
  const diff = p1 - p2;
  return {
    diff, p, significant: p < 0.05,
    ciLow: diff - 1.96 * seUnpooled, ciHigh: diff + 1.96 * seUnpooled,
  };
}

export interface RevenueAgg {
  sessions: number;
  total_revenue: number;
  sum_revenue_sq: number | null;
}

// Welch's t-test on session-grain revenue, p-value approximated with the
// normal distribution (sample sizes here are large enough that this is
// reasonable for a dashboard; a rigorous t-distribution CDF isn't worth
// the added weight). Returns null when either side lacks sum_revenue_sq —
// e.g. a Method A test, or any test whose pipeline doesn't capture it.
export function welchTestRPS(a: RevenueAgg, b: RevenueAgg): StatTestResult | null {
  if (a.sum_revenue_sq == null || b.sum_revenue_sq == null) return null;
  const n1 = a.sessions, n2 = b.sessions;
  if (!n1 || !n2) return null;
  const mean1 = a.total_revenue / n1, mean2 = b.total_revenue / n2;
  const var1 = Math.max(0, a.sum_revenue_sq / n1 - mean1 * mean1);
  const var2 = Math.max(0, b.sum_revenue_sq / n2 - mean2 * mean2);
  const se = Math.sqrt(var1 / n1 + var2 / n2);
  const t = se ? (mean1 - mean2) / se : 0;
  const p = pFromZ(t);
  const diff = mean1 - mean2;
  return {
    diff, p, significant: p < 0.05,
    ciLow: diff - 1.96 * se, ciHigh: diff + 1.96 * se,
  };
}

// ---------------------------------------------------------------------------
// Sample Ratio Mismatch (SRM) — chi-square goodness-of-fit test.
//
// Compares observed session counts per variant against the intended
// allocation. A significant result (p < 0.05, conventionally p < 0.001 for
// SRM) means bucketing wasn't balanced, so CVR comparisons may be biased by
// population differences rather than the treatments — the result should be
// treated as indicative, not certifiable.
//
// For Test 5: Antique (the plan's 5%) is not present in BigQuery, so the
// plan's 5 / 23.75 / 23.75 / 23.75 / 23.75 split renormalizes to an even
// 25% each across the four in-BQ variants (v4.0-v4.3). Pass whatever
// expected proportions apply; they must sum to 1 and align with `observed`.
// ---------------------------------------------------------------------------

export interface SrmResult {
  chiSquare: number;
  df: number;
  p: number;
  mismatch: boolean; // true if p < 0.05
  rows: {
    label: string;
    observed: number;
    expected: number;
    share: number;
    delta: number;
  }[];
}

// Chi-square survival function via the Wilson-Hilferty normal approximation.
// Accurate enough for flagging SRM; not a substitute for an exact CDF at the
// extreme tails, but SRM decisions live around p≈0.05/0.001 where it's fine.
function chiSquareP(chi: number, df: number): number {
  if (chi <= 0) return 1;
  const x = chi / df;
  const z = (Math.cbrt(x) - (1 - 2 / (9 * df))) / Math.sqrt(2 / (9 * df));
  return 1 - normCdf(z);
}

export function srmTest(
  observed: { label: string; sessions: number }[],
  expectedProportions: number[],
): SrmResult | null {
  if (!observed.length || observed.length !== expectedProportions.length) return null;
  const total = observed.reduce((s, o) => s + o.sessions, 0);
  if (!total) return null;
  let chiSquare = 0;
  const rows = observed.map((o, i) => {
    const expected = total * expectedProportions[i];
    chiSquare += expected > 0 ? Math.pow(o.sessions - expected, 2) / expected : 0;
    return {
      label: o.label,
      observed: o.sessions,
      expected,
      share: o.sessions / total,
      delta: o.sessions - expected,
    };
  });
  const df = observed.length - 1;
  const p = chiSquareP(chiSquare, df);
  return { chiSquare, df, p, mismatch: p < 0.05, rows };
}
