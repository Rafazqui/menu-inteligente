import "server-only";
import { db } from "./db";
import { emit } from "./events";
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

export function getRestaurant(id: number): RestaurantRow | undefined {
  return db().prepare("SELECT * FROM restaurants WHERE id = ?").get(id) as RestaurantRow | undefined;
}

export function getSettings(restaurantId: number): RestaurantSettings {
  return parseSettings(getRestaurant(restaurantId)?.settings);
}

export function getTableByToken(token: string): TableRow | undefined {
  return db().prepare("SELECT * FROM tables WHERE token = ? AND active = 1").get(token) as
    | TableRow
    | undefined;
}

export function getTable(id: number): TableRow | undefined {
  return db().prepare("SELECT * FROM tables WHERE id = ?").get(id) as TableRow | undefined;
}

/** Cierra una sesión y cancela lo que haya quedado pendiente de ella. */
export function closeSession(sessionId: number) {
  const d = db();
  const s = d.prepare("SELECT * FROM table_sessions WHERE id = ?").get(sessionId) as
    | SessionRow
    | undefined;
  if (!s || s.status === "closed") return;
  d.transaction(() => {
    d.prepare(
      "UPDATE table_sessions SET status = 'closed', closed_at = datetime('now') WHERE id = ?",
    ).run(sessionId);
    d.prepare(
      `UPDATE requests SET status = 'cancelled', updated_at = datetime('now')
       WHERE session_id = ? AND status IN ('pending','attending') AND type != 'prize'`,
    ).run(sessionId);
    d.prepare(
      "UPDATE reward_plays SET status = 'lost', finished_at = datetime('now') WHERE session_id = ? AND status = 'playing'",
    ).run(sessionId);
  })();
  emit(s.restaurant_id, "tables");
  emit(s.restaurant_id, "requests");
}

/** Sesión viva (pendiente o abierta) de una mesa, aplicando la expiración automática. */
export function getLiveSession(tableId: number): { session: SessionRow; table: TableRow } | null {
  const d = db();
  const table = getTable(tableId);
  if (!table || !table.active) return null;
  const session = d
    .prepare(
      "SELECT * FROM table_sessions WHERE table_id = ? AND status IN ('pending','open') ORDER BY id DESC LIMIT 1",
    )
    .get(tableId) as SessionRow | undefined;
  if (!session) return null;

  const settings = getSettings(table.restaurant_id);
  const expired = d
    .prepare(
      `SELECT CASE
         WHEN status = 'open' AND datetime(opened_at, ?) < datetime('now') THEN 1
         WHEN status = 'pending' AND datetime(created_at, ?) < datetime('now') THEN 1
         ELSE 0 END AS e
       FROM table_sessions WHERE id = ?`,
    )
    .get(`+${settings.sessionMaxHours} hours`, `+${PENDING_MAX_MIN} minutes`, session.id) as {
    e: number;
  };
  if (expired.e) {
    closeSession(session.id);
    return null;
  }
  return { session, table };
}

export function createSession(table: TableRow, status: "pending" | "open"): SessionRow {
  const d = db();
  const r = d
    .prepare(
      `INSERT INTO table_sessions (restaurant_id, table_id, status, opened_at)
       VALUES (?, ?, ?, CASE WHEN ? = 'open' THEN datetime('now') END)`,
    )
    .run(table.restaurant_id, table.id, status, status);
  // Una mesa esperando aprobación hace sonar el panel.
  emit(table.restaurant_id, "tables", status === "pending");
  return d.prepare("SELECT * FROM table_sessions WHERE id = ?").get(r.lastInsertRowid) as SessionRow;
}

export function openSession(sessionId: number) {
  const d = db();
  const s = d.prepare("SELECT * FROM table_sessions WHERE id = ?").get(sessionId) as SessionRow;
  d.prepare(
    "UPDATE table_sessions SET status = 'open', opened_at = datetime('now') WHERE id = ? AND status = 'pending'",
  ).run(sessionId);
  emit(s.restaurant_id, "tables");
}

/** Premios que todavía se pueden entregar (activos y con existencias). */
export function availablePrizes(restaurantId: number): PrizeRow[] {
  return db()
    .prepare(
      "SELECT * FROM prizes WHERE restaurant_id = ? AND active = 1 AND weight > 0 AND (stock IS NULL OR stock > 0) ORDER BY id",
    )
    .all(restaurantId) as PrizeRow[];
}

export function enabledGames(settings: RestaurantSettings): RewardGame[] {
  return (Object.keys(settings.games) as RewardGame[]).filter((g) => settings.games[g].enabled);
}

export function lastRewardPlay(sessionId: number): RewardResult | null {
  const row = db()
    .prepare(
      "SELECT game, status, prize_name, code FROM reward_plays WHERE session_id = ? ORDER BY id DESC LIMIT 1",
    )
    .get(sessionId) as
    | { game: RewardGame; status: RewardResult["status"]; prize_name: string | null; code: string | null }
    | undefined;
  if (!row) return null;
  return { game: row.game, status: row.status, prizeName: row.prize_name, code: row.code };
}

export function sessionRequests(sessionId: number): MesaRequest[] {
  return db()
    .prepare(
      `SELECT r.id, r.type, r.status, r.message, r.board_game_id, g.name AS game_name, r.created_at
       FROM requests r LEFT JOIN board_games g ON g.id = r.board_game_id
       WHERE r.session_id = ? ORDER BY r.id DESC LIMIT 15`,
    )
    .all(sessionId) as MesaRequest[];
}

export function buildMesaState(ctx: {
  session: SessionRow;
  table: TableRow;
  restaurant: RestaurantRow;
}): MesaState {
  const settings = parseSettings(ctx.restaurant.settings);
  const games = enabledGames(settings);
  const hasPrizes = availablePrizes(ctx.restaurant.id).length > 0;
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
        ctx.session.status === "open" && !ctx.session.reward_used && games.length > 0 && hasPrizes,
      games,
      last: lastRewardPlay(ctx.session.id),
    },
    requests: sessionRequests(ctx.session.id),
    waiterCooldownSec: settings.waiterCooldownSec,
  };
}
