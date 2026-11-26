import type { NextRequest } from "next/server";
import { requireStaff } from "@/lib/admin";
import { ok } from "@/lib/http";
import { getStats, RANGE_DAYS, type StatsRange } from "@/lib/stats";

export const dynamic = "force-dynamic";

/** Estadísticas del negocio (solo el dueño). ?range=hoy|7d|30d */
export async function GET(req: NextRequest) {
  const user = await requireStaff(null, "owner");
  if (user instanceof Response) return user;
  const param = req.nextUrl.searchParams.get("range") ?? "7d";
  const range: StatsRange = param in RANGE_DAYS ? (param as StatsRange) : "7d";
  return ok(await getStats(user.restaurant_id, range));
}
