import "server-only";
import { q, q1, tx, type Db } from "./db";
import { emit } from "./events";
import { activePromos } from "./promos";
import { notifyStaff } from "./push";
import {
  parseSettings,
  type MesaRequest,
  type MesaState,
  type RestaurantSettings,
  type RewardGame,
  type RewardResult,
  type SessionStatus,
} from "./types";

export interface RestaurantRow {
  id: number;
  slug: string;
  name: string;
  tagline: string;
  logo_url: string;
  google_review_url: string;
  menu_file: string | null;
  settings: string;
}

export interface TableRow {
  id: number;
  restaurant_id: number;
  number: number;
  area: string;
  token: string;
  active: number;
}

export interface SessionRow {
  id: number;
  restaurant_id: number;
  table_id: number;
  status: SessionStatus;
  created_at: string;
  opened_at: string | null;
  closed_at: string | null;
  reward_used: number;
}

export interface PrizeRow {
  id: number;
  restaurant_id: number;
  name: string;
  weight: number;
  stock: number | null;
  active: number;
}

/** Minutos que una mesa puede quedarse "esperando aprobación" antes de descartarse. */
const PENDING_MAX_MIN = 20;

export function getRestaurant(id: number, c?: Db): Promise<RestaurantRow | undefined> {
  return q1<RestaurantRow>("SELECT * FROM restaurants WHERE id = $1", [id], c);
}

export async function getSettings(restaurantId: number, c?: Db): Promise<RestaurantSettings> {
  return parseSettings((await getRestaurant(restaurantId, c))?.settings);
}

export function getTableByToken(token: string): Promise<TableRow | undefined> {
  return q1<TableRow>("SELECT * FROM tables WHERE token = $1 AND active = 1", [token]);
}

export function getTable(id: number): Promise<TableRow | undefined> {
  return q1<TableRow>("SELECT * FROM tables WHERE id = $1", [id]);
}

/** Cierra una sesión y cancela lo que haya quedado pendiente de ella. */
export async function closeSession(sessionId: number) {
  const restaurantId = await tx(async (c) => {
    const s = await q1<{ restaurant_id: number }>(
      `UPDATE table_sessions SET status = 'closed', closed_at = now()
       WHERE id = $1 AND status <> 'closed' RETURNING restaurant_id`,
      [sessionId],
      c,
    );
    if (!s) return null;
    await q(
      `UPDATE requests SET status = 'cancelled', updated_at = now()
       WHERE session_id = $1 AND status IN ('pending','attending') AND type <> 'prize'`,
      [sessionId],
      c,
    );
    await q(
      "UPDATE reward_plays SET status = 'lost', finished_at = now() WHERE session_id = $1 AND status = 'playing'",
      [sessionId],
      c,
    );
    // La mesa se fue: los juegos que tenía vuelven a estar disponibles.
    await q(
      "UPDATE board_games SET in_use_session_id = NULL, in_use_since = NULL WHERE in_use_session_id = $1",
      [sessionId],
      c,
    );
    return s.restaurant_id;
  });
  if (restaurantId) {
    emit(restaurantId, "tables");
    emit(restaurantId, "requests");
  }
}

/** Sesión viva (pendiente o abierta) de una mesa, aplicando la expiración automática. */
export async function getLiveSession(tableId: number): Promise<{ session: SessionRow; table: TableRow } | null> {
  const table = await getTable(tableId);
  if (!table || !table.active) return null;
  const settings = await getSettings(table.restaurant_id);
  const row = await q1<SessionRow & { expired: boolean }>(
    `SELECT *,
       (status = 'open' AND opened_at + make_interval(hours => $2::int) < now())
       OR (status = 'pending' AND created_at + make_interval(mins => $3::int) < now()) AS expired
     FROM table_sessions
     WHERE table_id = $1 AND status IN ('pending','open')
     ORDER BY id DESC LIMIT 1`,
    [tableId, settings.sessionMaxHours, PENDING_MAX_MIN],
  );
  if (!row) return null;
  const { expired, ...session } = row;
  if (expired) {
    await closeSession(session.id);
    return null;
  }
  return { session, table };
}

/**
 * Crea la sesión de la mesa. Si otro celular la creó en ese mismo instante,
 * devuelve la existente (lo garantiza el índice único de sesiones vivas).
 */
export async function createSession(table: TableRow, status: "pending" | "open"): Promise<SessionRow> {
  const created = await q1<SessionRow>(
    `INSERT INTO table_sessions (restaurant_id, table_id, status, opened_at)
     VALUES ($1, $2, $3::text, CASE WHEN $3::text = 'open' THEN now() END)
     ON CONFLICT (table_id) WHERE status IN ('pending','open') DO NOTHING
     RETURNING *`,
    [table.restaurant_id, table.id, status],
  );
  if (created) {
    // Una mesa esperando aprobación hace sonar el panel y avisa al celular del mesero.
    emit(table.restaurant_id, "tables", status === "pending");
    if (status === "pending") {
      notifyStaff(table.restaurant_id, {
        title: `Mesa ${table.number} quiere conectarse`,
        body: "Confirma en el panel que hay clientes en la mesa.",
        tag: `mesa-${table.id}`,
      });
    }
    return created;
  }
  const existing = await q1<SessionRow>(
    "SELECT * FROM table_sessions WHERE table_id = $1 AND status IN ('pending','open') ORDER BY id DESC LIMIT 1",
    [table.id],
  );
  if (!existing) throw new Error("No se pudo crear la sesión de la mesa.");
  return existing;
}

export async function openSession(sessionId: number) {
  const s = await q1<{ restaurant_id: number }>(
    "UPDATE table_sessions SET status = 'open', opened_at = now() WHERE id = $1 AND status = 'pending' RETURNING restaurant_id",
    [sessionId],
  );
  if (s) emit(s.restaurant_id, "tables");
}

/** Premios que todavía se pueden entregar (activos y con existencias). */
export function availablePrizes(restaurantId: number, c?: Db): Promise<PrizeRow[]> {
  return q<PrizeRow>(
    "SELECT * FROM prizes WHERE restaurant_id = $1 AND active = 1 AND weight > 0 AND (stock IS NULL OR stock > 0) ORDER BY id",
    [restaurantId],
    c,
  );
}

export function enabledGames(settings: RestaurantSettings): RewardGame[] {
  return (Object.keys(settings.games) as RewardGame[]).filter((g) => settings.games[g].enabled);
}

export async function lastRewardPlay(sessionId: number): Promise<RewardResult | null> {
  const row = await q1<{ game: RewardGame; status: RewardResult["status"]; prize_name: string | null; code: string | null }>(
    "SELECT game, status, prize_name, code FROM reward_plays WHERE session_id = $1 ORDER BY id DESC LIMIT 1",
    [sessionId],
  );
  if (!row) return null;
  return { game: row.game, status: row.status, prizeName: row.prize_name, code: row.code };
}

export function sessionRequests(sessionId: number): Promise<MesaRequest[]> {
  return q<MesaRequest>(
    `SELECT r.id, r.type, r.status, r.message, r.board_game_id, g.name AS game_name,
            r.payment_method, r.promo_id, r.created_at
     FROM requests r LEFT JOIN board_games g ON g.id = r.board_game_id
     WHERE r.session_id = $1 ORDER BY r.id DESC LIMIT 15`,
    [sessionId],
  );
}

export async function buildMesaState(ctx: {
  session: SessionRow;
  table: TableRow;
  restaurant: RestaurantRow;
}): Promise<MesaState> {
  const settings = parseSettings(ctx.restaurant.settings);
  const games = enabledGames(settings);
  const [prizes, last, requests, promos] = await Promise.all([
    availablePrizes(ctx.restaurant.id),
    lastRewardPlay(ctx.session.id),
    sessionRequests(ctx.session.id),
    activePromos(ctx.restaurant.id),
  ]);
  return {
    restaurant: {
      name: ctx.restaurant.name,
      tagline: ctx.restaurant.tagline,
      logoUrl: ctx.restaurant.logo_url,
      reviewUrl: ctx.restaurant.google_review_url,
      hasMenu: Boolean(ctx.restaurant.menu_file),
    },
    table: { number: ctx.table.number, area: ctx.table.area },
    session: { status: ctx.session.status },
    reward: {
      available:
        ctx.session.status === "open" && !ctx.session.reward_used && games.length > 0 && prizes.length > 0,
      games,
      last,
    },
    requests,
    waiterCooldownSec: settings.waiterCooldownSec,
    promos,
  };
}
