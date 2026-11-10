import { prisma } from "@/kit/db";
import { logger } from "@/kit/log";

export const dynamic = "force-dynamic";

/** Unauthenticated liveness + DB check for load balancers and docker compose. Returns no data. */
export async function GET(): Promise<Response> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok", db: "ok" });
  } catch (err) {
    await logger.error("health_check_failed", { error: err instanceof Error ? err.message : String(err) });
    return Response.json({ status: "error", db: "unreachable" }, { status: 503 });
  }
}
