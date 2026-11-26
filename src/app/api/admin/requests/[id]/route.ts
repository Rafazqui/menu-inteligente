import { requireStaff } from "@/lib/admin";
import { exec } from "@/lib/db";
import { emit } from "@/lib/events";
import { fail, ok, readJson } from "@/lib/http";

const ALLOWED = new Set(["attending", "done", "cancelled"]);

/** Cambia el estado de una alerta: "voy en camino", "listo" o "descartar". */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/requests/[id]">) {
  const user = await requireStaff(req);
  if (user instanceof Response) return user;
  const id = Number((await ctx.params).id);
  const body = await readJson<{ status?: string }>(req);
  const status = body?.status ?? "";
  if (!ALLOWED.has(status) || !Number.isInteger(id)) return fail(400, "Estado inválido.");

  const changed = await exec(
    `UPDATE requests SET status = $1::text, handled_by = $2, updated_at = now(),
       -- se guarda solo la PRIMERA respuesta, para medir qué tan rápido se atiende
       responded_at = CASE WHEN $1::text IN ('attending','done') THEN COALESCE(responded_at, now()) ELSE responded_at END
     WHERE id = $3 AND restaurant_id = $4`,
    [status, user.id, id, user.restaurant_id],
  );
  if (changed === 0) return fail(404, "No encontrada.");
  emit(user.restaurant_id, "requests");
  return ok();
}
