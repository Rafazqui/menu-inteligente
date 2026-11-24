import { getTableContext } from "@/lib/auth";
import { db } from "@/lib/db";
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

  const d = db();
  const sid = ctx.session.id;
  const rid = ctx.restaurant.id;

  const total = d.prepare("SELECT COUNT(*) AS n FROM requests WHERE session_id = ?").get(sid) as { n: number };
  if (total.n >= MAX_REQUESTS_PER_SESSION || !rateLimit(`req:${sid}`, 8, 60_000)) {
    return fail(429, "Demasiadas solicitudes. Espera un momento, por favor.");
  }

  if (body.type === "waiter") {
    const message = (body.message ?? "").toString().trim().slice(0, 140) || null;
    const { waiterCooldownSec } = getSettings(rid);
    const last = d
      .prepare(
        `SELECT CAST((julianday('now') - julianday(created_at)) * 86400 AS INTEGER) AS ago
         FROM requests WHERE session_id = ? AND type = 'waiter' ORDER BY id DESC LIMIT 1`,
      )
      .get(sid) as { ago: number } | undefined;
    if (last && last.ago < waiterCooldownSec) {
      const wait = waiterCooldownSec - last.ago;
      return fail(429, `Ya avisamos a tu mesero. Podrás llamar de nuevo en ${wait} s.`, { wait });
    }
    d.prepare(
      "INSERT INTO requests (restaurant_id, table_id, session_id, type, message) VALUES (?, ?, ?, 'waiter', ?)",
    ).run(rid, ctx.table.id, sid, message);
    emit(rid, "requests", true);
    return ok({ ok: true });
  }

  if (body.type === "boardgame") {
    const gameId = Number(body.boardGameId);
    const game = d
      .prepare("SELECT id, name FROM board_games WHERE id = ? AND restaurant_id = ? AND available = 1")
      .get(gameId, rid) as { id: number; name: string } | undefined;
    if (!game) return fail(404, "Ese juego no está disponible en este momento.");
    const dup = d
      .prepare(
        "SELECT id FROM requests WHERE session_id = ? AND board_game_id = ? AND status IN ('pending','attending')",
      )
      .get(sid, gameId);
    if (dup) return fail(409, `Ya pediste ${game.name}. Tu mesero va en camino.`);
    d.prepare(
      "INSERT INTO requests (restaurant_id, table_id, session_id, type, board_game_id) VALUES (?, ?, ?, 'boardgame', ?)",
    ).run(rid, ctx.table.id, sid, gameId);
    emit(rid, "requests", true);
    return ok({ ok: true });
  }

  return fail(400, "Tipo de solicitud desconocido.");
}
