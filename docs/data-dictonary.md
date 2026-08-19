# GA4 Packages A/B Test — Data Dictionary

Source views: `pcc-marketing-analytics-prod.analytics_ai.{ab_test_metrics, ab_test_product_mix, ab_test_upsell_diagnostics}`
Scope: Test 5 onward (impression-based / Method B) only. See `TEST_REGISTRY` in `lib/testRegistry.ts` for the authoritative scope list — do not infer scope from this document alone, since the registry is the single source of truth and this file could drift out of sync with it.

Claude (or anyone building against this data) should not infer metric definitions beyond what's written here.

---

## ab_test_metrics

**Grain:** one row per `test_id`, `session_date`, `variant_id`, `device_category`

| Column | Type | Definition |
|---|---|---|
| `test_id` | STRING | Raw value from `experiment_impression`'s `test_id` param. No mapping layer. |
| `session_date` | DATE | Calendar date of the session. |
| `variant_id` | STRING | Raw value from `experiment_impression`'s `variant_id` param, or `'Unassigned'` if a session carried conflicting impressions for the same test. |
| `device_category` | STRING | `desktop` / `mobile` / `other`, or `all` for Unassigned/conflicted sessions (no device split). |
| `sessions` | INT64 | Total sessions with an impression for this test. **Not** gated on engagement — this is the CVR/RPS denominator. |
| `engaged_sessions` | INT64 | GA4-engaged subset of `sessions` (10s dwell / 2+ pageviews / a conversion). Diagnostic only — never used as a filter. |
| `conversions` | INT64 | Count of sessions with a `purchase` event, validated by transaction ID. |
| `total_revenue` | FLOAT64 | `SUM(event_params.value)` on purchase events. |
| `items_purchased` | INT64 | `SUM(items.quantity)` across purchase events. |
| `sum_revenue_sq` | FLOAT64 | Session-grain `SUM(revenue^2)`. Required for RPS variance — cannot be reconstructed from `total_revenue` alone. |
| `sum_items_sq` | FLOAT64 | Session-grain `SUM(items_purchased^2)`, same purpose for an items-per-session variance if ever needed. |
| `test_state` | STRING | Sourced from `experiment_impression`. Value set (`live`/`staging`/`ramp_up`/etc) is **not yet defined by the team** — treat as informational only, don't branch logic on it. |
| `assignment_method` | STRING | Exists on the table. **Intentionally not used** to derive Method A/B scope in this build — the `test_id` exclusion list in `lib/testRegistry.ts` is the source of truth by decision, not by absence of an alternative. |

### Checkout funnel columns (on ab_test_metrics)

**Confirmed step order** (2026-08-19, confirmed directly against the actual flow — previously an unconfirmed guess, corrected):

```
sessions → add_to_cart_sessions → purchase_redirect_sessions →
begin_checkout_sessions → add_payment_info_sessions → conversions
```

The redirect step reflects the site's real architecture: the packages/variant subdomain hands off to `ticketing.polynesia.com`, where checkout and payment actually happen.

| Column | Definition |
|---|---|
| `add_to_cart_sessions` | Sessions that added an item to cart. |
| `purchase_redirect_sessions` | Sessions redirected off the packages/variant subdomain toward the ticketing checkout flow. |
| `begin_checkout_sessions` | Sessions that began checkout (on `ticketing.polynesia.com`). |
| `add_payment_info_sessions` | Sessions that added payment info. |
| `checkout_error_sessions` | **Side branch, not a sequential step** — an error that can occur at/after `begin_checkout`. Report as `checkout_error_sessions / begin_checkout_sessions`, never inline in the linear funnel. |
| `availability_fetch_error_sessions` | **Side branch** — report as `availability_fetch_error_sessions / sessions`. |

**Open question, not yet resolved:** given checkout happens on a different subdomain (`ticketing.polynesia.com`) after the redirect, it's worth independently confirming `begin_checkout_sessions` and `add_payment_info_sessions` are tracked correctly across that cross-subdomain hop — the same category of gap that caused the original CPC attribution-loss investigation. Not fixed or assumed either way here; flagging the pattern.

---

## ab_test_product_mix

**Grain:** one row per `test_id`, `session_date`, `variant_id`, `device_category`, `item_name`
**Scope:** Test 5+ only, by construction — this table is built from the same `experiment_impression`-based assignment chain as `ab_test_metrics`, so Test 3/4 never produce rows here. No exclusion filter needed or applied.

| Column | Definition |
|---|---|
| `item_name` | GA4 item name, `(not set)` preserved where GA4 didn't provide one. |
| `transactions` | Distinct `transaction_id`s that included this `item_name`. **Not** a count of item lines — an order with 2x the same item is 1 transaction, 2 `items_purchased`. |
| `items_purchased` | `SUM(quantity)` for this `item_name`. |

### Relationship to ab_test_metrics
Joined on `test_id + session_date + variant_id + device_category` (one-to-many: one metrics row can have several product-mix rows, one per `item_name`). `sessions` and `conversions` live **only** on `ab_test_metrics` — product mix has no denominator of its own.

### Two distinct "item conversion rate" definitions — do not conflate them

**`item_cvr`** (sessions denominator) = `transactions` (filtered to item) / `sessions` (unfiltered)
"Of everyone who visited, what fraction bought this item." Moves if the variant changes overall traffic-to-purchase behavior.

**`item_share_of_conversions`** (conversions denominator) = `transactions` (filtered to item) / `conversions` (unfiltered)
"Of everyone who bought something, what fraction bought this item." Isolates basket composition, independent of overall CVR shifts.

Both require the denominator to ignore whatever `item_name` filter is active — equivalent to Power BI's `ALL(item_name)`. In code (see `lib/productMix.ts`) this means: compute `sessions`/`conversions` from `ab_test_metrics` **before** filtering product-mix rows down to a specific item, never after.

**Caveat:** `transactions` is item-transactions, not distinct-order count. An order containing both a "Lunch" item and a non-Lunch item counts once toward each item's `transactions` — so `SUM(transactions)` across all `item_name`s overcounts total order count. Use `ab_test_metrics.conversions` as "total orders," never `SUM(product_mix.transactions)`.

---

## ab_test_upsell_diagnostics

**Grain:** one row per `test_id`, `session_date`, `variant_id`, `device_category`
**Source table:** `test_5_diagnostic_daily`. Despite the name, queried generically on `test_id` — currently holds `test_5` data only. Whether future tests will populate it or need a successor table is **unconfirmed** (see build guide Open Items).

Two independent placements, each with its own impression/accept pair — unlike the checkout funnel, no ordering assumption is needed here:

| Column | Definition |
|---|---|
| `upsell_inline_impression_sessions` | Sessions shown the inline upsell. |
| `upsell_inline_accept_sessions` | Sessions that accepted the inline upsell. |
| `upsell_interstitial_impression_sessions` | Sessions shown the interstitial upsell. |
| `upsell_interstitial_accept_sessions` | Sessions that accepted the interstitial upsell. |

`accept_rate = accepts / impressions`, per placement. **No variance data available for these columns** — any lift between placements is a point estimate only, never a significance claim.

---

## Calculated metrics (all views)

```
cvr = conversions / sessions
rps = total_revenue / sessions
aov = total_revenue / conversions   -- point estimate only, see below
```

## Statistical methods

- **CVR:** two-proportion z-test, pooled SE for the test statistic, unpooled SE for the 95% CI. Matches the convention already validated in the Power BI model (`pcc_ab_test_technical_reference.md`'s DAX significance measures). Implemented in `lib/stats.ts::zTestCVR`.
- **RPS:** Welch's t-test using `sum_revenue_sq` (session-grain, matches RPS's own unit — statistically sound). p-value approximated with the normal distribution rather than a rigorous t-distribution CDF (reasonable at these sample sizes for a dashboard). Implemented in `lib/stats.ts::welchTestRPS`. Returns `null` — not a fabricated result — whenever either side lacks `sum_revenue_sq` (e.g. a Method A test).
- **AOV:** lift % shown, **no significance claimed, ever**. `sum_revenue_sq` is session-grain, which matches RPS's unit but not AOV's (per-order — a session can have 0 or 2+ orders). A rigorous AOV variance would need order-grain sum-of-squares, not currently in the pipeline. Do not add a significance test for AOV without that data existing first.
- **Upsell placement comparison:** point estimate only (`comparePlacements` in `lib/upsell.ts`), same reasoning as AOV — no variance data captured for these columns.

## Test scope note

`test_6` is excluded from `ab_test_metrics` as of 2026-08-19. This is a **temporary status exclusion** (not live yet, rows observed are test/dev data), not a permanent architectural one like Test 3/4's Method A exclusion. See `TEST_REGISTRY` in `lib/testRegistry.ts` — flip `status: 'live'` there once `test_6` actually launches; don't just delete it from an exclusion list somewhere and forget the distinction.

`sold_out_view_metrics` and `packages_metric_daily` exist in the same BigQuery dataset but are **out of scope** for this dashboard — neither is test-scoped (no `test_id`/`variant_id`), and `sold_out_view_metrics` was explicitly confirmed not needed.