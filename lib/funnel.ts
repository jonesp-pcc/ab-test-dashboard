// Checkout funnel drop-off, built from daily_variant_metrics' funnel columns.
//
// CONFIRMED STEP ORDER (2026-08-19, confirmed directly — no longer a guess):
//
//   sessions
//     -> add_to_cart_sessions
//       -> purchase_redirect_sessions   (redirect off packages subdomain
//                                         to ticketing.polynesia.com)
//         -> begin_checkout_sessions
//           -> add_payment_info_sessions
//             -> conversions (purchase event, from ab_test_metrics)
//
//   checkout_error_sessions / availability_fetch_error_sessions are treated
//   as SIDE BRANCHES (errors that can occur at/after begin_checkout), not
//   sequential steps in the main line above.

export interface FunnelRow {
  sessions: number;
  add_to_cart_sessions: number;
  purchase_redirect_sessions: number;
  begin_checkout_sessions: number;
  add_payment_info_sessions: number;
  checkout_error_sessions: number;
  availability_fetch_error_sessions: number;
  conversions: number;
}

export interface FunnelStep {
  key: string;
  label: string;
  sessions: number;
  pctOfPriorStep: number | null;
  pctOfTotalSessions: number | null;
}

export function buildFunnel(agg: FunnelRow): FunnelStep[] {
  const steps: { key: string; label: string; sessions: number }[] = [
    { key: "sessions", label: "Sessions", sessions: agg.sessions },
    { key: "add_to_cart_sessions", label: "Added to cart", sessions: agg.add_to_cart_sessions },
    { key: "purchase_redirect_sessions", label: "Redirected to purchase", sessions: agg.purchase_redirect_sessions },
    { key: "begin_checkout_sessions", label: "Began checkout", sessions: agg.begin_checkout_sessions },
    { key: "add_payment_info_sessions", label: "Added payment info", sessions: agg.add_payment_info_sessions },
    { key: "conversions", label: "Converted", sessions: agg.conversions },
  ];

  return steps.map((step, i) => {
    const prior = i > 0 ? steps[i - 1].sessions : null;
    return {
      ...step,
      pctOfPriorStep: prior ? step.sessions / prior : null,
      pctOfTotalSessions: agg.sessions ? step.sessions / agg.sessions : null,
    };
  });
}

// Error-branch rates, reported separately from the linear funnel above
// since their position in the sequence isn't confirmed.
export function errorRates(agg: FunnelRow) {
  return {
    checkoutErrorRate: agg.begin_checkout_sessions
      ? agg.checkout_error_sessions / agg.begin_checkout_sessions
      : null,
    availabilityFetchErrorRate: agg.sessions
      ? agg.availability_fetch_error_sessions / agg.sessions
      : null,
  };
}