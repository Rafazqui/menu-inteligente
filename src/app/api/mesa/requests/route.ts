import { getTableContext } from "@/lib/auth";
import { q1 } from "@/lib/db";
import { emit } from "@/lib/events";
import { fail, ok, rateLimit, readJson, sameOrigin } from "@/lib/http";
import { notifyStaff } from "@/lib/push";
import { getSettings } from "@/lib/repo";
import { PAYMENT_LABEL, type PaymentMethod } from "@/lib/types";

const MAX_REQUESTS_PER_SESSION = 40;

/** Llamar al mesero, pedir un juego, pedir la cuenta o pedir una recomendación. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, "Origen no permitido.");
  const ctx = await getTableContext();
  if (!ctx) return fail(401, "sin_sesion");
  if (ctx.session.status !== "open") {
    return fail(403, "Tu mesa aún no está activa. Tu mesero la activará en un momento.");
  }

  const body = await readJson<{
    type?: string;
    message?: string;
    boardGameId?: number;
    method?: string;
    promoId?: number;
  }>(req);
  if (!body) return fail(400, "Solicitud inválida.");

  const sid = ctx.session.id;
  const rid = ctx.restaurant.id;
  const mesa = `Mesa ${ctx.table.number}`;

  const total = await q1<{ n: number }>("SELECT COUNT(*)::int AS n FROM requests WHERE session_id = $1", [sid]);
  if ((total?.n ?? 0) >= MAX_REQUESTS_PER_SESSION || !rateLimit(`req:${sid}`, 8, 60_000)) {
    return fail(429, "Demasiadas solicitudes. Espera un momento, por favor.");
  }

  /** Guarda la solicitud y avisa al panel y a los celulares del personal. */
  async function create(
    fields: { type: string; message?: string | null; boardGameId?: number | null; method?: string | null; promoId?: number | null },
    push: { title: string; body: string },
  ) {
    const row = await q1<{ id: number }>(
      `INSERT INTO requests (restaurant_id, table_id, session_id, type, message, board_game_id, payment_method, promo_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [rid, ctx!.table.id, sid, fields.type, fields.message ?? null, fields.boardGameId ?? null, fields.method ?? null, fields.promoId ?? null],
    );
    emit(rid, "requests", true);
    notifyStaff(rid, { ...push, tag: `req-${row!.id}` });
    return ok({ ok: true });
  }

  const pendingOf = (where: string, params: unknown[]) =>
    q1(`SELECT id FROM requests WHERE session_id = $1 AND status IN ('pending','attending') AND ${where}`, [sid, ...params]);

  switch (body.type) {
    case "waiter": {
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
      return create({ type: "waiter", message }, { title: `${mesa} · Llama al mesero`, body: message ?? "Te necesitan en la mesa." });
    }

    case "boardgame": {
      const gameId = Number(body.boardGameId);
      if (!Number.isInteger(gameId)) return fail(404, "Ese juego no está disponible en este momento.");
      const game = await q1<{ id: number; name: string; in_use_session_id: number | null }>(
        "SELECT id, name, in_use_session_id FROM board_games WHERE id = $1 AND restaurant_id = $2 AND available = 1",
        [gameId, rid],
      );
      if (!game) return fail(404, "Ese juego no está disponible en este momento.");
      if (game.in_use_session_id === sid) return fail(409, `Ya tienes ${game.name} en tu mesa.`);
      if (game.in_use_session_id) return fail(409, `${game.name} lo está usando otra mesa ahorita. Prueba con otro.`);
      if (await pendingOf("board_game_id = $2", [gameId])) return fail(409, `Ya pediste ${game.name}. Tu mesero va en camino.`);
      return create({ type: "boardgame", boardGameId: gameId }, { title: `${mesa} · Pide un juego`, body: game.name });
    }

    case "bill": {
      const method = body.method === "tarjeta" ? "tarjeta" : body.method === "efectivo" ? "efectivo" : null;
      if (!method) return fail(400, "Elige cómo vas a pagar.");
      if (await pendingOf("type = 'bill'", [])) return fail(409, "Ya pediste la cuenta. Tu mesero va en camino.");
      return create(
        { type: "bill", method },
        { title: `${mesa} · Pide la cuenta`, body: `Pagará con ${PAYMENT_LABEL[method as PaymentMethod]}.` },
      );
    }

    case "promo": {
      const promoId = Number(body.promoId);
      if (!Number.isInteger(promoId)) return fail(404, "Esa recomendación ya no está disponible.");
      const promo = await q1<{ id: number; title: string }>(
        `SELECT id, title FROM promotions
         WHERE id = $1 AND restaurant_id = $2 AND active = 1 AND (ends_at IS NULL OR ends_at > now())`,
        [promoId, rid],
      );
      if (!promo) return fail(404, "Esa recomendación ya no está disponible.");
      if (await pendingOf("promo_id = $2", [promoId])) return fail(409, "Ya la pediste. Tu mesero va en camino.");
      return create(
        { type: "promo", promoId, message: promo.title },
        { title: `${mesa} · Quiere una recomendación`, body: promo.title },
      );
    }

    default:
      return fail(400, "Tipo de solicitud desconocido.");
  }
}
