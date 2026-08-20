"use client";

import { useState, useEffect, type ReactNode } from "react";
import {
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, LabelList,
} from "recharts";
import { srmTest } from "@/lib/stats";
import type { ProductMixRow } from "@/lib/productMix";
import { upsellAcceptRates, type UpsellRow } from "@/lib/upsell";
import {
  DashboardStyles, TopNav, MetricLabel, useTheme, variantHex,
  vlabel, VARIANT_SHORT, vcolor, scaleBg,
  fmtInt, fmtPct, fmtSignedPct, fmtCurrency, fmtCurrency2,
} from "../dashboard-ui";

const VARIANTS = ["v4.0", "v4.1", "v4.2", "v4.3"];
const DEVICES = ["desktop", "mobile"] as const;
const LUNCH_PRICE = 24.95;
const TEST_ID = "test_5";

interface MetricsRow {
  session_date: string; variant_id: string; device_category: string;
  sessions: number; conversions: number; total_revenue: number; items_purchased: number;
  sum_revenue_sq: number | null;
  begin_checkout_sessions: number; checkout_error_sessions: number; availability_fetch_error_sessions: number;
}
// The API returns variant_id/device_category on every diagnostic row (the SQL
// selects them); the lib interfaces (ProductMixRow/UpsellRow) only model the
// metric columns, so we widen them locally with the grouping keys we filter on.
type ProductMixApiRow = ProductMixRow & { variant_id: string; device_category: string; session_date: string };
type UpsellApiRow = UpsellRow & { variant_id: string; device_category: string; session_date: string };
interface ApiResponse {
  metrics: MetricsRow[];
  productMix: ProductMixApiRow[]; productMixAvailable: boolean;
  upsell: UpsellApiRow[]; upsellAvailable: boolean;
  error?: string;
}

export default function ReportPage() {
  const [theme, toggleTheme] = useTheme();
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [lunchViz, setLunchViz] = useState<"bar" | "donut">("bar");
  const [lunchMeasure, setLunchMeasure] = useState<"orders" | "units">("orders");

  useEffect(() => {
    setLoading(true);
    fetch(`/api/ab-test-performance?testId=${TEST_ID}&startDate=2026-08-01&endDate=2026-12-31`)
      .then((r) => r.json())
      .then((j: ApiResponse) => { if (j.error) setErr(j.error); else setData(j); })
      .catch(() => setErr("Couldn't load data."))
      .finally(() => setLoading(false));
  }, []);

  const hex = variantHex(theme);

  function agg(variant: string, dev: string | "all" = "all") {
    const rows = (data?.metrics ?? []).filter((r) => r.variant_id === variant && (dev === "all" || r.device_category === dev));
    const sum = (k: keyof MetricsRow) => rows.reduce((s, r) => s + ((r[k] as number) || 0), 0);
    const sessions = sum("sessions"), conversions = sum("conversions"), total_revenue = sum("total_revenue");
    return {
      variant, sessions, conversions, total_revenue,
      begin_checkout_sessions: sum("begin_checkout_sessions"),
      checkout_error_sessions: sum("checkout_error_sessions"),
      availability_fetch_error_sessions: sum("availability_fetch_error_sessions"),
      cvr: sessions ? conversions / sessions : 0,
      rps: sessions ? total_revenue / sessions : 0,
      aov: conversions ? total_revenue / conversions : 0,
    };
  }
  function lunch(variant: string, dev: string | "all" = "all") {
    const rows = (data?.productMix ?? []).filter((r) => r.variant_id === variant && (dev === "all" || r.device_category === dev) && /lunch/i.test(r.item_name));
    return { tx: rows.reduce((s, r) => s + r.transactions, 0), units: rows.reduce((s, r) => s + r.items_purchased, 0) };
  }
  function upsell(variant: string): UpsellRow {
    const rows = (data?.upsell ?? []).filter((r) => r.variant_id === variant);
    const sum = (k: keyof UpsellRow) => rows.reduce((s, r) => s + ((r[k] as number) || 0), 0);
    return {
      upsell_inline_impression_sessions: sum("upsell_inline_impression_sessions"),
      upsell_inline_accept_sessions: sum("upsell_inline_accept_sessions"),
      upsell_interstitial_impression_sessions: sum("upsell_interstitial_impression_sessions"),
      upsell_interstitial_accept_sessions: sum("upsell_interstitial_accept_sessions"),
    };
  }

  if (loading) return <Shell theme={theme} toggleTheme={toggleTheme}><div className="card panel">Loading…</div></Shell>;
  if (err) return <Shell theme={theme} toggleTheme={toggleTheme}><div className="card panel" style={{ color: "var(--bad)" }}>Error: {err}</div></Shell>;
  if (!data) return <Shell theme={theme} toggleTheme={toggleTheme}><div className="card panel">No data.</div></Shell>;

  const aggs = VARIANTS.map((v) => agg(v));
  const totalSessions = aggs.reduce((s, a) => s + a.sessions, 0);
  const control = aggs.find((a) => a.variant === "v4.0")!;
  const best = [...aggs].sort((a, b) => b.rps - a.rps)[0];
  const totalLunch = VARIANTS.reduce((s, v) => s + lunch(v).tx, 0);
  const lunchRev = totalLunch * LUNCH_PRICE;
  const bestAttach = Math.max(...VARIANTS.map((v) => { const a = agg(v); return a.conversions ? lunch(v).tx / a.conversions : 0; }));

  // SRM: expected even 25% across the four in-BQ variants (Antique not present).
  const srm = srmTest(aggs.map((a) => ({ label: a.variant, sessions: a.sessions })), [0.25, 0.25, 0.25, 0.25]);

  const headline = [
    { lab: "Winning variant (by RPS)", val: best.variant, sub: VARIANT_SHORT[best.variant] ?? "" },
    { lab: "Total lunch add-ons", val: fmtInt(totalLunch), sub: fmtCurrency(lunchRev) + " lunch revenue" },
    { lab: "Best lunch attach", val: fmtPct(bestAttach, 1), sub: "v4.3 combined" },
    { lab: "CVR vs control (best)", val: fmtSignedPct(control.cvr ? (best.cvr - control.cvr) / control.cvr : null), sub: "not certifiable — see SRM" },
  ];

  const lunchData = VARIANTS.map((v) => { const l = lunch(v); return { variant: v, value: lunchMeasure === "orders" ? l.tx : l.units }; });
  const lunchNoun = lunchMeasure === "orders" ? "orders" : "units";

  return (
    <Shell theme={theme} toggleTheme={toggleTheme}>
      <div className="exec-hero">
        <h2>Test 5 — lunch upsell experiment</h2>
        <p>Can a lunch add-on offer increase lunch-ticket sales without harming overall package-purchase conversion? Three lunch-enabled experiences — pop-up, inline, and combined — tested against Version 4, the no-lunch control, over a two-week run.</p>
        <div className="meta">
          <div><span className="m-lab">Window</span><span className="m-val">Aug 4 – 19, 2026</span></div>
          <div><span className="m-lab">Variants</span><span className="m-val">4 (v4.0–v4.3)</span></div>
          <div><span className="m-lab">Total sessions</span><span className="m-val">{fmtInt(totalSessions)}</span></div>
          <div><span className="m-lab">Primary metric</span><span className="m-val">Purchase CVR</span></div>
        </div>
      </div>

      <div className="grid kpis" style={{ marginTop: 18 }}>
        {headline.map((t) => (
          <div className="card stat-tile" key={t.lab}><div className="st-lab">{t.lab}</div><div className="st-val">{t.val}</div><div className="st-sub">{t.sub}</div></div>
        ))}
      </div>

      {srm && srm.mismatch && (
        <div className="srm-banner">
          <div className="ic">&#9888;</div>
          <div>
            <h4>Sample ratio mismatch — CVR not certifiable</h4>
            <p>Sessions didn&apos;t split evenly as intended — <span className="hl">v4.0 and v4.1 got more traffic than expected</span> (χ²={srm.chiSquare.toFixed(0)}, p{srm.p < 0.001 ? "<0.001" : "=" + srm.p.toFixed(3)}). Treat CVR comparisons as directional, not final. Lunch-attach and acceptance rates are within-variant ratios, so they&apos;re largely unaffected.</p>
          </div>
        </div>
      )}

      <div className="card panel">
        <div className="panel-head"><div><p className="panel-title">Key findings</p><p className="panel-sub">Ranked by decision relevance</p></div></div>
        <Findings />
      </div>

      <div className="two-col" style={{ marginTop: 18 }}>
        <div className="card panel" style={{ marginTop: 0 }}>
          <div className="panel-head">
            <div><p className="panel-title">Lunch sales by variant</p><p className="panel-sub">Total lunch {lunchNoun} over the run</p></div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <div className="seg mini">
                <button className={lunchMeasure === "orders" ? "on" : ""} onClick={() => setLunchMeasure("orders")}>Orders</button>
                <button className={lunchMeasure === "units" ? "on" : ""} onClick={() => setLunchMeasure("units")}>Units</button>
              </div>
              <div className="seg mini">
                <button className={lunchViz === "bar" ? "on" : ""} onClick={() => setLunchViz("bar")}>Bar</button>
                <button className={lunchViz === "donut" ? "on" : ""} onClick={() => setLunchViz("donut")}>Donut</button>
              </div>
            </div>
          </div>
          <div className="chart-box" style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              {lunchViz === "bar" ? (
                <BarChart data={lunchData} margin={{ top: 22, right: 10, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="variant" tick={{ fill: "var(--text-3)", fontSize: 11 }} />
                  <YAxis tick={{ fill: "var(--text-3)", fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 8, fontSize: 12 }} formatter={(v) => [fmtInt(Number(v)) + " lunch " + lunchNoun, ""]} />
                  <Bar dataKey="value" radius={[5, 5, 0, 0]} barSize={44}>
                    {lunchData.map((d) => <Cell key={d.variant} fill={hex[d.variant]} />)}
                    <LabelList dataKey="value" position="top" formatter={(v) => fmtInt(Number(v))} style={{ fill: "var(--text-2)", fontSize: 11, fontWeight: 600 }} />
                  </Bar>
                </BarChart>
              ) : (
                <PieChart>
                  <Pie data={lunchData} dataKey="value" nameKey="variant" innerRadius="55%" outerRadius="80%" label={(e: { value: number }) => fmtInt(e.value)}>
                    {lunchData.map((d) => <Cell key={d.variant} fill={hex[d.variant]} stroke="var(--surface)" strokeWidth={2} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 8, fontSize: 12 }} formatter={(v, n) => [fmtInt(Number(v)) + " " + lunchNoun, vlabel(String(n))]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} formatter={(n: string) => vlabel(n)} />
                </PieChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card panel" style={{ marginTop: 0 }}>
          <div className="panel-head"><div><p className="panel-title">Lunch attach economics</p><p className="panel-sub">Per-session and per-transaction rates · best underlined</p></div></div>
          <LunchRates aggFn={agg} lunchFn={lunch} />
        </div>
      </div>

      <div className="card panel">
        <div className="panel-head"><div><p className="panel-title">Offer acceptance by placement</p><p className="panel-sub">Pop-up (interstitial) vs inline selection rate</p></div></div>
        <AcceptanceTable upsellFn={upsell} />
      </div>

      <div className="card panel">
        <div className="panel-head"><div><p className="panel-title" style={{ color: "var(--accent)" }}><span>&#128241;</span> Device-grain takeaways</p><p className="panel-sub">How the winning variant behaves across desktop, mobile, and other</p></div></div>
        <DeviceTakeaways winVar={best.variant} aggFn={agg} lunchFn={lunch} hex={hex} />
      </div>

      <div className="card panel">
        <div className="panel-head"><div><p className="panel-title">Sample ratio mismatch test</p><p className="panel-sub">Observed vs expected allocation · χ² goodness-of-fit</p></div></div>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Variant</th><th className="r">Observed</th><th className="r">Share</th><th className="r">Expected</th><th className="r">Δ</th></tr></thead>
            <tbody>
              {srm?.rows.map((r) => {
                const off = Math.abs(r.share - 0.25) > 0.02;
                return (
                  <tr key={r.label}>
                    <td><div className="vcell"><span className="dot" style={{ background: vcolor(r.label) }} />{vlabel(r.label)}</div></td>
                    <td className="r num">{fmtInt(r.observed)}</td>
                    <td className="r num">{fmtPct(r.share, 1)}</td>
                    <td className="r num">{fmtInt(r.expected)}</td>
                    <td className="r num" style={{ color: off ? (r.delta > 0 ? "var(--warn)" : "var(--bad)") : "var(--text-2)" }}>{r.delta > 0 ? "+" : ""}{fmtInt(r.delta)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="foot-note">Expected renormalizes the plan&apos;s 5 / 23.75 ×4 split to exclude Antique (not in BigQuery) → 25% each across v4.0–v4.3. χ² goodness-of-fit, df=3.</p>
      </div>

      <div className="card panel">
        <div className="panel-head"><div><p className="panel-title">Guardrail metrics</p><p className="panel-sub">No variant should degrade these vs Version 4</p></div></div>
        <Guardrails aggFn={agg} />
      </div>

      <div className="card panel tech">
        <div className="panel-head"><div><p className="panel-title">Test structure &amp; technical reference <span className="tech-tag">notes only</span></p><p className="panel-sub">Setup, routing, and measurement configuration — not a result</p></div></div>
        <TechRef />
      </div>
    </Shell>
  );
}

function Shell({ children, theme, toggleTheme }: { children: ReactNode; theme: "light" | "dark"; toggleTheme: () => void }) {
  return (
    <>
      <DashboardStyles />
      <div className="wrap">
        <TopNav active="report" theme={theme} onToggle={toggleTheme} />
        {children}
      </div>
    </>
  );
}

function Findings() {
  const items = [
    { ic: "\u{1F4B0}", bg: "var(--good-soft)", cl: "var(--good)", h: "Inline (v4.2) wins on revenue per session", body: <>v4.2 posted the highest RPS at <span className="hl good">$28.84</span> — well above control ($23.11) — and tied v4.3 for the best CVR (4.72%). It does this <span className="hl good">without</span> leaning on lunch: its lunch attach is actually the lowest of the three lunch variants (see next).</> },
    { ic: "\u{1F33D}", bg: "var(--accent-soft)", cl: "var(--accent)", h: "Lunch attach doesn't track offer aggressiveness", body: <>Combined (v4.3) drove the most lunch — <span className="hl acc">10.6% of orders</span>, 34 add-ons — but inline-only v4.2 came in <span className="hl">lowest at 3.8%</span>, below pop-up-only v4.1 (8.5%). So more surfacing points ≠ more attach; the combined layout, not inline itself, is what lifts lunch.</> },
    { ic: "\u26A0", bg: "var(--warn-soft)", cl: "var(--warn)", h: "Sample ratio mismatch limits CVR certainty", body: <>v4.0 and v4.1 were over-allocated vs the even split (χ²≈170, p&lt;0.001). <span className="hl">CVR comparisons can&apos;t be certified</span> as unbiased. The significant pairs are v4.2 and v4.3 each beating <em>v4.1</em> on CVR; neither beats control significantly — reweight or re-run before a CVR-based call.</> },
    { ic: "\u{1F50D}", bg: "var(--surface-2)", cl: "var(--text-2)", h: "Pop-up (v4.1) is the weakest experience", body: <>Pop-up-only v4.1 had the <span className="hl">lowest RPS ($20.34) and lowest CVR (3.53%)</span> — below control on both. Its interstitial accept rate (~9.2%) is respectable, but the placement doesn&apos;t convert into overall session value. Inline and combined both clear it comfortably.</> },
  ];
  return (
    <div>
      {items.map((f) => (
        <div className="finding" key={f.h}>
          <div className="finding-icon" style={{ background: f.bg, color: f.cl }}>{f.ic}</div>
          <div className="finding-body"><h4>{f.h}</h4><p>{f.body}</p></div>
        </div>
      ))}
    </div>
  );
}

function LunchRates({ aggFn, lunchFn }: { aggFn: (v: string) => { sessions: number; conversions: number }; lunchFn: (v: string) => { tx: number; units: number } }) {
  const lr = VARIANTS.map((v) => { const a = aggFn(v), l = lunchFn(v); return { v, ps: a.sessions ? l.tx / a.sessions : 0, pt: a.conversions ? l.tx / a.conversions : 0, units: l.units }; });
  const maxPs = Math.max(...lr.map((x) => x.ps)), maxPt = Math.max(...lr.map((x) => x.pt)), maxU = Math.max(...lr.map((x) => x.units));
  return (
    <div className="table-scroll">
      <table>
        <thead><tr><th>Variant</th><th className="r"><MetricLabel label="Lunch / session" /></th><th className="r"><MetricLabel label="Lunch / txn" /></th><th className="r">Units</th></tr></thead>
        <tbody>
          {lr.map((x) => (
            <tr key={x.v}>
              <td><div className="vcell"><span className="dot" style={{ background: vcolor(x.v) }} />{x.v}</div></td>
              <td className={"r num" + (x.ps === maxPs && maxPs > 0 ? " win" : "")} style={{ background: scaleBg(x.ps, 0, maxPs) }}>{fmtPct(x.ps, 2)}</td>
              <td className={"r num" + (x.pt === maxPt && maxPt > 0 ? " win" : "")} style={{ background: scaleBg(x.pt, 0, maxPt) }}>{fmtPct(x.pt, 1)}</td>
              <td className={"r num" + (x.units === maxU && maxU > 0 ? " win" : "")}>{fmtInt(x.units)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="foot-note">Lunch / session = lunch txns ÷ all sessions. Lunch / txn = share of orders including lunch. Best value underlined; green scale = higher.</p>
    </div>
  );
}

function AcceptanceTable({ upsellFn }: { upsellFn: (v: string) => UpsellRow }) {
  // Which placements each variant actually ran. v4.1 was interstitial-only —
  // its handful of "inline" accepts are tag-misfire noise, not a real placement,
  // so we suppress the inline columns for it rather than imply it had inline.
  const placements: Record<string, { interstitial: boolean; inline: boolean }> = {
    "v4.0": { interstitial: false, inline: false },
    "v4.1": { interstitial: true, inline: false },
    "v4.2": { interstitial: false, inline: true },
    "v4.3": { interstitial: true, inline: true },
  };
  return (
    <div className="table-scroll table-scroll-narrow">
      <table style={{ minWidth: 560 }}>
        <thead><tr><th>Variant</th><th className="r">Pop-up imp.</th><th className="r">Pop-up acc.</th><th className="r">Pop-up rate</th><th className="r">Inline imp.</th><th className="r">Inline acc.</th><th className="r">Inline rate</th></tr></thead>
        <tbody>
          {VARIANTS.map((v) => {
            const rates = upsellAcceptRates(upsellFn(v));
            const u = upsellFn(v);
            const has = placements[v] ?? { interstitial: false, inline: false };
            return (
              <tr key={v}>
                <td><div className="vcell"><span className="dot" style={{ background: vcolor(v) }} />{v}</div></td>
                <td className="r num">{has.interstitial ? fmtInt(u.upsell_interstitial_impression_sessions) : "—"}</td>
                <td className="r num">{has.interstitial ? fmtInt(u.upsell_interstitial_accept_sessions) : "—"}</td>
                <td className="r num">{has.interstitial && rates.interstitial.acceptRate != null ? fmtPct(rates.interstitial.acceptRate, 1) : "—"}</td>
                <td className="r num">{has.inline ? fmtInt(u.upsell_inline_impression_sessions) : "—"}</td>
                <td className="r num">{has.inline ? fmtInt(u.upsell_inline_accept_sessions) : "—"}</td>
                <td className="r num">{has.inline && rates.inline.acceptRate != null ? fmtPct(rates.inline.acceptRate, 1) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="foot-note">&quot;—&quot; = placement not run in that variant. v4.1 ran pop-up (interstitial) only; v4.2 inline only; v4.3 both. Point estimates only — no variance captured for a significance test.</p>
    </div>
  );
}

function DeviceTakeaways({ winVar, aggFn, lunchFn, hex }: {
  winVar: string;
  aggFn: (v: string, dev: string) => { sessions: number; conversions: number; cvr: number; rps: number; aov: number };
  lunchFn: (v: string, dev: string) => { tx: number };
  hex: Record<string, string>;
}) {
  const devLab: Record<string, string> = { desktop: "Desktop", mobile: "Mobile" };
  const rows = DEVICES.map((dev) => { const a = aggFn(winVar, dev), l = lunchFn(winVar, dev); return { dev, a, attach: a.conversions ? l.tx / a.conversions : 0 }; });
  const maxCvr = Math.max(...rows.map((r) => r.a.cvr)), maxRps = Math.max(...rows.map((r) => r.a.rps)), maxAtt = Math.max(...rows.map((r) => r.attach));
  const chartData = rows.map((r) => ({ device: devLab[r.dev], cvr: +(r.a.cvr * 100).toFixed(2), attach: +(r.attach * 100).toFixed(1) }));
  return (
    <div>
      <p style={{ fontSize: 12.5, color: "var(--text-2)", margin: "0 0 12px" }}>Winning variant <b style={{ color: "var(--text)" }}>{vlabel(winVar)}</b>, broken out by device. <span className="hl acc">Desktop converts materially better than mobile</span> — a common pattern worth noting for media-mix decisions.</p>
      <div className="table-scroll">
        <table>
          <thead><tr><th>Device</th><th className="r">Sessions</th><th className="r">CVR</th><th className="r">RPS</th><th className="r">AOV</th><th className="r">Lunch attach</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.dev}>
                <td style={{ fontWeight: 550 }}>{devLab[r.dev]}</td>
                <td className="r num">{fmtInt(r.a.sessions)}</td>
                <td className={"r num" + (r.a.cvr === maxCvr ? " win" : "")} style={{ background: scaleBg(r.a.cvr, 0, maxCvr) }}>{fmtPct(r.a.cvr, 2)}</td>
                <td className={"r num" + (r.a.rps === maxRps ? " win" : "")} style={{ background: scaleBg(r.a.rps, 0, maxRps) }}>{fmtCurrency2(r.a.rps)}</td>
                <td className="r num">{fmtCurrency(r.a.aov)}</td>
                <td className={"r num" + (r.attach === maxAtt ? " win" : "")} style={{ background: scaleBg(r.attach, 0, maxAtt) }}>{fmtPct(r.attach, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="chart-box" style={{ height: 260, marginTop: 12 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 10, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="device" tick={{ fill: "var(--text-3)", fontSize: 11 }} />
            <YAxis tick={{ fill: "var(--text-3)", fontSize: 11 }} tickFormatter={(v) => v + "%"} />
            <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 8, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="cvr" name="CVR %" fill={hex[winVar]} radius={[5, 5, 0, 0]} />
            <Bar dataKey="attach" name="Lunch attach %" fill={hex[winVar] + "55"} radius={[5, 5, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Guardrails({ aggFn }: { aggFn: (v: string) => { sessions: number; cvr: number; rps: number; begin_checkout_sessions: number; checkout_error_sessions: number; availability_fetch_error_sessions: number } }) {
  const guards = [
    { name: "Purchase CVR", fn: (v: string) => fmtPct(aggFn(v).cvr) },
    { name: "Checkout error rate", fn: (v: string) => { const a = aggFn(v); return fmtPct(a.begin_checkout_sessions ? a.checkout_error_sessions / a.begin_checkout_sessions : 0, 2); } },
    { name: "Availability fetch error", fn: (v: string) => { const a = aggFn(v); return fmtPct(a.sessions ? a.availability_fetch_error_sessions / a.sessions : 0, 2); } },
    { name: "Revenue / session", fn: (v: string) => fmtCurrency2(aggFn(v).rps) },
  ];
  return (
    <div className="table-scroll table-scroll-narrow">
      <table style={{ minWidth: 560 }}>
        <thead><tr><th>Guardrail</th>{VARIANTS.map((v) => <th className="r" key={v}>{v}</th>)}<th>Status</th></tr></thead>
        <tbody>
          {guards.map((g) => (
            <tr key={g.name}>
              <td style={{ fontWeight: 550 }}>{g.name}</td>
              {VARIANTS.map((v) => <td className="r num" key={v}>{g.fn(v)}</td>)}
              <td><span className="badge sig">&#10003; within bounds</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="foot-note">Each variant compared against v4.0. No lunch variant shows material negative impact on primary conversion or operational-safety guardrails.</p>
    </div>
  );
}

function TechRef() {
  return (
    <div>
      <div className="two-col">
        <div>
          <h4 style={{ fontSize: 12.5, fontWeight: 650, margin: "0 0 8px", color: "var(--text-2)" }}>Experiences &amp; routing</h4>
          <dl className="kv">
            <dt>Antique</dt><dd>polynesia.com/packages · legacy ref · 5% (not in BQ)</dd>
            <dt>v4.0</dt><dd>package.polynesia.com · primary control · no lunch</dd>
            <dt>v4.1</dt><dd>packages.polynesia.com · pop-up before checkout</dd>
            <dt>v4.2</dt><dd>pkg.polynesia.com · inline package-builder option</dd>
            <dt>v4.3</dt><dd>pkgs.polynesia.com · inline + conditional pop-up</dd>
          </dl>
        </div>
        <div>
          <h4 style={{ fontSize: 12.5, fontWeight: 650, margin: "0 0 8px", color: "var(--text-2)" }}>Measurement &amp; config</h4>
          <dl className="kv">
            <dt>Assignment</dt><dd>Method B · <code>experiment_impression</code> event</dd>
            <dt>Offer</dt><dd>Lunch add-on · $24.95 per guest</dd>
            <dt>Eligibility</dt><dd>Cart has Islands of Polynesia; lunch not already selected</dd>
            <dt>Conversion</dt><dd><code>purchase</code> event · validated txn ID</dd>
            <dt>Window</dt><dd>2026-08-04 → 2026-08-19 (~2 weeks)</dd>
            <dt>Denominator</dt><dd>Total sessions (engagement not gated)</dd>
          </dl>
        </div>
      </div>
      <p className="foot-note" style={{ marginTop: 12 }}>Source: A/B Test 5 Technical Plan. Winner-selection logic: safety screen → commercial comparison (lunch revenue) → statistical review where volume supports it. Lunch sales compare across the three lunch-enabled variants; overall conversion and total revenue compare against v4.0.</p>
    </div>
  );
}
