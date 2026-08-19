"use client";

import { useState, useEffect, useMemo, type ReactNode } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { TEST_REGISTRY, getModulesForTest } from "@/lib/testRegistry";
import { zTestCVR, welchTestRPS, type RateAgg, type RevenueAgg } from "@/lib/stats";
import { buildFunnel, errorRates, type FunnelRow } from "@/lib/funnel";
import { upsellAcceptRates, comparePlacements, type UpsellRow } from "@/lib/upsell";
import { buildItemBreakdown, type ProductMixRow } from "@/lib/productMix";

// NOTE: this page is intentionally self-contained (no components/ imports).
// The directory tree in the build guide anticipates splitting MetricCard,
// TrendChart, PairwiseTable, FunnelChart, and UpsellPanel into their own
// files under components/ — that split hasn't been done yet, so importing
// from components/ here would break on files that don't exist. Everything
// renders inline below; treat the components/ split as a follow-up refactor,
// not a blocker for this page working today.

const LIVE_TESTS = TEST_REGISTRY.filter((t) => t.status === "live");

type DeviceFilter = "all" | "desktop" | "mobile" | "other";

interface MetricsRow {
  test_id: string;
  session_date: string;
  variant_id: string;
  device_category: string;
  sessions: number;
  engaged_sessions: number | null;
  conversions: number;
  total_revenue: number;
  items_purchased: number;
  sum_revenue_sq: number | null;
  sum_items_sq: number | null;
  add_to_cart_sessions: number;
  purchase_redirect_sessions: number;
  begin_checkout_sessions: number;
  add_payment_info_sessions: number;
  checkout_error_sessions: number;
  availability_fetch_error_sessions: number;
}

interface ApiResponse {
  metrics: MetricsRow[];
  productMix: ProductMixRow[];
  productMixAvailable: boolean;
  upsell: UpsellRow[];
  upsellAvailable: boolean;
  error?: string;
}

interface VariantAggregate extends RateAgg, RevenueAgg, FunnelRow {
  variant: string;
}

function fmtInt(n: number) {
  return Math.round(n).toLocaleString("en-US");
}
function fmtCompact(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return Math.round(n).toLocaleString("en-US");
}
function fmtPct(x: number | null, d = 2) {
  if (x == null || Number.isNaN(x)) return "—";
  return (x * 100).toFixed(d) + "%";
}
function fmtSignedPct(x: number | null, d = 1) {
  if (x == null || Number.isNaN(x)) return "—";
  const sign = x > 0 ? "+" : "";
  return sign + (x * 100).toFixed(d) + "%";
}
function fmtCurrency(n: number | null) {
  if (n == null || Number.isNaN(n)) return "—";
  const abs = Math.abs(n), sign = n < 0 ? "-" : "";
  if (abs >= 1e6) return sign + "$" + (abs / 1e6).toFixed(2) + "M";
  return sign + "$" + Math.round(abs).toLocaleString("en-US");
}
function prettyVariant(raw: string) {
  if (!raw) return raw;
  return raw.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

// Window ends "yesterday," matching the scheduled queries' own
// window_end convention (today's GA4 data isn't finalized yet).
function dateWindow(days: number) {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: fmt(start), endDate: fmt(end) };
}

export default function DashboardPage() {
  const [testId, setTestId] = useState(LIVE_TESTS[0]?.testId ?? "");
  const [device, setDevice] = useState<DeviceFilter>("all");
  const [windowDays, setWindowDays] = useState<7 | 14>(14);
  const [baselineVariant, setBaselineVariant] = useState<string | null>(null);
  const [comparisonVariant, setComparisonVariant] = useState<string | null>(null);

  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { startDate, endDate } = useMemo(() => dateWindow(windowDays), [windowDays]);
  const modules = useMemo(() => getModulesForTest(testId), [testId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(
      `/api/ab-test-performance?testId=${encodeURIComponent(testId)}&startDate=${startDate}&endDate=${endDate}`
    )
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `Request failed: ${res.status}`);
        return json as ApiResponse;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message ?? "Request failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [testId, startDate, endDate]);

  const variants = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.metrics.map((r) => r.variant_id)));
  }, [data]);

  // Reset variant selection whenever the available variant list changes
  // (new test selected, or data just loaded) — avoids pointing at a
  // variant that doesn't exist for the current test.
  useEffect(() => {
    if (variants.length === 0) return;
    setBaselineVariant((prev) => (prev && variants.includes(prev) ? prev : variants[0]));
    setComparisonVariant((prev) =>
      prev && variants.includes(prev) && prev !== variants[0]
        ? prev
        : variants.find((v) => v !== variants[0]) ?? null
    );
  }, [variants]);

  function aggregateVariant(variantId: string): VariantAggregate | null {
    if (!data) return null;
    const rows = data.metrics.filter(
      (r) => r.variant_id === variantId && (device === "all" || r.device_category === device)
    );
    if (rows.length === 0) {
      return {
        variant: variantId, sessions: 0, conversions: 0, total_revenue: 0, sum_revenue_sq: null,
        add_to_cart_sessions: 0, purchase_redirect_sessions: 0, begin_checkout_sessions: 0,
        add_payment_info_sessions: 0, checkout_error_sessions: 0, availability_fetch_error_sessions: 0,
      };
    }
    const sum = (key: keyof MetricsRow) => rows.reduce((s, r) => s + ((r[key] as number) ?? 0), 0);
    const sumRevenueSqAvailable = rows.every((r) => r.sum_revenue_sq != null);
    return {
      variant: variantId,
      sessions: sum("sessions"),
      conversions: sum("conversions"),
      total_revenue: sum("total_revenue"),
      sum_revenue_sq: sumRevenueSqAvailable ? sum("sum_revenue_sq") : null,
      add_to_cart_sessions: sum("add_to_cart_sessions"),
      purchase_redirect_sessions: sum("purchase_redirect_sessions"),
      begin_checkout_sessions: sum("begin_checkout_sessions"),
      add_payment_info_sessions: sum("add_payment_info_sessions"),
      checkout_error_sessions: sum("checkout_error_sessions"),
      availability_fetch_error_sessions: sum("availability_fetch_error_sessions"),
    };
  }

  function aggregateUpsell(variantId: string): UpsellRow {
    const rows = (data?.upsell ?? []).filter(
      (r: any) =>
        r.variant_id === variantId && (device === "all" || r.device_category === device)
    );
    const sum = (key: keyof UpsellRow) => rows.reduce((s: number, r: any) => s + (r[key] ?? 0), 0);
    return {
      upsell_inline_impression_sessions: sum("upsell_inline_impression_sessions"),
      upsell_inline_accept_sessions: sum("upsell_inline_accept_sessions"),
      upsell_interstitial_impression_sessions: sum("upsell_interstitial_impression_sessions"),
      upsell_interstitial_accept_sessions: sum("upsell_interstitial_accept_sessions"),
    };
  }

  function productMixForVariant(variantId: string): ProductMixRow[] {
    return (data?.productMix ?? []).filter(
      (r: any) =>
        r.variant_id === variantId && (device === "all" || r.device_category === device)
    );
  }

  const baselineAgg = baselineVariant ? aggregateVariant(baselineVariant) : null;
  const comparisonAgg = comparisonVariant ? aggregateVariant(comparisonVariant) : null;

  const cvrTest = baselineAgg && comparisonAgg ? zTestCVR(baselineAgg, comparisonAgg) : null;
  const rpsTest = baselineAgg && comparisonAgg ? welchTestRPS(baselineAgg, comparisonAgg) : null;

  const trendData = useMemo(() => {
    if (!data) return [];
    const activeDates = Array.from(
      new Set(data.metrics.map((r) => r.session_date))
    ).sort();
    return activeDates.map((date) => {
      const point: Record<string, number | string> = { date: date.slice(5) };
      variants.forEach((v) => {
        const rows = data.metrics.filter(
          (r) => r.session_date === date && r.variant_id === v &&
            (device === "all" || r.device_category === device)
        );
        point[v] = rows.reduce((s, r) => s + r.sessions, 0);
      });
      return point;
    });
  }, [data, variants, device]);

  const pairwise = useMemo(() => {
    const out: { a: VariantAggregate; b: VariantAggregate; cvr: ReturnType<typeof zTestCVR>; rps: ReturnType<typeof welchTestRPS> }[] = [];
    for (let i = 0; i < variants.length; i++) {
      for (let j = i + 1; j < variants.length; j++) {
        const a = aggregateVariant(variants[i]);
        const b = aggregateVariant(variants[j]);
        if (!a || !b) continue;
        out.push({ a, b, cvr: zTestCVR(a, b), rps: welchTestRPS(a, b) });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, variants, device]);

  const wantsUpsellPanel = data?.upsellAvailable && baselineVariant && comparisonVariant;
  const wantsProductMixPanel = data?.productMixAvailable && baselineVariant;

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 20px 48px", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>Packages experiment dashboard</h1>
      <p style={{ fontSize: 13, color: "#666", marginBottom: 20 }}>
        Scope: {LIVE_TESTS.map((t) => t.label).join(", ")} · impression-based (Method B)
      </p>

      {/* Filters */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", marginBottom: 20, padding: 14, background: "#f7f7f5", borderRadius: 10 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
          Test
          <select value={testId} onChange={(e) => setTestId(e.target.value)}>
            {LIVE_TESTS.map((t) => (
              <option key={t.testId} value={t.testId}>{t.label}</option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
          Baseline
          <select value={baselineVariant ?? ""} onChange={(e) => setBaselineVariant(e.target.value)}>
            {variants.map((v) => (
              <option key={v} value={v}>{prettyVariant(v)}</option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
          Comparison
          <select value={comparisonVariant ?? ""} onChange={(e) => setComparisonVariant(e.target.value)}>
            {variants.map((v) => (
              <option key={v} value={v} disabled={v === baselineVariant}>{prettyVariant(v)}</option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
          Device
          <select value={device} onChange={(e) => setDevice(e.target.value as DeviceFilter)}>
            <option value="all">All</option>
            <option value="desktop">Desktop</option>
            <option value="mobile">Mobile</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
          Window
          <select value={windowDays} onChange={(e) => setWindowDays(Number(e.target.value) as 7 | 14)}>
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
          </select>
        </label>
      </div>

      {loading && <p style={{ color: "#666" }}>Loading…</p>}
      {error && <p style={{ color: "#b3261e" }}>Couldn&apos;t load data: {error}</p>}

      {!loading && !error && data && baselineAgg && comparisonAgg && (
        <>
          {/* KPI cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginBottom: 24 }}>
            <MetricCard
              label="Sessions"
              baselineLabel={prettyVariant(baselineVariant!)}
              comparisonLabel={prettyVariant(comparisonVariant!)}
              baselineValue={fmtCompact(baselineAgg.sessions)}
              comparisonValue={fmtCompact(comparisonAgg.sessions)}
              lift={baselineAgg.sessions ? (comparisonAgg.sessions - baselineAgg.sessions) / baselineAgg.sessions : null}
              signal={null}
            />
            <MetricCard
              label="Conversion rate"
              baselineLabel={prettyVariant(baselineVariant!)}
              comparisonLabel={prettyVariant(comparisonVariant!)}
              baselineValue={fmtPct(baselineAgg.sessions ? baselineAgg.conversions / baselineAgg.sessions : 0)}
              comparisonValue={fmtPct(comparisonAgg.sessions ? comparisonAgg.conversions / comparisonAgg.sessions : 0)}
              lift={cvrTest ? -cvrTest.diff / (baselineAgg.conversions / baselineAgg.sessions) : null}
              signal={cvrTest ? (cvrTest.significant ? "significant" : "not-significant") : "unavailable"}
            />
            <MetricCard
              label="Revenue per session"
              baselineLabel={prettyVariant(baselineVariant!)}
              comparisonLabel={prettyVariant(comparisonVariant!)}
              baselineValue={fmtCurrency(baselineAgg.sessions ? baselineAgg.total_revenue / baselineAgg.sessions : 0)}
              comparisonValue={fmtCurrency(comparisonAgg.sessions ? comparisonAgg.total_revenue / comparisonAgg.sessions : 0)}
              lift={rpsTest ? -rpsTest.diff / (baselineAgg.total_revenue / baselineAgg.sessions) : null}
              signal={rpsTest ? (rpsTest.significant ? "significant" : "not-significant") : "unavailable"}
              caveat={!rpsTest ? "Requires session-grain revenue variance — not available for this test/selection." : undefined}
            />
            <MetricCard
              label="Average order value"
              baselineLabel={prettyVariant(baselineVariant!)}
              comparisonLabel={prettyVariant(comparisonVariant!)}
              baselineValue={fmtCurrency(baselineAgg.conversions ? baselineAgg.total_revenue / baselineAgg.conversions : 0)}
              comparisonValue={fmtCurrency(comparisonAgg.conversions ? comparisonAgg.total_revenue / comparisonAgg.conversions : 0)}
              lift={null}
              signal="unavailable"
              caveat="Approximate — order-grain variance isn't in the pipeline. No significance claimed."
            />
          </div>

          {/* Trend chart */}
          <Panel title="Sessions trend">
            <div style={{ width: "100%", height: 240 }}>
              <ResponsiveContainer>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" fontSize={11} />
                  <YAxis fontSize={11} width={44} />
                  <Tooltip />
                  <Legend formatter={(v) => prettyVariant(String(v))} />
                  {variants.map((v, i) => (
                    <Line key={v} type="monotone" dataKey={v} stroke={["#4A7C82", "#C97B3D", "#2E9E7C"][i % 3]} strokeWidth={2} dot={{ r: 2 }} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          {/* Pairwise comparison */}
          <Panel title="Pairwise comparison — all variants">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "#666", fontSize: 11, textTransform: "uppercase" }}>
                  <th style={{ padding: 8 }}>Pair</th>
                  <th style={{ padding: 8 }}>Sessions A / B</th>
                  <th style={{ padding: 8 }}>CVR signal</th>
                  <th style={{ padding: 8 }}>RPS signal</th>
                </tr>
              </thead>
              <tbody>
                {pairwise.map(({ a, b, cvr, rps }, idx) => (
                  <tr key={idx} style={{ borderTop: "1px solid #eee" }}>
                    <td style={{ padding: 8 }}>{prettyVariant(a.variant)} vs {prettyVariant(b.variant)}</td>
                    <td style={{ padding: 8 }}>{fmtInt(a.sessions)} / {fmtInt(b.sessions)}</td>
                    <td style={{ padding: 8 }}>
                      <SignalBadge status={cvr ? (cvr.significant ? "significant" : "not-significant") : "unavailable"} />
                    </td>
                    <td style={{ padding: 8 }}>
                      <SignalBadge status={rps ? (rps.significant ? "significant" : "not-significant") : "unavailable"} text={!rps ? "n/a — no variance data" : undefined} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          {/* Checkout funnel */}
          <Panel title="Checkout funnel">
            <FunnelView agg={baselineAgg} label={prettyVariant(baselineVariant!)} />
            <div style={{ height: 12 }} />
            <FunnelView agg={comparisonAgg} label={prettyVariant(comparisonVariant!)} />
          </Panel>

          {/* Upsell placement comparison */}
          {wantsUpsellPanel ? (
            <Panel title="Upsell placement comparison">
              <UpsellView
                baselineLabel={prettyVariant(baselineVariant!)}
                comparisonLabel={prettyVariant(comparisonVariant!)}
                baselineAgg={aggregateUpsell(baselineVariant!)}
                comparisonAgg={aggregateUpsell(comparisonVariant!)}
              />
            </Panel>
          ) : (
            <Panel title="Upsell placement comparison">
              <p style={{ color: "#888", fontSize: 13 }}>Not available for this test.</p>
            </Panel>
          )}

          {/* Product mix */}
          {wantsProductMixPanel ? (
            <Panel title="Product mix">
              <ProductMixView
                baselineLabel={prettyVariant(baselineVariant!)}
                rows={productMixForVariant(baselineVariant!)}
              />
            </Panel>
          ) : (
            <Panel title="Product mix">
              <p style={{ color: "#888", fontSize: 13 }}>Not available for this test.</p>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}

/* ---------------- inline presentational helpers ---------------- */
/* These stay in this file for now — see the note at the top of the file
   about components/ not existing yet. Split into components/*.tsx whenever
   that refactor happens; the props below are already close to what the
   build guide's Step 4 spec describes for each component. */

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #eee", borderRadius: 10, padding: "16px 18px", marginBottom: 16 }}>
      <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>{title}</h2>
      {children}
    </div>
  );
}

function SignalBadge({ status, text }: { status: "significant" | "not-significant" | "unavailable"; text?: string }) {
  const cfg = {
    significant: { color: "#0F6E56", bg: "#E1F5EE", label: "Signal confirmed" },
    "not-significant": { color: "#5F5E5A", bg: "#F1EFE8", label: "No signal yet" },
    unavailable: { color: "#888780", bg: "#F1EFE8", label: "Not available" },
  }[status];
  return (
    <span style={{ display: "inline-block", fontSize: 11, fontWeight: 500, padding: "3px 8px", borderRadius: 12, color: cfg.color, background: cfg.bg }}>
      {text ?? cfg.label}
    </span>
  );
}

function MetricCard({
  label, baselineLabel, comparisonLabel, baselineValue, comparisonValue, lift, signal, caveat,
}: {
  label: string; baselineLabel: string; comparisonLabel: string;
  baselineValue: string; comparisonValue: string;
  lift: number | null; signal: "significant" | "not-significant" | "unavailable" | null; caveat?: string;
}) {
  return (
    <div style={{ background: "#fafaf9", borderRadius: 10, padding: 14 }}>
      <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 12, color: "#888", display: "flex", justifyContent: "space-between" }}>
        <span>{baselineLabel}</span><span style={{ fontFamily: "monospace" }}>{baselineValue}</span>
      </div>
      <div style={{ fontSize: 12, color: "#888", display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <span>{comparisonLabel}</span><span style={{ fontFamily: "monospace" }}>{comparisonValue}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 8, borderTop: "1px solid #eee" }}>
        <span style={{ fontSize: 13, fontFamily: "monospace", color: lift == null ? "#888" : lift > 0 ? "#0F6E56" : lift < 0 ? "#993C1D" : "#888" }}>
          {fmtSignedPct(lift)}
        </span>
        {signal && <SignalBadge status={signal} />}
      </div>
      {caveat && <div style={{ fontSize: 11, color: "#999", fontStyle: "italic", marginTop: 6 }}>{caveat}</div>}
    </div>
  );
}

function FunnelView({ agg, label }: { agg: VariantAggregate; label: string }) {
  const steps = buildFunnel(agg);
  const rates = errorRates(agg);
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{label}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
        {steps.map((s) => (
          <div key={s.key} style={{ flex: "1 1 100px", background: "#f7f7f5", borderRadius: 6, padding: "6px 8px" }}>
            <div style={{ fontSize: 10, color: "#888" }}>{s.label}</div>
            <div style={{ fontSize: 13, fontFamily: "monospace" }}>{fmtInt(s.sessions)}</div>
            <div style={{ fontSize: 10, color: "#aaa" }}>{fmtPct(s.pctOfPriorStep, 1)} of prior</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: "#999" }}>
        Checkout error rate: {fmtPct(rates.checkoutErrorRate, 2)} · Availability fetch error rate: {fmtPct(rates.availabilityFetchErrorRate, 2)}
      </div>
    </div>
  );
}

function UpsellView({
  baselineLabel, comparisonLabel, baselineAgg, comparisonAgg,
}: {
  baselineLabel: string; comparisonLabel: string; baselineAgg: UpsellRow; comparisonAgg: UpsellRow;
}) {
  const bRates = upsellAcceptRates(baselineAgg);
  const cRates = upsellAcceptRates(comparisonAgg);
  const bLeader = comparePlacements(baselineAgg);
  const cLeader = comparePlacements(comparisonAgg);
  const row = (name: string, label: string, rates: ReturnType<typeof upsellAcceptRates>, leader: ReturnType<typeof comparePlacements>) => (
    <div key={name} style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ display: "flex", gap: 16, fontSize: 12 }}>
        <span>Inline: {fmtPct(rates.inline.acceptRate)} ({fmtInt(rates.inline.accepts)}/{fmtInt(rates.inline.impressions)})</span>
        <span>Interstitial: {fmtPct(rates.interstitial.acceptRate)} ({fmtInt(rates.interstitial.accepts)}/{fmtInt(rates.interstitial.impressions)})</span>
      </div>
      <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>
        {leader?.leader ? `${leader.leader} leads by ${fmtSignedPct(leader.diff)}` : "No difference"} — point estimate only, no significance test.
      </div>
    </div>
  );
  return (
    <>
      {row("baseline", baselineLabel, bRates, bLeader)}
      {row("comparison", comparisonLabel, cRates, cLeader)}
    </>
  );
}

function ProductMixView({ baselineLabel, rows }: { baselineLabel: string; rows: ProductMixRow[] }) {
  const breakdown = buildItemBreakdown(rows);
  if (breakdown.length === 0) {
    return <p style={{ color: "#888", fontSize: 13 }}>No item-level transactions in this window.</p>;
  }
  return (
    <div>
      <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>{baselineLabel} — top items by transactions</div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: "left", color: "#666", fontSize: 11, textTransform: "uppercase" }}>
            <th style={{ padding: 6 }}>Item</th>
            <th style={{ padding: 6 }}>Transactions</th>
            <th style={{ padding: 6 }}>Items purchased</th>
          </tr>
        </thead>
        <tbody>
          {breakdown.slice(0, 10).map((item) => (
            <tr key={item.item_name} style={{ borderTop: "1px solid #eee" }}>
              <td style={{ padding: 6 }}>{item.item_name}</td>
              <td style={{ padding: 6, fontFamily: "monospace" }}>{fmtInt(item.transactions)}</td>
              <td style={{ padding: 6, fontFamily: "monospace" }}>{fmtInt(item.items_purchased)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ fontSize: 11, color: "#999", marginTop: 6 }}>
        Transactions are item-transactions, not distinct orders — an order with two item types counts once toward each. See data-dictionary.md.
      </p>
    </div>
  );
}
