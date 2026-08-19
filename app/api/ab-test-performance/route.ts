import { NextRequest, NextResponse } from "next/server";
import { getTestPerformance, getProductMix, getUpsellDiagnostics } from "@/lib/bigquery";
import { getModulesForTest, isInScope } from "@/lib/testRegistry";
import { getServerSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getServerSession(req);
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const testId = searchParams.get("testId");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  if (!testId || !startDate || !endDate) {
    return NextResponse.json({ error: "Missing testId, startDate, or endDate" }, { status: 400 });
  }
  if (!isInScope(testId)) {
    return NextResponse.json({ error: `${testId} is not in scope` }, { status: 404 });
  }

  const modules = getModulesForTest(testId);
  const wantsProductMix = modules.some((m) => m.key === "product_mix");
  const wantsUpsell = modules.some((m) => m.key === "upsell_diagnostics");

  try {
    const [metrics, productMix, upsell] = await Promise.all([
      getTestPerformance(testId, startDate, endDate),
      wantsProductMix ? getProductMix(testId, startDate, endDate) : Promise.resolve([]),
      wantsUpsell ? getUpsellDiagnostics(testId, startDate, endDate) : Promise.resolve([]),
    ]);
    return NextResponse.json({
      metrics,
      productMix,
      productMixAvailable: wantsProductMix,
      upsell,
      upsellAvailable: wantsUpsell,
    });
  } catch (err) {
    console.error("BigQuery query failed:", err);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }
}