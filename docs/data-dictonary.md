## Checkout funnel (daily_variant_metrics)

sessions -> add_to_cart_sessions -> begin_checkout_sessions ->
add_payment_info_sessions -> purchase_redirect_sessions -> conversions

STATUS: step order above is ASSUMED, not confirmed against the pipeline
that populates these columns. Do not present drop-off percentages as
authoritative until this is verified. See Open Items.

checkout_error_sessions / availability_fetch_error_sessions are error
branches, not sequential steps — report their rate separately
(errors / begin_checkout_sessions and errors / sessions respectively),
never inline in the linear funnel above.

## Upsell diagnostics (test_5_diagnostic_daily via ab_test_upsell_diagnostics)

Two independent placements, each with its own impression/accept pair —
no ordering assumption needed, unlike the funnel above:
  upsell_inline_impression_sessions / upsell_inline_accept_sessions
  upsell_interstitial_impression_sessions / upsell_interstitial_accept_sessions

accept_rate = accepts / impressions, per placement.
No variance data available for these columns — lift between placements
is a point estimate only, no significance test.

## Test scope note

test_6 is excluded from ab_test_metrics as of 2026-08-19. This is a
TEMPORARY status exclusion (not live yet, rows are test data), not a
permanent architectural one like Test 3/4. See testRegistry.ts.