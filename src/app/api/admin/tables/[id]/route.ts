import { requireStaff } from "@/lib/admin";
import { exec } from "@/lib/db";
import { emit } from "@/lib/events";
import { fail, ok, readJson } from "@/lib/http";
import { closeSession, createSession, getLiveSession, getTable, openSession } from "@/lib/repo";

/**
 * Acciones del mesero sobre una mesa:
 * open (abrir sin escanear), approve / reject (solicitud pendiente),
 * close (la mesa se fue: invalida todos los teléfonos), grant_reward (otro intento de premio).
 */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/tables/[id]">) {
  const user = await requireStaff(req);
  if (user instanceof Response) return user;
  const id = Number((await ctx.params).id);
  const table = Number.isInteger(id) ? await getTable(id) : undefined;
  if (!table || table.restaurant_id !== user.restaurant_id) return fail(404, "Mesa no encontrada.");

  const body = await readJson<{ action?: string }>(req);
  const live = await getLiveSession(table.id);

  switch (body?.action) {
    case "open":
      if (live?.session.status === "pending") await openSession(live.session.id);
      else if (!live) await createSession(table, "open");
      return ok();
    case "approve":
      if (live?.session.status !== "pending") return fail(409, "La mesa no tiene una solicitud pendiente.");
      await openSession(live.session.id);
      return ok();
    case "reject":
    case "close":
      if (live) await closeSession(live.session.id);
      return ok();
    case "grant_reward":
      if (live?.session.status !== "open") return fail(409, "La mesa no está activa.");
      await exec("UPDATE table_sessions SET reward_used = 0 WHERE id = $1", [live.session.id]);
      emit(user.restaurant_id, "tables");
      return ok();
    default:
      return fail(400, "Acción inválida.");
  }
}
