import { getTableContext } from "@/lib/auth";
import { q, q1 } from "@/lib/db";
import { emit } from "@/lib/events";
import { fail, ok, rateLimit, readJson, sameOrigin } from "@/lib/http";
import { getSettings } from "@/lib/repo";

const MAX_REQUESTS_PER_SESSION = 40;

/** Llamar al mesero o pedir un juego de mesa. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, "Origen no permitido.");
  const ctx = await getTableContext();
  if (!ctx) return fail(401, "sin_sesion");
  if (ctx.session.status !== "open") {
    return fail(403, "Tu mesa aún no está activa. Tu mesero la activará en un momento.");
  }

  const body = await readJson<{ type?: string; message?: string; boardGameId?: number }>(req);
  if (!body) return fail(400, "Solicitud inválida.");

  const sid = ctx.session.id;
  const rid = ctx.restaurant.id;

  const total = await q1<{ n: number }>("SELECT COUNT(*)::int AS n FROM requests WHERE session_id = $1", [sid]);
  if ((total?.n ?? 0) >= MAX_REQUESTS_PER_SESSION || !rateLimit(`req:${sid}`, 8, 60_000)) {
    return fail(429, "Demasiadas solicitudes. Espera un momento, por favor.");
  }

  if (body.type === "waiter") {
    const message = (body.message ?? "").toString().trim().slice(0, 140) || null;
    const { waiterCooldownSec } = await getSettings(rid);
    const last = await q1<{ ago: number }>(
      `SELECT EXTRACT(EPOCH FROM now() - created_at)::int AS ago
       FROM requests WHERE session_id = $1 AND type = 'waiter' ORDER BY id DESC LIMIT 1`,
      [sid],
    );
    if (last && last.ago < waiterCooldownSec) {
      const wait = waiterCooldownSec - last.ago;
      return fail(429, `Ya avisamos a tu mesero. Podrás llamar de nuevo en ${wait} s.`, { wait });
    }
    await q(
      "INSERT INTO requests (restaurant_id, table_id, session_id, type, message) VALUES ($1, $2, $3, 'waiter', $4)",
      [rid, ctx.table.id, sid, message],
    );
    emit(rid, "requests", true);
    return ok({ ok: true });
  }

  if (body.type === "boardgame") {
    const gameId = Number(body.boardGameId);
    if (!Number.isInteger(gameId)) return fail(404, "Ese juego no está disponible en este momento.");
    const game = await q1<{ id: number; name: string }>(
      "SELECT id, name FROM board_games WHERE id = $1 AND restaurant_id = $2 AND available = 1",
      [gameId, rid],
    );
    if (!game) return fail(404, "Ese juego no está disponible en este momento.");
    const dup = await q1(
      "SELECT id FROM requests WHERE session_id = $1 AND board_game_id = $2 AND status IN ('pending','attending')",
      [sid, gameId],
    );
    if (dup) return fail(409, `Ya pediste ${game.name}. Tu mesero va en camino.`);
    await q(
      "INSERT INTO requests (restaurant_id, table_id, session_id, type, board_game_id) VALUES ($1, $2, $3, 'boardgame', $4)",
      [rid, ctx.table.id, sid, gameId],
    );
    emit(rid, "requests", true);
    return ok({ ok: true });
  }

  return fail(400, "Tipo de solicitud desconocido.");
}
