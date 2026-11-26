import { requireStaff } from "@/lib/admin";
import { exec, q1 } from "@/lib/db";
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

  const r = await q1<{ type: string; board_game_id: number | null; session_id: number }>(
    `UPDATE requests SET status = $1::text, handled_by = $2, updated_at = now(),
       -- se guarda solo la PRIMERA respuesta, para medir qué tan rápido se atiende
       responded_at = CASE WHEN $1::text IN ('attending','done') THEN COALESCE(responded_at, now()) ELSE responded_at END
     WHERE id = $3 AND restaurant_id = $4
     RETURNING type, board_game_id, session_id`,
    [status, user.id, id, user.restaurant_id],
  );
  if (!r) return fail(404, "No encontrada.");
  // Juego entregado → queda "en uso" por esa mesa hasta que lo devuelvan o se cierre la mesa.
  if (status === "done" && r.type === "boardgame" && r.board_game_id) {
    await exec(
      "UPDATE board_games SET in_use_session_id = $1, in_use_since = now() WHERE id = $2 AND restaurant_id = $3",
      [r.session_id, r.board_game_id, user.restaurant_id],
    );
  }
  emit(user.restaurant_id, "requests");
  return ok();
}
