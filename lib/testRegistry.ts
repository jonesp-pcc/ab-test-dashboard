export type AssignmentMethod = "A" | "B";
export type TestStatus = "live" | "excluded_legacy" | "excluded_not_live";

export interface TestDefinition {
  testId: string;
  label: string;
  method: AssignmentMethod;
  status: TestStatus;
  firstDate?: string;
  lastDate?: string;
  notes?: string;
}

// A "diagnostic module" is any supplementary, test-scoped table beyond the
// core metrics table — product mix, upsell funnels, or whatever a future
// test introduces. Adding a new one never touches existing modules.
export interface DiagnosticModule {
  key: string;            // stable id used in API query params, e.g. 'product_mix'
  label: string;
  sourceTable: string;    // underlying BigQuery base table
  viewName: string;       // AI-facing view in analytics_ai
  appliesTo: string[];    // test_ids confirmed to have data in this module
  notes?: string;
}

export const TEST_REGISTRY: TestDefinition[] = [
  {
    testId: "pcc_packages_5_95_20260609",
    label: "Test 3",
    method: "A",
    status: "excluded_legacy",
    firstDate: "2026-06-09",
    lastDate: "2026-06-22",
    notes: "Frozen one-time backfill, never scheduled.",
  },
  {
    testId: "pcc_packages_5_80_15_20260623",
    label: "Test 4",
    method: "A",
    status: "excluded_legacy",
    firstDate: "2026-06-23",
    lastDate: "2026-07-26",
    notes: "Hostname-heuristic method, ended.",
  },
  {
    testId: "test_5",
    label: "Test 5",
    method: "B",
    status: "live",
    firstDate: "2026-08-05",
    notes: "Current focus test.",
  },
  {
    testId: "test_6",
    label: "Test 6",
    method: "B",
    status: "excluded_not_live",
    firstDate: "2026-08-14",
    notes: "Not live yet. Observed rows are test/dev data — flip to 'live' once confirmed real.",
  },
];

export const DIAGNOSTIC_MODULES: DiagnosticModule[] = [
  {
    key: "product_mix",
    label: "Product mix",
    sourceTable: "daily_variant_product_mix",
    viewName: "analytics_ai.ab_test_product_mix",
    appliesTo: ["test_5"],
  },
  {
    key: "upsell_diagnostics",
    label: "Upsell funnel diagnostics",
    sourceTable: "test_5_diagnostic_daily",
    viewName: "analytics_ai.ab_test_upsell_diagnostics",
    appliesTo: ["test_5"],
    notes: "Table name suggests test_5-only; unconfirmed whether future tests will populate it or need a successor table.",
  },
];

export function getTest(testId: string) {
  return TEST_REGISTRY.find((t) => t.testId === testId);
}
export function isInScope(testId: string) {
  return getTest(testId)?.status === "live";
}
export function getModulesForTest(testId: string) {
  return DIAGNOSTIC_MODULES.filter((m) => m.appliesTo.includes(testId));
}
