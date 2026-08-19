# Packages A/B Test Dashboard — Spec

## Purpose
Let marketing analysts monitor impression-based (Method B) packages-page A/B tests — currently `test_5` — without needing Power BI open, while keeping the same statistical rigor and honesty about what isn't yet measurable.

## Scope
Test 5 onward only. The test selector is driven entirely by `TEST_REGISTRY` (`lib/testRegistry.ts`) filtered to `status: 'live'` — currently just `test_5`. `test_6` will appear automatically once its registry entry flips to `live`; no UI code changes needed for that. Test 3/4 (Method A) are permanently out of scope for this app.

## Filters
- **Test** — select box, options from `TEST_REGISTRY` where `status === 'live'`.
- **Baseline variant** / **Comparison variant** — select boxes, options are whatever variants actually appear in the fetched data for the selected test (not hardcoded — a raw Optimizely string like `itinerary_first` shows title-cased for readability, but the underlying value passed to the API is the raw string, no relabeling).
- **Device** — All / Desktop / Mobile / Other.
- **Window** — Last 7 days / Last 14 days, ending yesterday (matches the scheduled queries' own `window_end` convention — today's GA4 data isn't finalized yet).

## KPI cards (baseline vs. comparison)
Four cards: **Sessions**, **Conversion rate**, **Revenue per session**, **Average order value**. Each shows both variants' values, the lift %, and — where applicable — a significance badge.

- **Sessions:** no significance test (not a rate/proportion comparison in the same sense) — lift % only.
- **Conversion rate:** `zTestCVR` from `lib/stats.ts`. Badge: "Signal confirmed" (p < 0.05) / "No signal yet" / "Not available" (zero sessions on either side).
- **Revenue per session:** `welchTestRPS` from `lib/stats.ts`. Same badge states, plus **"Not available"** whenever `sum_revenue_sq` is missing for either variant (this will always be true for a Method A test, though Method A tests never appear in this app's scope anyway; it can also happen transiently for a Method B test/date-range combination with too few sessions).
- **Average order value:** lift % only, **never a significance badge** — order-grain variance isn't in the pipeline. The card always shows the caveat text explaining why, rather than silently omitting a badge with no explanation.

## Sessions trend
Line chart, one line per variant, sessions per day across the selected window. Recharts `LineChart`, one color per variant index (not semantic — just distinguishing lines).

## Pairwise comparison table
One row per unique variant pair (all combinations, not just baseline-vs-comparison) — sessions for each side, CVR signal badge, RPS signal badge. Mirrors the "Variant Pairs" pattern already validated in the Power BI model.

## Checkout funnel panel
One funnel per variant (baseline and comparison), using `buildFunnel`/`errorRates` from `lib/funnel.ts`:

```
Sessions → Added to cart → Redirected to purchase →
Began checkout → Added payment info → Converted
```

Each step shows session count and % of the prior step. `checkout_error_sessions` / `availability_fetch_error_sessions` render as two separate rate callouts beside the funnel, **not** as funnel steps — their position relative to the linear sequence isn't part of the confirmed order.

## Upsell placement panel
Inline vs. interstitial: impressions, accepts, accept rate, and which placement currently leads — using `upsellAcceptRates`/`comparePlacements` from `lib/upsell.ts`. Always labeled "point estimate only, no significance test" in the UI itself, not just in a tooltip — no variance data exists for these columns.

**Availability rule:** render "Not available for this test" (not zeros, not a hidden panel) whenever the API response's `upsellAvailable` flag is `false`. This will be true for every test except `test_5` until the registry's `upsell_diagnostics` module is extended.

## Product mix panel
Top items by transaction count for the baseline variant, using `buildItemBreakdown` from `lib/productMix.ts`: item name, transactions, items purchased. Caveat text always visible: transactions are item-transactions, not distinct orders.

**Availability rule:** same pattern as upsell — "Not available for this test" when `productMixAvailable` is `false`.

## UX / formatting
- Desktop-first, single-column panel stack below the filter bar and KPI grid.
- Number formatting: `1,250,432 → 1.25M`, `0.034 → 3.4%`, `1234567` (revenue) `→ $1.23M`.
- Loading state: simple "Loading…" text while the API request is in flight.
- Error state: plain-language message with the server's error text, not a raw stack trace.
- No data / zero-session state: KPI cards and panels should not render at all until `metrics` has at least one row for the selected test — avoids showing misleading all-zero cards during the initial fetch.

## Current implementation note
`app/page.tsx` currently renders every panel inline in a single file rather than the `components/{MetricCard,TrendChart,PairwiseTable,FunnelChart,UpsellPanel}.tsx` split shown in the build guide's directory tree. The prop shapes above are already close to what that split would look like — splitting is a follow-up refactor (Phase 1C-style componentization), not a blocker for the dashboard working today.