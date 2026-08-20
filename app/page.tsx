"use client";

import { useState, useEffect, useMemo, type ReactNode } from "react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, LabelList, Cell,
} from "recharts";
import { zTestCVR, welchTestRPS, type RateAgg, type RevenueAgg } from "@/lib/stats";
import { buildFunnel, errorRates, type FunnelRow } from "@/lib/funnel";
import type { UpsellRow } from "@/lib/upsell";
import type { ProductMixRow } from "@/lib/productMix";
import {
  DashboardStyles, TopNav, MetricLabel, useTheme, variantHex,
  vlabel, vcolor, scaleBg,
  fmtInt, fmtCompact, fmtPct, fmtSignedPct, fmtCurrency, fmtCurrency2,
} from "./dashboard-ui";

const VARIANTS = ["v4.0", "v4.1", "v4.2", "v4.3"];
type DeviceFilter = "all" | "desktop" | "mobile" | "other";

interface MetricsRow {
  test_id: string; session_date: string; variant_id: string; device_category: string;
  sessions: number; engaged_sessions: number | null; conversions: number;
  total_revenue: number; items_purchased: number; sum_revenue_sq: number | null; sum_items_sq: number | null;
  add_to_cart_sessions: number; purchase_redirect_sessions: number; begin_checkout_sessions: number;
  add_payment_info_sessions: number; checkout_error_sessions: number; availability_fetch_error_sessions: number;
}
interface ApiResponse {
  metrics: MetricsRow[];
  productMix: ProductMixRow[]; productMixAvailable: boolean;
  upsell: UpsellRow[]; upsellAvailable: boolean;
  error?: string;
}
interface VariantAgg extends RateAgg, RevenueAgg, FunnelRow {
  variant: string;
  items_purchased: number;
  aov: number; rps: number; cvr: number; asp: number; tixOrder: number;
}

const TEST_ID = "test_5";

export default function DashboardPage() {
  const [theme, toggleTheme] = useTheme();
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [device, setDevice] = useState<DeviceFilter>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [baseV, setBaseV] = useState("v4.0");
  const [compV, setCompV] = useState("v4.3");
  const [trendMetric, setTrendMetric] = useState<"sessions" | "cvr" | "rps">("sessions");
  const [trendType, setTrendType] = useState<"line" | "bar">("line");
  const [summaryViz, setSummaryViz] = useState<"table" | "bar">("table");
  const [summaryBaseline, setSummaryBaseline] = useState("v4.0");
  const [funnelViz, setFunnelViz] = useState<"bars" | "line">("bars");

  useEffect(() => {
    const full = { start: "2026-08-01", end: "2026-12-31" };
    setLoading(true);
    fetch(`/api/ab-test-performance?testId=${TEST_ID}&startDate=${full.start}&endDate=${full.end}`)
      .then((r) => r.json())
      .then((j: ApiResponse) => {
        if (j.error) { setErr(j.error); return; }
        setData(j);
        const dates = Array.from(new Set(j.metrics.map((m) => m.session_date))).sort();
        if (dates.length) { setStartDate(dates[0]); setEndDate(dates[dates.length - 1]); }
      })
      .catch(() => setErr("Couldn't load data."))
      .finally(() => setLoading(false));
  }, []);

  const allDates = useMemo(
    () => (data ? Array.from(new Set(data.metrics.map((m) => m.session_date))).sort() : []),
    [data],
  );
  const activeDates = useMemo(
    () => allDates.filter((d) => (!startDate || d >= startDate) && (!endDate || d <= endDate)),
    [allDates, startDate, endDate],
  );

  const hex = variantHex(theme);

  function agg(variant: string, dev: DeviceFilter = device): VariantAgg {
    const rows = (data?.metrics ?? []).filter(
      (r) => r.variant_id === variant && activeDates.includes(r.session_date) && (dev === "all" || r.device_category === dev),
    );
    const sum = (k: keyof MetricsRow) => rows.reduce((s, r) => s + ((r[k] as number) || 0), 0);
    const sessions = sum("sessions"), conversions = sum("conversions"), total_revenue = sum("total_revenue"), items = sum("items_purchased");
    return {
      variant, sessions, conversions, total_revenue, items_purchased: items,
      sum_revenue_sq: sum("sum_revenue_sq"),
      add_to_cart_sessions: sum("add_to_cart_sessions"),
      purchase_redirect_sessions: sum("purchase_redirect_sessions"),
      begin_checkout_sessions: sum("begin_checkout_sessions"),
      add_payment_info_sessions: sum("add_payment_info_sessions"),
      checkout_error_sessions: sum("checkout_error_sessions"),
      availability_fetch_error_sessions: sum("availability_fetch_error_sessions"),
      cvr: sessions ? conversions / sessions : 0,
      rps: sessions ? total_revenue / sessions : 0,
      aov: conversions ? total_revenue / conversions : 0,
      asp: items ? total_revenue / items : 0,
      tixOrder: conversions ? items / conversions : 0,
    };
  }

  if (loading) return <Shell theme={theme} toggleTheme={toggleTheme}><div className="card panel">Loading…</div></Shell>;
  if (err) return <Shell theme={theme} toggleTheme={toggleTheme}><div className="card panel" style={{ color: "var(--bad)" }}>Error: {err}</div></Shell>;
  if (!data) return <Shell theme={theme} toggleTheme={toggleTheme}><div className="card panel">No data.</div></Shell>;

  const A = agg(baseV), B = agg(compV);
  const rows = VARIANTS.map((v) => agg(v));

  const kpis = [
    { label: "Sessions", bv: fmtCompact(A.sessions), cv: fmtCompact(B.sessions), lift: A.sessions ? (B.sessions - A.sessions) / A.sessions : null, test: null as boolean | null, approx: false },
    { label: "Conversion rate", bv: fmtPct(A.cvr), cv: fmtPct(B.cvr), lift: A.cvr ? (B.cvr - A.cvr) / A.cvr : null, test: sig(zTestCVR(B, A)), approx: false },
    { label: "Revenue / session", bv: fmtCurrency2(A.rps), cv: fmtCurrency2(B.rps), lift: A.rps ? (B.rps - A.rps) / A.rps : null, test: sig(welchTestRPS(B, A)), approx: false },
    { label: "Avg order value", bv: fmtCurrency(A.aov), cv: fmtCurrency(B.aov), lift: A.aov ? (B.aov - A.aov) / A.aov : null, test: sig(welchRPSasAOV(B, A)), approx: true },
  ];

  return (
    <Shell theme={theme} toggleTheme={toggleTheme}>
      <div className="filters">
        <div className="field"><label>Test</label>
          <select disabled title="Only one test available"><option>Test 5 — lunch upsell</option></select>
        </div>
        <div className="field"><label>Device</label>
          <div className="seg">
            {(["all", "desktop", "mobile", "other"] as DeviceFilter[]).map((d) => (
              <button key={d} className={device === d ? "on" : ""} onClick={() => setDevice(d)}>{d[0].toUpperCase() + d.slice(1)}</button>
            ))}
          </div>
        </div>
        <div className="field"><label>Date range</label>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <select value={startDate} onChange={(e) => { const v = e.target.value; setStartDate(v); if (v > endDate) setEndDate(v); }} aria-label="Start date">
              {allDates.map((d) => <option key={d} value={d}>{d.slice(5)}</option>)}
            </select>
            <span style={{ color: "var(--text-3)", fontSize: 12 }}>to</span>
            <select value={endDate} onChange={(e) => { const v = e.target.value; setEndDate(v); if (v < startDate) setStartDate(v); }} aria-label="End date">
              {allDates.map((d) => <option key={d} value={d}>{d.slice(5)}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="card panel" style={{ marginTop: 0 }}>
        <div className="panel-head">
          <div><p className="panel-title">Variant summary</p><p className="panel-sub">All metrics per variant · winning value in each column underlined</p></div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <div className="seg mini">
              <button className={summaryViz === "table" ? "on" : ""} onClick={() => setSummaryViz("table")}>Table</button>
              <button className={summaryViz === "bar" ? "on" : ""} onClick={() => setSummaryViz("bar")}>Bar</button>
            </div>
            {summaryViz === "bar" && (
              <select className="mini-select" value={summaryBaseline} onChange={(e) => setSummaryBaseline(e.target.value)} title="Baseline for delta in bar view">
                {VARIANTS.map((v) => <option key={v} value={v}>Baseline: {vlabel(v)}</option>)}
              </select>
            )}
          </div>
        </div>
        {summaryViz === "table"
          ? <SummaryTable rows={rows} />
          : <SummaryBar rows={rows} hex={hex} baseline={summaryBaseline} />}
      </div>

      <div className="card panel">
        <div className="panel-head">
          <div><p className="panel-title">Daily trend</p><p className="panel-sub">By variant across the window</p></div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <div className="seg mini">
              {(["sessions", "cvr", "rps"] as const).map((m) => (
                <button key={m} className={trendMetric === m ? "on" : ""} onClick={() => setTrendMetric(m)}>{m === "sessions" ? "Sessions" : m.toUpperCase()}</button>
              ))}
            </div>
            <div className="seg mini">
              {(["line", "bar"] as const).map((t) => (
                <button key={t} className={trendType === t ? "on" : ""} onClick={() => setTrendType(t)}>{t[0].toUpperCase() + t.slice(1)}</button>
              ))}
            </div>
          </div>
        </div>
        <TrendChart metrics={data.metrics} dates={activeDates} device={device} metric={trendMetric} type={trendType} hex={hex} />
      </div>

      <div className="card panel">
        <div className="panel-head"><div><p className="panel-title">Pairwise significance</p><p className="panel-sub">Every variant pair · CVR, RPS, and AOV</p></div></div>
        <PairwiseTable aggFn={agg} />
      </div>

      <div className="compare-bar">
        <div className="field"><label>Baseline</label>
          <select value={baseV} onChange={(e) => { const v = e.target.value; if (v === compV) setCompV(baseV); setBaseV(v); }}>
            {VARIANTS.map((v) => <option key={v} value={v}>{vlabel(v)}</option>)}
          </select>
        </div>
        <div style={{ color: "var(--text-3)", fontSize: 18, paddingBottom: 6 }}>vs</div>
        <div className="field"><label>Comparison</label>
          <select value={compV} onChange={(e) => { const v = e.target.value; if (v === baseV) setBaseV(compV); setCompV(v); }}>
            {VARIANTS.map((v) => <option key={v} value={v}>{vlabel(v)}</option>)}
          </select>
        </div>
        <p className="compare-note">The two panels below compare a single pair. Everything above covers all variants.</p>
      </div>

      <div className="kpis">
        {kpis.map((k) => {
          const lc = k.lift == null ? "var(--text-3)" : k.lift > 0 ? "var(--good)" : k.lift < 0 ? "var(--bad)" : "var(--text-3)";
          const ar = k.lift == null ? "" : k.lift > 0 ? "\u25B2" : k.lift < 0 ? "\u25BC" : "";
          return (
            <div className="card kpi" key={k.label}>
              <div className="kpi-label"><MetricLabel label={k.label} /></div>
              <div className="kpi-rows">
                <div className="kpi-row"><span className="dot" style={{ background: vcolor(baseV) }} /><span className="kpi-vlabel">{vlabel(baseV)}</span><span className="kpi-val">{k.bv}</span></div>
                <div className="kpi-row"><span className="dot" style={{ background: vcolor(compV) }} /><span className="kpi-vlabel">{vlabel(compV)}</span><span className="kpi-val">{k.cv}</span></div>
              </div>
              <div className="kpi-foot">
                <span className="lift" style={{ color: lc }}>{ar} {fmtSignedPct(k.lift)}</span>
                {k.test == null ? null : k.test ? <span className="badge sig">&#10003; significant</span> : <span className="badge nsig">no signal</span>}
              </div>
              {k.approx && <div className="caveat">AOV variance is session-grain — significance is directional.</div>}
            </div>
          );
        })}
      </div>

      <div className="card panel">
        <div className="panel-head">
          <div><p className="panel-title">Checkout funnel</p><p className="panel-sub">{vlabel(baseV)} vs {vlabel(compV)} · use the dropdowns to change either variant</p></div>
          <div className="seg mini">
            <button className={funnelViz === "bars" ? "on" : ""} onClick={() => setFunnelViz("bars")}>Bars</button>
            <button className={funnelViz === "line" ? "on" : ""} onClick={() => setFunnelViz("line")}>Line</button>
          </div>
        </div>
        {funnelViz === "bars"
          ? <div className="two-col">
              <FunnelColumn agg={A} role="base" onPick={(v) => { if (v === compV) setCompV(baseV); setBaseV(v); }} />
              <FunnelColumn agg={B} role="comp" onPick={(v) => { if (v === baseV) setBaseV(compV); setCompV(v); }} />
            </div>
          : <FunnelLineChart a={A} b={B} hex={hex} />}
      </div>
    </Shell>
  );
}

function sig(r: { significant: boolean } | null): boolean | null { return r ? r.significant : null; }

function welchRPSasAOV(a: VariantAgg, b: VariantAgg): { significant: boolean } | null {
  if (a.sum_revenue_sq == null || b.sum_revenue_sq == null) return null;
  if (!a.conversions || !b.conversions) return null;
  const m1 = a.total_revenue / a.conversions, m2 = b.total_revenue / b.conversions;
  const v1 = Math.max(0, a.sum_revenue_sq / a.conversions - m1 * m1);
  const v2 = Math.max(0, b.sum_revenue_sq / b.conversions - m2 * m2);
  const se = Math.sqrt(v1 / a.conversions + v2 / b.conversions);
  const t = se ? (m1 - m2) / se : 0;
  const erf = (x: number) => { const s = x < 0 ? -1 : 1; x = Math.abs(x); const tt = 1 / (1 + 0.3275911 * x); const y = 1 - (((((1.061405429 * tt - 1.453152027) * tt) + 1.421413741) * tt - 0.284496736) * tt + 0.254829592) * tt * Math.exp(-x * x); return s * y; };
  const p = 2 * (1 - 0.5 * (1 + erf(Math.abs(t) / Math.SQRT2)));
  return { significant: p < 0.05 };
}

function Shell({ children, theme, toggleTheme }: { children: ReactNode; theme: "light" | "dark"; toggleTheme: () => void }) {
  return (
    <>
      <DashboardStyles />
      <div className="wrap">
        <TopNav active="dashboard" theme={theme} onToggle={toggleTheme} />
        {children}
      </div>
    </>
  );
}

function SummaryTable({ rows }: { rows: VariantAgg[] }) {
  const cols: { k: keyof VariantAgg; lab: string; f: (n: number) => string; scale: boolean }[] = [
    { k: "sessions", lab: "Sessions", f: fmtInt, scale: false },
    { k: "conversions", lab: "Conv.", f: fmtInt, scale: false },
    { k: "items_purchased", lab: "Items", f: fmtInt, scale: false },
    { k: "total_revenue", lab: "Revenue", f: fmtCurrency, scale: false },
    { k: "cvr", lab: "CVR", f: (x) => fmtPct(x, 2), scale: true },
    { k: "aov", lab: "AOV", f: fmtCurrency, scale: true },
    { k: "asp", lab: "ASP", f: fmtCurrency, scale: true },
    { k: "rps", lab: "RPS", f: fmtCurrency2, scale: true },
    { k: "tixOrder", lab: "Tix/Order", f: (x) => x.toFixed(2), scale: true },
  ];
  const T: Record<string, number> = { sessions: 0, conversions: 0, items_purchased: 0, total_revenue: 0 };
  rows.forEach((r) => { T.sessions += r.sessions; T.conversions += r.conversions; T.items_purchased += r.items_purchased; T.total_revenue += r.total_revenue; });
  T.cvr = T.sessions ? T.conversions / T.sessions : 0; T.aov = T.conversions ? T.total_revenue / T.conversions : 0;
  T.asp = T.items_purchased ? T.total_revenue / T.items_purchased : 0; T.rps = T.sessions ? T.total_revenue / T.sessions : 0;
  T.tixOrder = T.conversions ? T.items_purchased / T.conversions : 0;
  const maxOf = (k: keyof VariantAgg) => Math.max(...rows.map((r) => r[k] as number));
  const minOf = (k: keyof VariantAgg) => Math.min(...rows.map((r) => r[k] as number));
  return (
    <div className="table-scroll">
      <table style={{ minWidth: 640 }}>
        <thead><tr><th>Variant</th>{cols.map((c) => <th className="r" key={String(c.k)}><MetricLabel label={c.lab} /></th>)}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.variant}>
              <td><div className="vcell"><span className="dot" style={{ background: vcolor(r.variant) }} />{r.variant}</div></td>
              {cols.map((c) => {
                const v = r[c.k] as number, mx = maxOf(c.k), mn = minOf(c.k);
                const win = v === mx && mx !== mn;
                return <td key={String(c.k)} className={"r num" + (win ? " win" : "")} style={{ background: c.scale ? scaleBg(v, mn, mx) : "transparent" }}>{c.f(v)}</td>;
              })}
            </tr>
          ))}
          <tr className="total-row"><td>Total</td>{cols.map((c) => <td className="r num" key={String(c.k)}>{c.f(T[c.k as string])}</td>)}</tr>
        </tbody>
      </table>
      <p className="foot-note">Color scale shaded per rate column (darker green = higher). Winning value in each column is underlined. ASP = revenue ÷ items; Tix/Order = items ÷ conversions.</p>
    </div>
  );
}

function SummaryBar({ rows, hex, baseline }: { rows: VariantAgg[]; hex: Record<string, string>; baseline: string }) {
  const chartData = rows.map((r) => ({ variant: r.variant, cvr: +(r.cvr * 100).toFixed(2), rps: +r.rps.toFixed(2) }));
  return (
    <div className="chart-box" style={{ height: 300 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 24, right: 10, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="variant" tick={{ fill: "var(--text-3)", fontSize: 11 }} />
          <YAxis tick={{ fill: "var(--text-3)", fontSize: 11 }} />
          <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 8, fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="cvr" name="CVR %" radius={[5, 5, 0, 0]}>
            {chartData.map((d) => <Cell key={d.variant} fill={hex[d.variant]} stroke={d.variant === baseline ? "var(--text-2)" : "none"} strokeWidth={d.variant === baseline ? 2 : 0} />)}
            <LabelList dataKey="cvr" position="top" style={{ fill: "var(--text-2)", fontSize: 11, fontWeight: 600 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function TrendChart({ metrics, dates, device, metric, type, hex }: {
  metrics: MetricsRow[]; dates: string[]; device: DeviceFilter; metric: "sessions" | "cvr" | "rps"; type: "line" | "bar"; hex: Record<string, string>;
}) {
  const rowsByDate = dates.map((date) => {
    const point: Record<string, number | string> = { date: date.slice(5) };
    VARIANTS.forEach((v) => {
      const rs = metrics.filter((r) => r.session_date === date && r.variant_id === v && (device === "all" || r.device_category === device));
      const s = rs.reduce((a, r) => a + r.sessions, 0), c = rs.reduce((a, r) => a + r.conversions, 0), rev = rs.reduce((a, r) => a + r.total_revenue, 0);
      point[v] = metric === "sessions" ? s : metric === "cvr" ? (s ? +(c / s * 100).toFixed(2) : 0) : (s ? +(rev / s).toFixed(2) : 0);
    });
    return point;
  });
  const yLabel = metric === "sessions" ? "Sessions" : metric === "cvr" ? "Conversion rate (%)" : "Revenue per session ($)";
  return (
    <div className="chart-box" style={{ height: 280 }}>
      <ResponsiveContainer width="100%" height="100%">
        {type === "line" ? (
          <LineChart data={rowsByDate} margin={{ top: 8, right: 12, left: 8, bottom: 12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: "var(--text-3)", fontSize: 10 }} label={{ value: "Date (2026)", position: "insideBottom", offset: -2, fill: "var(--text-2)", fontSize: 11 }} />
            <YAxis tick={{ fill: "var(--text-3)", fontSize: 10 }} label={{ value: yLabel, angle: -90, position: "insideLeft", fill: "var(--text-2)", fontSize: 11, style: { textAnchor: "middle" } }} />
            <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 8, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {VARIANTS.map((v) => <Line key={v} type="monotone" dataKey={v} name={vlabel(v)} stroke={hex[v]} strokeWidth={2} dot={{ r: 2 }} />)}
          </LineChart>
        ) : (
          <BarChart data={rowsByDate} margin={{ top: 8, right: 12, left: 8, bottom: 12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: "var(--text-3)", fontSize: 10 }} label={{ value: "Date (2026)", position: "insideBottom", offset: -2, fill: "var(--text-2)", fontSize: 11 }} />
            <YAxis tick={{ fill: "var(--text-3)", fontSize: 10 }} label={{ value: yLabel, angle: -90, position: "insideLeft", fill: "var(--text-2)", fontSize: 11, style: { textAnchor: "middle" } }} />
            <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 8, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {VARIANTS.map((v) => <Bar key={v} dataKey={v} name={vlabel(v)} fill={hex[v]} radius={[3, 3, 0, 0]} />)}
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

function PairwiseTable({ aggFn }: { aggFn: (v: string) => VariantAgg }) {
  const pairs: { a: VariantAgg; b: VariantAgg }[] = [];
  for (let i = 0; i < VARIANTS.length; i++) for (let j = i + 1; j < VARIANTS.length; j++) pairs.push({ a: aggFn(VARIANTS[i]), b: aggFn(VARIANTS[j]) });
  const badge = (r: { significant: boolean } | null) => r ? (r.significant ? <span className="badge sig">&#10003;</span> : <span className="badge nsig">ns</span>) : <span className="badge na">n/a</span>;
  return (
    <div className="table-scroll">
      <table style={{ minWidth: 560 }}>
        <thead><tr><th>Pair</th><th className="r">Sessions A / B</th><th className="r">CVR Δ%</th><th>CVR</th><th className="r">RPS Δ%</th><th>RPS</th><th className="r">AOV Δ%</th><th>AOV</th></tr></thead>
        <tbody>
          {pairs.map((p, i) => (
            <tr key={i}>
              <td><div className="vcell"><span className="dot" style={{ background: vcolor(p.a.variant) }} />{p.a.variant} <span style={{ color: "var(--text-3)" }}>vs</span> <span className="dot" style={{ background: vcolor(p.b.variant) }} />{p.b.variant}</div></td>
              <td className="r num">{fmtInt(p.a.sessions)} / {fmtInt(p.b.sessions)}</td>
              <td className="r num">{fmtSignedPct(p.a.cvr && p.b.cvr ? (p.a.cvr - p.b.cvr) / p.b.cvr : null)}</td><td>{badge(zTestCVR(p.a, p.b))}</td>
              <td className="r num">{fmtSignedPct(p.a.rps && p.b.rps ? (p.a.rps - p.b.rps) / p.b.rps : null)}</td><td>{badge(welchTestRPS(p.a, p.b))}</td>
              <td className="r num">{fmtSignedPct(p.a.aov && p.b.aov ? (p.a.aov - p.b.aov) / p.b.aov : null)}</td><td>{badge(welchRPSasAOV(p.a, p.b))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="foot-note">CVR: two-proportion z-test (pooled SE). RPS: Welch&apos;s t on session-grain revenue. AOV: Welch&apos;s on order-grain — approximate. Significance p&lt;0.05.</p>
    </div>
  );
}

function FunnelColumn({ agg, role, onPick }: { agg: VariantAgg; role: "base" | "comp"; onPick: (v: string) => void }) {
  const steps = buildFunnel(agg);
  const max = steps[0].sessions || 1;
  const errs = errorRates(agg);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span className="dot" style={{ background: vcolor(agg.variant) }} />
        <select className="mini-select" value={agg.variant} onChange={(e) => onPick(e.target.value)} aria-label={role + " variant"}>
          {VARIANTS.map((v) => <option key={v} value={v}>{vlabel(v)}</option>)}
        </select>
      </div>
      {steps.map((s, i) => {
        const prior = i > 0 ? steps[i - 1].sessions : null;
        const w = Math.max(2, (s.sessions / max) * 100);
        const drop = prior && prior > 0 ? 1 - s.sessions / prior : 0;
        const inside = w >= 16;
        return (
          <div className="funnel-step" key={s.key}>
            <span className="funnel-step-label">{s.label}</span>
            <div className="funnel-bar-track">
              <div className="funnel-bar-fill" style={{ width: `${w}%`, background: vcolor(agg.variant) }}>
                {inside && <span className="fill-val">{fmtInt(s.sessions)}</span>}
              </div>
              {!inside && <span className="fill-val-out" style={{ left: `calc(${w}% + 8px)` }}>{fmtInt(s.sessions)}</span>}
            </div>
            <span className="funnel-step-pct">
              {prior ? fmtPct(s.sessions / prior, 0) + " of prev" : "—"}
              {drop > 0.001 && <span className="drop"> (−{fmtPct(drop, 0)})</span>}
            </span>
          </div>
        );
      })}
      <div className="pill-row" style={{ marginTop: 12 }}>
        <span className="pill">Checkout error {fmtPct(errs.checkoutErrorRate, 2)}</span>
        <span className="pill">Availability error {fmtPct(errs.availabilityFetchErrorRate, 2)}</span>
      </div>
    </div>
  );
}

function FunnelLineChart({ a, b, hex }: { a: VariantAgg; b: VariantAgg; hex: Record<string, string> }) {
  const sa = buildFunnel(a), sb = buildFunnel(b);
  const s0a = sa[0].sessions || 1, s0b = sb[0].sessions || 1;
  const chartData = sa.map((s, i) => ({
    step: s.label,
    [a.variant]: +(s.sessions / s0a * 100).toFixed(1),
    [b.variant]: +(sb[i].sessions / s0b * 100).toFixed(1),
  }));
  return (
    <div className="chart-box" style={{ height: 300 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="step" tick={{ fill: "var(--text-3)", fontSize: 10 }} />
          <YAxis tick={{ fill: "var(--text-3)", fontSize: 10 }} tickFormatter={(v) => v + "%"} />
          <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 8, fontSize: 12 }} formatter={(v: number) => v + "% of sessions"} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line type="monotone" dataKey={a.variant} name={vlabel(a.variant)} stroke={hex[a.variant]} strokeWidth={2} dot={{ r: 3 }} />
          <Line type="monotone" dataKey={b.variant} name={vlabel(b.variant)} stroke={hex[b.variant]} strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
