// Mirrors the DAX measures validated in Power BI:
//   item_cvr                 ~ lunch_cvr
//   item_share_of_conversions ~ lunch_share_of_conversions
//
// Both need the denominator (sessions/conversions) computed from the FULL,
// unfiltered metrics rows for the variant/date/device slice — never from a
// version already filtered down to one item_name. That's what DAX's
// ALL(item_name) does; here it just means: pass metricsAgg in separately
// from the item-filtered product-mix rows, don't derive sessions from them.

export interface MetricsAgg {
  sessions: number;
  conversions: number;
}

export interface ProductMixRow {
  item_name: string;
  transactions: number;
  items_purchased: number;
}

// transactions summed across item rows matching a name filter (substring,
// case-insensitive — same as DAX's CONTAINSSTRING). Pass a null filter to
// get the "all items" total, but see the caveat: that total is
// item-transactions, not distinct orders — don't present it as "total orders."
function sumTransactions(rows: ProductMixRow[], itemNameContains: string | null): number {
  const matches = itemNameContains
    ? rows.filter((r) => r.item_name.toLowerCase().includes(itemNameContains.toLowerCase()))
    : rows;
  return matches.reduce((s, r) => s + r.transactions, 0);
}

export function itemCvr(productMixRows: ProductMixRow[], metricsAgg: MetricsAgg, itemNameContains: string) {
  if (!metricsAgg.sessions) return null;
  return sumTransactions(productMixRows, itemNameContains) / metricsAgg.sessions;
}

export function itemShareOfConversions(productMixRows: ProductMixRow[], metricsAgg: MetricsAgg, itemNameContains: string) {
  if (!metricsAgg.conversions) return null;
  return sumTransactions(productMixRows, itemNameContains) / metricsAgg.conversions;
}

// Share of item-transactions, i.e. "of all item-level transaction records,
// what fraction mention this item" — matches pct_transactions_lunch in DAX.
// Distinct from itemShareOfConversions: this denominator is SUM(all item
// transactions), which double-counts multi-item orders, so it answers a
// different question (see data-dictionary-product-mix-addendum.md).
export function pctTransactionsForItem(productMixRows: ProductMixRow[], itemNameContains: string) {
  const total = sumTransactions(productMixRows, null);
  if (!total) return null;
  return sumTransactions(productMixRows, itemNameContains) / total;
}

// Aggregates item rows into a simple breakdown for a table/chart, sorted by
// transaction volume descending.
export function buildItemBreakdown(productMixRows: ProductMixRow[]) {
  const byItem = new Map<string, { item_name: string; transactions: number; items_purchased: number }>();
  productMixRows.forEach((r) => {
    const existing = byItem.get(r.item_name) ?? { item_name: r.item_name, transactions: 0, items_purchased: 0 };
    existing.transactions += r.transactions;
    existing.items_purchased += r.items_purchased;
    byItem.set(r.item_name, existing);
  });
  return Array.from(byItem.values()).sort((a, b) => b.transactions - a.transactions);
}
