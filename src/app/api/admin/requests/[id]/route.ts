import { requireStaff } from "@/lib/admin";
import { db } from "@/lib/db";
import { emit } from "@/lib/events";
import { fail, ok, readJson } from "@/lib/http";

const ALLOWED = new Set(["attending", "done", "cancelled"]);

/** Cambia el estado de una alerta: "voy en camino", "listo" o "descartar". */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/requests/[id]">) {
  const user = await requireStaff(req);
  if (user instanceof Response) return user;
  const { id } = await ctx.params;
  const body = await readJson<{ status?: string }>(req);
  const status = body?.status ?? "";
  if (!ALLOWED.has(status)) return fail(400, "Estado inválido.");

  const r = db()
    .prepare(
      `UPDATE requests SET status = ?, handled_by = ?, updated_at = datetime('now')
       WHERE id = ? AND restaurant_id = ?`,
    )
    .run(status, user.id, Number(id), user.restaurant_id);
  if (r.changes === 0) return fail(404, "No encontrada.");
  emit(user.restaurant_id, "requests");
  return ok();
}
