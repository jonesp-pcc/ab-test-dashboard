"use client";

// Shared UI layer for the dashboard + Test 5 report pages.
// Ported from the standalone demo artifact (ab_dashboard_v3_demo.html).
// Holds: design-token CSS (light/dark), format helpers, the metric glossary
// + MetricLabel tooltip component, the variant color map, and a theme hook.
// Both app/page.tsx and app/report/page.tsx import from here so the two
// views stay visually identical and defined once.

import { useEffect, useState, type ReactNode } from "react";

// ---- variant color + label maps -------------------------------------------
// Raw Optimizely variant_id strings for Test 5 (confirmed): v4.0 control,
// v4.1 pop-up, v4.2 inline, v4.3 combined. "Unassigned" is excluded upstream.
export const VARIANT_COLORS: Record<string, string> = {
  "v4.0": "var(--v0)", "v4.1": "var(--v1)", "v4.2": "var(--v2)", "v4.3": "var(--v3)",
};
export const VARIANT_HEX_LIGHT: Record<string, string> = {
  "v4.0": "#6B7280", "v4.1": "#2C64E3", "v4.2": "#E07B36", "v4.3": "#0F9D8F",
};
export const VARIANT_HEX_DARK: Record<string, string> = {
  "v4.0": "#98A1B0", "v4.1": "#5487EE", "v4.2": "#EC935A", "v4.3": "#28BCAE",
};
export const VARIANT_LABELS: Record<string, string> = {
  "v4.0": "v4.0 · control", "v4.1": "v4.1 · pop-up", "v4.2": "v4.2 · inline", "v4.3": "v4.3 · combined",
};
export const VARIANT_SHORT: Record<string, string> = {
  "v4.0": "control", "v4.1": "pop-up", "v4.2": "inline", "v4.3": "combined",
};
// Fallback for any variant_id not in the maps above (defensive — keeps a new
// or unexpected raw value renderable rather than blank).
export function vlabel(v: string) { return VARIANT_LABELS[v] ?? v; }
export function vcolor(v: string) { return VARIANT_COLORS[v] ?? "var(--text-3)"; }

// ---- format helpers (identical semantics to the demo) ---------------------
export const fmtInt = (n: number) => Math.round(n).toLocaleString("en-US");
export const fmtCompact = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (a >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return Math.round(n).toString();
};
export const fmtPct = (x: number | null | undefined, d = 2) =>
  x == null || Number.isNaN(x) ? "—" : (x * 100).toFixed(d) + "%";
export const fmtSignedPct = (x: number | null | undefined, d = 1) =>
  x == null || Number.isNaN(x) ? "—" : (x > 0 ? "+" : "") + (x * 100).toFixed(d) + "%";
export const fmtCurrency = (n: number | null | undefined) =>
  n == null || Number.isNaN(n) ? "—" : (n < 0 ? "-" : "") + "$" + Math.round(Math.abs(n)).toLocaleString("en-US");
export const fmtCurrency2 = (n: number | null | undefined) =>
  n == null || Number.isNaN(n) ? "—" : (n < 0 ? "-" : "") + "$" + Math.abs(n).toFixed(2);

// ---- metric glossary + tooltip label --------------------------------------
interface GlossEntry { d: string; f?: string; }
export const GLOSSARY: Record<string, GlossEntry> = {
  "Sessions": { d: "Distinct visits with an experiment impression for this variant. Denominator for CVR and RPS — not gated on engagement." },
  "Conversion rate": { d: "Share of sessions that ended in a completed purchase.", f: "conversions ÷ sessions" },
  "CVR": { d: "Conversion rate — share of sessions that ended in a purchase.", f: "conversions ÷ sessions" },
  "Revenue / session": { d: "Average revenue per session, whether or not it converted. The headline commercial-impact metric.", f: "total revenue ÷ sessions" },
  "RPS": { d: "Revenue per session — average revenue per session, converted or not.", f: "total revenue ÷ sessions" },
  "Avg order value": { d: "Average revenue per completed order.", f: "total revenue ÷ conversions" },
  "AOV": { d: "Average order value — average revenue per completed order.", f: "total revenue ÷ conversions" },
  "ASP": { d: "Average selling price — average revenue per item sold.", f: "total revenue ÷ items" },
  "Tix/Order": { d: "Average number of items (tickets) per completed order.", f: "items ÷ conversions" },
  "Conv.": { d: "Completed purchases (converting sessions), validated by transaction ID." },
  "Items": { d: "Total item units purchased across all orders." },
  "Revenue": { d: "Total purchase revenue attributed to this variant." },
  "Lunch / session": { d: "Share of all sessions that resulted in an order containing a lunch add-on.", f: "lunch txns ÷ sessions" },
  "Lunch / txn": { d: "Share of orders that included a lunch add-on.", f: "lunch txns ÷ conversions" },
  "Lunch attach": { d: "Share of orders that included a lunch add-on.", f: "lunch txns ÷ conversions" },
  "Purchase CVR": { d: "Overall purchase conversion rate — the test's primary guardrail metric.", f: "conversions ÷ sessions" },
  "Checkout error rate": { d: "Share of checkout attempts that hit an error. Operational-safety guardrail.", f: "checkout errors ÷ begin-checkout" },
  "Availability fetch error": { d: "Share of sessions that hit an availability-fetch error. Operational-safety guardrail.", f: "availability errors ÷ sessions" },
};

// Visible ⓘ affordance + tooltip; shows on hover, keyboard focus, and tap.
// Flips below the label when near the top of the viewport.
export function MetricLabel({ label }: { label: string }) {
  const [flip, setFlip] = useState(false);
  const g = GLOSSARY[label];
  if (!g) return <>{label}</>;
  // Tooltip opens downward by default (so labels near the top of the page —
  // KPI cards, first table header — never render off the top of the viewport).
  // Flip upward only when the label sits near the bottom, where a downward
  // tooltip would clip. ~150px is roughly the tooltip's height budget.
  const decideFlip = (el: HTMLElement) =>
    setFlip(window.innerHeight - el.getBoundingClientRect().bottom < 150);
  return (
    <span
      className={"mlabel" + (flip ? " flip" : "")}
      tabIndex={0}
      onMouseEnter={(e) => decideFlip(e.currentTarget)}
      onFocus={(e) => decideFlip(e.currentTarget)}
      onKeyDown={(e) => { if (e.key === "Escape") (e.currentTarget as HTMLElement).blur(); }}
    >
      {label}
      <span className="info" aria-hidden="true">i</span>
      <span className="sr-only">: {g.d}</span>
      <span className="tip" role="tooltip">
        {g.d}
        {g.f ? <span className="tip-formula">{g.f}</span> : null}
      </span>
    </span>
  );
}

// ---- theme hook -----------------------------------------------------------
// Persists nothing (avoids localStorage, which is fine for an internal tool);
// defaults to light and toggles the data-theme attribute the CSS keys off.
export function useTheme(): ["light" | "dark", () => void] {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => { document.documentElement.setAttribute("data-theme", theme); }, [theme]);
  return [theme, () => setTheme((t) => (t === "light" ? "dark" : "light"))];
}
export function variantHex(theme: "light" | "dark") {
  return theme === "dark" ? VARIANT_HEX_DARK : VARIANT_HEX_LIGHT;
}

export function ThemeToggle({ theme, onToggle }: { theme: "light" | "dark"; onToggle: () => void }) {
  return (
    <button className="icon-btn" onClick={onToggle} aria-label="Toggle light or dark theme">
      {theme === "dark" ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12.8A9 9 0 1111.2 3 7 7 0 0021 12.8z" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      )}
    </button>
  );
}

// color-scale background for rate cells: t in [min,max] -> lo..hi mix
export function scaleBg(val: number, min: number, max: number): string {
  if (max === min) return "transparent";
  let t = (val - min) / (max - min);
  t = Math.max(0, Math.min(1, t));
  return `color-mix(in srgb, var(--scale-hi) ${Math.round(t * 100)}%, var(--scale-lo))`;
}

// Top nav shared by both pages. `active` is which page we're on; the links
// are real routes so this works with Next's file-based routing.
export function TopNav({ active, theme, onToggle }: { active: "dashboard" | "report"; theme: "light" | "dark"; onToggle: () => void }) {
  return (
    <div className="topbar">
      <div className="brand">
        <div className="brand-mark">P</div>
        <div>
          <h1>Packages experiment analytics</h1>
          <p>Polynesian Cultural Center · impression-based (Method B)</p>
        </div>
      </div>
      <div className="top-actions">
        <div className="tabs">
          <a className={"tab" + (active === "dashboard" ? " active" : "")} href="/">A/B dashboard</a>
          <a className={"tab" + (active === "report" ? " active" : "")} href="/report">Test 5 report</a>
        </div>
        <ThemeToggle theme={theme} onToggle={onToggle} />
      </div>
    </div>
  );
}

// The full design-token + component stylesheet, injected once per page via
// <DashboardStyles/>. Kept as a single string so the two pages can't drift.
export function DashboardStyles(): ReactNode {
  return <style dangerouslySetInnerHTML={{ __html: STYLE_CSS }} />;
}

const STYLE_CSS = `
:root{--bg:#F6F7F9;--surface:#FFFFFF;--surface-2:#FAFBFC;--border:#E5E8EE;--border-strong:#D0D5DF;--text:#141821;--text-2:#565D6D;--text-3:#8B92A1;--accent:#2C64E3;--accent-soft:#E9F0FE;--good:#158A63;--good-soft:#E2F3EC;--warn:#B0790C;--warn-soft:#FAF0DA;--bad:#CE4040;--bad-soft:#FBE9E9;--v0:#6B7280;--v1:#2C64E3;--v2:#E07B36;--v3:#0F9D8F;--scale-lo:#FBE9E9;--scale-hi:#E2F3EC;--shadow:0 1px 2px rgba(16,24,40,.03),0 1px 3px rgba(16,24,40,.05);--shadow-lg:0 6px 18px rgba(16,24,40,.08);--radius:12px;}
[data-theme="dark"]{--bg:#0D1015;--surface:#161A21;--surface-2:#1B2028;--border:#282E39;--border-strong:#39404E;--text:#EAEDF2;--text-2:#A2AAB9;--text-3:#6D7688;--accent:#5487EE;--accent-soft:#182740;--good:#2FB783;--good-soft:#0F2A20;--warn:#DBA33A;--warn-soft:#2C2410;--bad:#E36A6A;--bad-soft:#2D1616;--v0:#98A1B0;--v1:#5487EE;--v2:#EC935A;--v3:#28BCAE;--scale-lo:#2D1616;--scale-hi:#0F2A20;--shadow:0 1px 2px rgba(0,0,0,.35);--shadow-lg:0 8px 24px rgba(0,0,0,.45);}
*{box-sizing:border-box;}
body{margin:0;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,system-ui,sans-serif;font-size:14px;line-height:1.5;-webkit-font-smoothing:antialiased;}
.wrap{max-width:1140px;margin:0 auto;padding:22px 26px 72px;}
.topbar{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:24px;flex-wrap:wrap;}
.brand{display:flex;align-items:center;gap:12px;}
.brand-mark{width:40px;height:40px;border-radius:11px;background:var(--accent);color:#fff;display:grid;place-items:center;font-weight:700;font-size:18px;flex-shrink:0;}
.brand h1{font-size:17px;margin:0;font-weight:650;letter-spacing:-.01em;}
.brand p{font-size:12.5px;margin:1px 0 0;color:var(--text-2);}
.top-actions{display:flex;align-items:center;gap:8px;}
.tabs{display:inline-flex;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:3px;box-shadow:var(--shadow);}
.tab{border:none;background:transparent;color:var(--text-2);font:inherit;font-weight:550;font-size:13px;padding:7px 15px;border-radius:7px;cursor:pointer;transition:all .15s;white-space:nowrap;text-decoration:none;}
.tab.active{background:var(--accent);color:#fff;}
.tab:not(.active):hover{color:var(--text);background:var(--surface-2);}
.icon-btn{width:40px;height:40px;border:1px solid var(--border);background:var(--surface);border-radius:10px;cursor:pointer;display:grid;place-items:center;color:var(--text-2);box-shadow:var(--shadow);transition:all .15s;}
.icon-btn:hover{color:var(--text);border-color:var(--border-strong);}
.filters{display:flex;flex-wrap:wrap;gap:14px;align-items:flex-end;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:14px 16px;margin-bottom:20px;box-shadow:var(--shadow);}
.compare-bar{display:flex;flex-wrap:wrap;gap:14px;align-items:flex-end;background:var(--surface);border:1px solid var(--border-strong);border-radius:var(--radius);padding:14px 16px;margin-top:18px;box-shadow:var(--shadow);}
.compare-note{flex:1 1 200px;min-width:180px;font-size:11.5px;color:var(--text-3);margin:0 0 4px;line-height:1.4;text-align:right;}
.field{display:flex;flex-direction:column;gap:5px;}
.field label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-3);}
select{appearance:none;background:var(--surface-2);color:var(--text);border:1px solid var(--border-strong);border-radius:8px;padding:8px 32px 8px 11px;font:inherit;font-size:13px;cursor:pointer;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238B92A1' stroke-width='2.5'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;}
select:disabled{opacity:.5;cursor:not-allowed;background-image:none;}
.mini-select{appearance:none;background:var(--surface-2);color:var(--text);border:1px solid var(--border-strong);border-radius:8px;padding:6px 28px 6px 10px;font:inherit;font-size:12px;cursor:pointer;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238B92A1' stroke-width='2.5'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 8px center;}
.seg{display:inline-flex;border:1px solid var(--border-strong);border-radius:8px;overflow:hidden;}
.seg button{border:none;background:var(--surface-2);color:var(--text-2);font:inherit;font-size:12.5px;padding:8px 12px;cursor:pointer;border-right:1px solid var(--border);transition:all .12s;}
.seg button:last-child{border-right:none;}
.seg button.on{background:var(--accent);color:#fff;}
.seg button:not(.on):hover{background:var(--surface);color:var(--text);}
.seg button:disabled{opacity:.4;cursor:not-allowed;}
.seg.mini button{padding:5px 9px;font-size:11.5px;}
.grid{display:grid;gap:14px;}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(215px,1fr));gap:14px;margin-bottom:8px;}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);}
.kpi{padding:15px 17px;}
.kpi-label{font-size:12px;color:var(--text-2);font-weight:550;}
.kpi-rows{margin:11px 0 9px;display:flex;flex-direction:column;gap:6px;}
.kpi-row{display:flex;align-items:center;gap:8px;}
.dot{width:9px;height:9px;border-radius:50%;flex-shrink:0;}
.kpi-vlabel{font-size:12.5px;color:var(--text-2);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.kpi-val{font-size:15.5px;font-weight:650;font-variant-numeric:tabular-nums;letter-spacing:-.01em;}
.kpi-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;padding-top:10px;border-top:1px solid var(--border);}
.lift{font-size:13px;font-weight:650;font-variant-numeric:tabular-nums;display:inline-flex;align-items:center;gap:3px;}
.badge{font-size:11px;font-weight:600;padding:3px 9px;border-radius:20px;display:inline-flex;align-items:center;gap:4px;white-space:nowrap;}
.badge.sig{background:var(--good-soft);color:var(--good);}
.badge.nsig{background:var(--surface-2);color:var(--text-3);border:1px solid var(--border);}
.badge.na{background:var(--surface-2);color:var(--text-3);}
.caveat{font-size:11px;color:var(--text-3);margin-top:7px;font-style:italic;line-height:1.4;}
.panel{padding:18px 20px;margin-top:18px;}
.panel.tech{background:var(--surface-2);border-style:dashed;box-shadow:none;}
.panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:15px;flex-wrap:wrap;}
.panel-title{font-size:14.5px;font-weight:650;margin:0;letter-spacing:-.01em;display:flex;align-items:center;gap:8px;}
.panel-sub{font-size:12px;color:var(--text-2);margin:2px 0 0;font-weight:400;}
.tech-tag{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);border:1px solid var(--border-strong);border-radius:5px;padding:2px 7px;}
table{width:100%;border-collapse:collapse;font-size:13px;}
th{text-align:left;font-weight:600;color:var(--text-3);font-size:11px;text-transform:uppercase;letter-spacing:.04em;padding:9px 10px;border-bottom:1px solid var(--border-strong);white-space:nowrap;}
th.r,td.r{text-align:right;}
td{padding:10px 10px;border-bottom:1px solid var(--border);vertical-align:middle;}
tr:last-child td{border-bottom:none;}
tr.total-row td{font-weight:650;border-top:1px solid var(--border-strong);background:var(--surface-2);}
.num{font-variant-numeric:tabular-nums;}
.vcell{display:flex;align-items:center;gap:8px;font-weight:550;}
.win{text-decoration:underline;text-decoration-color:var(--warn);text-decoration-thickness:2px;text-underline-offset:3px;}
.chart-box{position:relative;width:100%;}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:18px;}
@media (max-width:760px){.two-col{grid-template-columns:1fr;}}
.table-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;}
@media (max-width:820px){.table-scroll-narrow{overflow-x:auto;-webkit-overflow-scrolling:touch;}}
@media (max-width:520px){th,td{padding:8px 7px;}table{font-size:12px;}}
.funnel-step{display:grid;grid-template-columns:150px 1fr auto;gap:12px;align-items:center;padding:6px 0;}
.funnel-bar-track{background:var(--surface-2);border-radius:6px;height:28px;position:relative;overflow:visible;border:1px solid var(--border);}
.funnel-bar-fill{height:100%;border-radius:5px 0 0 5px;display:flex;align-items:center;padding-left:9px;font-size:11.5px;font-weight:600;font-variant-numeric:tabular-nums;transition:width .4s;overflow:hidden;}
.funnel-bar-fill .fill-val{color:#fff;white-space:nowrap;}
.fill-val-out{position:absolute;top:50%;transform:translateY(-50%);font-size:11.5px;font-weight:600;font-variant-numeric:tabular-nums;color:var(--text-2);white-space:nowrap;}
.funnel-step-label{font-size:12.5px;font-weight:550;}
.funnel-step-pct{font-size:11.5px;color:var(--text-2);font-variant-numeric:tabular-nums;text-align:right;min-width:100px;}
.drop{color:var(--bad);font-size:11px;}
.pill-row{display:flex;gap:6px;flex-wrap:wrap;}
.pill{font-size:11px;padding:3px 9px;border-radius:6px;background:var(--surface-2);border:1px solid var(--border);color:var(--text-2);font-weight:550;}
.exec-hero{background:linear-gradient(135deg,#2C64E3 0%,#1B47A8 100%);color:#fff;border-radius:16px;padding:28px 30px;margin-bottom:20px;box-shadow:var(--shadow-lg);}
[data-theme="dark"] .exec-hero{background:linear-gradient(135deg,#1B3766 0%,#101F38 100%);}
.exec-hero h2{margin:0 0 7px;font-size:22px;font-weight:700;letter-spacing:-.02em;}
.exec-hero p{margin:0;font-size:13.5px;opacity:.93;max-width:730px;line-height:1.6;}
.exec-hero .meta{display:flex;gap:26px;margin-top:20px;flex-wrap:wrap;}
.exec-hero .m-lab{font-size:11px;text-transform:uppercase;letter-spacing:.05em;opacity:.72;display:block;}
.exec-hero .m-val{font-size:16px;font-weight:650;margin-top:3px;display:block;}
.finding{display:flex;gap:13px;padding:14px 0;border-bottom:1px solid var(--border);}
.finding:last-child{border-bottom:none;}
.finding-icon{width:32px;height:32px;border-radius:8px;flex-shrink:0;display:grid;place-items:center;font-size:15px;}
.finding-body h4{margin:0 0 4px;font-size:13.5px;font-weight:650;}
.finding-body p{margin:0;font-size:12.5px;color:var(--text-2);line-height:1.55;}
.hl{background:var(--warn-soft);color:var(--warn);padding:1px 5px;border-radius:4px;font-weight:600;}
.hl.good{background:var(--good-soft);color:var(--good);}
.hl.acc{background:var(--accent-soft);color:var(--accent);}
.srm-banner{display:flex;gap:12px;align-items:flex-start;background:var(--warn-soft);border:1px solid var(--warn);border-radius:var(--radius);padding:15px 17px;margin-top:18px;}
.srm-banner .ic{color:var(--warn);flex-shrink:0;font-size:19px;line-height:1.1;}
.srm-banner h4{margin:0 0 4px;font-size:13.5px;font-weight:650;color:var(--text);}
.srm-banner p{margin:0;font-size:12.5px;color:var(--text-2);line-height:1.55;}
.stat-tile{padding:16px 18px;}
.stat-tile .st-lab{font-size:12px;color:var(--text-2);font-weight:550;}
.stat-tile .st-val{font-size:29px;font-weight:700;letter-spacing:-.02em;margin:8px 0 2px;font-variant-numeric:tabular-nums;}
.stat-tile .st-sub{font-size:12px;color:var(--text-3);}
.foot-note{font-size:11.5px;color:var(--text-3);margin-top:9px;line-height:1.5;}
.kv{display:grid;grid-template-columns:auto 1fr;gap:6px 16px;font-size:12.5px;}
.kv dt{color:var(--text-3);font-weight:550;}
.kv dd{margin:0;color:var(--text-2);font-variant-numeric:tabular-nums;}
code{font-family:ui-monospace,Menlo,monospace;font-size:12px;background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:1px 5px;color:var(--text);}
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);}
.mlabel{display:inline-flex;align-items:center;gap:4px;position:relative;}
.mlabel .info{width:14px;height:14px;border-radius:50%;border:1px solid var(--text-3);color:var(--text-3);font-size:9px;font-weight:700;display:inline-grid;place-items:center;cursor:help;flex-shrink:0;line-height:1;transition:all .15s;font-style:normal;}
.mlabel:hover .info,.mlabel:focus-within .info{border-color:var(--accent);color:var(--accent);}
.mlabel .tip{position:absolute;top:calc(100% + 8px);left:50%;transform:translateX(-50%) translateY(-4px);width:230px;max-width:230px;box-sizing:border-box;background:var(--surface);color:var(--text);border:1px solid var(--border-strong);border-radius:9px;box-shadow:var(--shadow-lg);padding:10px 12px;font-size:12px;font-weight:400;line-height:1.5;text-transform:none;letter-spacing:normal;white-space:normal;word-wrap:break-word;overflow-wrap:break-word;opacity:0;visibility:hidden;transition:opacity .18s ease .35s,transform .18s ease .35s,visibility 0s linear .53s;z-index:50;pointer-events:none;text-align:left;}
.mlabel:hover .tip,.mlabel:focus-within .tip{opacity:1;visibility:visible;transform:translateX(-50%) translateY(0);transition:opacity .18s ease .35s,transform .18s ease .35s;}
.mlabel .tip::after{content:"";position:absolute;bottom:100%;left:50%;transform:translateX(-50%);border:6px solid transparent;border-bottom-color:var(--surface);}
.mlabel .tip .tip-formula{display:block;margin-top:5px;font-family:ui-monospace,Menlo,monospace;font-size:11px;color:var(--text-2);background:var(--surface-2);border-radius:5px;padding:3px 6px;white-space:normal;word-break:break-word;}
.mlabel.flip .tip{top:auto;bottom:calc(100% + 8px);}
.mlabel.flip .tip::after{bottom:auto;top:100%;border-bottom-color:transparent;border-top-color:var(--surface);}
th .mlabel{text-transform:none;letter-spacing:normal;}
th .mlabel .info{width:13px;height:13px;font-size:8px;}
`;