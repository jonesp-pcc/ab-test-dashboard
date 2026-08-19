## Checkout funnel panel

Horizontal step chart, one bar per step in FunnelChart.tsx, using
buildFunnel() from lib/funnel.ts. Each step shows: session count,
% of prior step, % of total sessions. Error rates (checkout error,
availability fetch error) shown as two small stat callouts beside
the funnel, not as funnel steps.

Props:
  FunnelChart({ steps: FunnelStep[], errorRates: { checkoutErrorRate, availabilityFetchErrorRate } })

## Upsell placement panel

Two-column comparison card (inline vs interstitial), using
upsellAcceptRates() + comparePlacements() from lib/upsell.ts.
Shows impressions, accepts, accept rate per placement, and which
placement currently leads (point estimate only — label this
explicitly as "no significance test" in the UI, same treatment as AOV).

Props:
  UpsellPanel({ inline: PlacementStats, interstitial: PlacementStats, leader: string | null })

## Availability rule (both new panels)

Render "Not available for this test" — not zeros, not a hidden panel —
whenever getModulesForTest(testId) doesn't include the relevant module key
('upsell_diagnostics' for the funnel's error-rate context / upsell panel).
This will be true for every test except test_5 until the registry is extended.