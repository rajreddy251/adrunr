import { runGa4SampleReport } from "@/lib/ga4";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const result = await runGa4SampleReport();
  return Response.json(result, { status: 200 });
}
