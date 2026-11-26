import { requireStaff } from "@/lib/admin";
import { exec } from "@/lib/db";
import { emit } from "@/lib/events";
import { fail, ok, readJson } from "@/lib/http";

/** El personal marca un juego prestado como devuelto (vuelve al estante). */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/boardgames/[id]">) {
  const user = await requireStaff(req);
  if (user instanceof Response) return user;
  const id = Number((await ctx.params).id);
  const b = await readJson<{ action?: string }>(req);
  if (b?.action !== "return" || !Number.isInteger(id)) return fail(400, "Acción inválida.");
  const changed = await exec(
    "UPDATE board_games SET in_use_session_id = NULL, in_use_since = NULL WHERE id = $1 AND restaurant_id = $2",
    [id, user.restaurant_id],
  );
  if (changed === 0) return fail(404, "Juego no encontrado.");
  emit(user.restaurant_id, "requests");
  return ok();
}
