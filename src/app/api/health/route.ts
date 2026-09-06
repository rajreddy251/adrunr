export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    ok: true,
    service: "adrunr",
    safety: "paused-default dry-run-preferred no-enable-path",
  });
}
