import { BigQuery } from "@google-cloud/bigquery";

function getBigQueryClient() {
  // Production (Azure App Service): key JSON is stored base64-encoded in an
  // app setting, since there's no persistent file path to point to.
  const b64 = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON_B64;
  if (b64) {
    const credentials = JSON.parse(Buffer.from(b64, "base64").toString("utf-8"));
    return new BigQuery({ projectId: credentials.project_id, credentials });
  }
  // Local dev: falls back to GOOGLE_APPLICATION_CREDENTIALS file path in .env.local
  return new BigQuery();
}

const bigquery = getBigQueryClient();

// The @google-cloud/bigquery client returns DATE columns as a BigQueryDate
// object ({ value: "2026-08-14" }), not a plain string — even though the
// column is typed `string` everywhere in this app. Left unconverted, this
// object survives NextResponse.json() as a plain { value: "..." } object,
// and anything downstream calling .slice()/.split() on it (expecting a
// string) throws at runtime, not at compile time — my earlier type-check
// against a minimal stub couldn't catch this, since the stub didn't model
// BigQuery's actual return shape for DATE. Normalize every row's
// session_date to a plain string here, once, so nothing downstream (the
// API route, page.tsx) needs to know about BigQueryDate at all.
function normalizeDate(row: any): any {
  if (row?.session_date && typeof row.session_date === "object" && "value" in row.session_date) {
    return { ...row, session_date: row.session_date.value };
  }
  return row;
}

export async function getTestPerformance(testId: string, startDate: string, endDate: string) {
  const query = `
    SELECT
      test_id, session_date, variant_id, device_category,
      sessions, engaged_sessions, conversions,
      total_revenue, items_purchased, sum_revenue_sq, sum_items_sq,
      add_to_cart_sessions, purchase_redirect_sessions, begin_checkout_sessions,
      add_payment_info_sessions, checkout_error_sessions, availability_fetch_error_sessions
    FROM \`pcc-marketing-analytics-prod.analytics_ai.ab_test_metrics\`
    WHERE test_id = @testId AND session_date BETWEEN @startDate AND @endDate
    ORDER BY session_date
  `;
  const [rows] = await bigquery.query({ query, params: { testId, startDate, endDate } });
  return rows.map(normalizeDate);
}

export async function getProductMix(testId: string, startDate: string, endDate: string) {
  const query = `
    SELECT test_id, session_date, variant_id, device_category, item_name, transactions, items_purchased
    FROM \`pcc-marketing-analytics-prod.analytics_ai.ab_test_product_mix\`
    WHERE test_id = @testId AND session_date BETWEEN @startDate AND @endDate
    ORDER BY session_date, item_name
  `;
  const [rows] = await bigquery.query({ query, params: { testId, startDate, endDate } });
  return rows.map(normalizeDate);
}

export async function getUpsellDiagnostics(testId: string, startDate: string, endDate: string) {
  const query = `
    SELECT test_id, session_date, variant_id, device_category,
      upsell_inline_impression_sessions, upsell_inline_accept_sessions,
      upsell_interstitial_impression_sessions, upsell_interstitial_accept_sessions
    FROM \`pcc-marketing-analytics-prod.analytics_ai.ab_test_upsell_diagnostics\`
    WHERE test_id = @testId AND session_date BETWEEN @startDate AND @endDate
    ORDER BY session_date
  `;
  const [rows] = await bigquery.query({ query, params: { testId, startDate, endDate } });
  return rows.map(normalizeDate);
}

export async function listAvailableTests() {
  const query = `SELECT DISTINCT test_id FROM \`pcc-marketing-analytics-prod.analytics_ai.ab_test_metrics\` ORDER BY test_id DESC`;
  const [rows] = await bigquery.query({ query });
  return rows.map((r: any) => r.test_id);
}