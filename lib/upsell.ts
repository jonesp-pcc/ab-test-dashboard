// Upsell accept rates. Unlike the checkout funnel, these column names pair
// unambiguously (impression -> accept, inline vs interstitial as two
// independent placements, not sequential steps), so no assumed ordering
// is needed here.

export interface UpsellRow {
  upsell_inline_impression_sessions: number;
  upsell_inline_accept_sessions: number;
  upsell_interstitial_impression_sessions: number;
  upsell_interstitial_accept_sessions: number;
}

export function upsellAcceptRates(agg: UpsellRow) {
  return {
    inline: {
      impressions: agg.upsell_inline_impression_sessions,
      accepts: agg.upsell_inline_accept_sessions,
      acceptRate: agg.upsell_inline_impression_sessions
        ? agg.upsell_inline_accept_sessions / agg.upsell_inline_impression_sessions
        : null,
    },
    interstitial: {
      impressions: agg.upsell_interstitial_impression_sessions,
      accepts: agg.upsell_interstitial_accept_sessions,
      acceptRate: agg.upsell_interstitial_impression_sessions
        ? agg.upsell_interstitial_accept_sessions / agg.upsell_interstitial_impression_sessions
        : null,
    },
  };
}

// Whether one placement clearly outperforms the other on accept rate.
// No significance test here (no variance data available for a proportion
// test on these columns) — this is a point-estimate comparison only.
export function comparePlacements(agg: UpsellRow) {
  const rates = upsellAcceptRates(agg);
  if (rates.inline.acceptRate == null || rates.interstitial.acceptRate == null) return null;
  const diff = rates.inline.acceptRate - rates.interstitial.acceptRate;
  return {
    leader: diff === 0 ? null : diff > 0 ? "inline" : "interstitial",
    diff,
  };
}
