import "server-only";
import crypto from "node:crypto";
import { db } from "./db";
import { emit } from "./events";
import { availablePrizes, getSettings, type PrizeRow, type SessionRow } from "./repo";
import { aiMove, outcome, winningLine, type Cell, type GatoMode } from "./tictactoe";
import type { RewardGame } from "./types";

export class RewardError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const randInt = (n: number) => crypto.randomInt(n);

function rollWin(chancePercent: number): boolean {
  const c = Math.max(0, Math.min(100, chancePercent));
  return crypto.randomInt(10000) < Math.round(c * 100);
}

function pickPrize(restaurantId: number): PrizeRow | null {
  const prizes = availablePrizes(restaurantId);
  const total = prizes.reduce((s, p) => s + p.weight, 0);
  if (total <= 0) return null;
  let r = crypto.randomInt(total);
  for (const p of prizes) {
    if (r < p.weight) return p;
    r -= p.weight;
  }
  return null;
}

function makeCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += alphabet[crypto.randomInt(alphabet.length)];
  return s;
}

/** Verifica (dentro de la transacción) que la sesión pueda usar su premio y lo marca como usado. */
function claimReward(sessionId: number, game: RewardGame): SessionRow {
  const d = db();
  const s = d.prepare("SELECT * FROM table_sessions WHERE id = ?").get(sessionId) as SessionRow;
  if (!s || s.status !== "open") throw new RewardError(403, "Tu mesa aún no está activa.");
  if (s.reward_used) throw new RewardError(409, "El premio de esta mesa ya se usó en esta visita.");
  const settings = getSettings(s.restaurant_id);
  if (!settings.games[game]?.enabled) throw new RewardError(400, "Ese juego no está disponible.");
  if (availablePrizes(s.restaurant_id).length === 0)
    throw new RewardError(409, "Por hoy se agotaron los premios. ¡Gracias por participar!");
  const r = d
    .prepare("UPDATE table_sessions SET reward_used = 1 WHERE id = ? AND reward_used = 0")
    .run(sessionId);
  if (r.changes !== 1) throw new RewardError(409, "El premio de esta mesa ya se usó en esta visita.");
  return s;
}

/** Asigna un premio a una jugada ganada. Devuelve null si ya no hay premios disponibles. */
function awardPrize(playId: number, s: SessionRow): { prize: PrizeRow; code: string } | null {
  const d = db();
  const prize = pickPrize(s.restaurant_id);
  if (!prize) return null;
  if (prize.stock !== null) {
    d.prepare("UPDATE prizes SET stock = stock - 1 WHERE id = ? AND stock > 0").run(prize.id);
  }
  const code = makeCode();
  d.prepare(
    `UPDATE reward_plays SET status = 'won', prize_id = ?, prize_name = ?, code = ?, finished_at = datetime('now')
     WHERE id = ?`,
  ).run(prize.id, prize.name, code, playId);
  d.prepare(
    `INSERT INTO requests (restaurant_id, table_id, session_id, type, message, reward_play_id)
     VALUES (?, ?, ?, 'prize', ?, ?)`,
  ).run(s.restaurant_id, s.table_id, s.id, `${prize.name} · código ${code}`, playId);
  return { prize, code };
}

function insertPlay(s: SessionRow, game: RewardGame, status: "playing" | "lost", state?: object) {
  return Number(
    db()
      .prepare(
        `INSERT INTO reward_plays (restaurant_id, session_id, table_id, game, status, state, finished_at)
         VALUES (?, ?, ?, ?, ?, ?, CASE WHEN ? = 'lost' THEN datetime('now') END)`,
      )
      .run(s.restaurant_id, s.id, s.table_id, game, status, state ? JSON.stringify(state) : null, status)
      .lastInsertRowid,
  );
}

export interface InstantResult {
  won: boolean;
  prizeId: number | null;
  prizeName: string | null;
  code: string | null;
}

/** Ruleta y rasca y gana: el resultado se decide aquí; el cliente solo lo anima. */
export function playInstant(sessionId: number, game: "ruleta" | "rasca"): InstantResult {
  const d = db();
  let restaurantId = 0;
  const result = d.transaction((): InstantResult => {
    const s = claimReward(sessionId, game);
    restaurantId = s.restaurant_id;
    const chance = getSettings(s.restaurant_id).games[game].winChance;
    if (!rollWin(chance)) {
      insertPlay(s, game, "lost");
      return { won: false, prizeId: null, prizeName: null, code: null };
    }
    const playId = insertPlay(s, game, "playing");
    const award = awardPrize(playId, s);
    if (!award) {
      d.prepare("UPDATE reward_plays SET status = 'lost', finished_at = datetime('now') WHERE id = ?").run(playId);
      return { won: false, prizeId: null, prizeName: null, code: null };
    }
    return { won: true, prizeId: award.prize.id, prizeName: award.prize.name, code: award.code };
  })();
  if (result.won) emit(restaurantId, "requests", true);
  emit(restaurantId, "tables");
  return result;
}

// ---------- Gato ----------

interface GatoState {
  board: Cell[];
  mode: GatoMode;
}

export interface GatoView {
  board: Cell[];
  status: "playing" | "won" | "lost";
  result: "X" | "O" | "draw" | null;
  line: number[] | null;
  prizeName: string | null;
  code: string | null;
}

function gatoView(board: Cell[], status: GatoView["status"], prizeName: string | null = null, code: string | null = null): GatoView {
  return { board, status, result: outcome(board), line: winningLine(board), prizeName, code };
}

export function getGato(sessionId: number): GatoView | null {
  const row = db()
    .prepare(
      "SELECT state, status, prize_name, code FROM reward_plays WHERE session_id = ? AND game = 'gato' ORDER BY id DESC LIMIT 1",
    )
    .get(sessionId) as { state: string; status: GatoView["status"]; prize_name: string | null; code: string | null } | undefined;
  if (!row) return null;
  const st = JSON.parse(row.state) as GatoState;
  return gatoView(st.board, row.status, row.prize_name, row.code);
}

export function startGato(sessionId: number): GatoView {
  const d = db();
  let restaurantId = 0;
  const view = d.transaction(() => {
    const s = claimReward(sessionId, "gato");
    restaurantId = s.restaurant_id;
    // Se decide al inicio si en esta partida la IA "se deja ganar".
    const mode: GatoMode = rollWin(getSettings(s.restaurant_id).games.gato.winChance) ? "blunder" : "perfect";
    const board: Cell[] = Array(9).fill("");
    insertPlay(s, "gato", "playing", { board, mode } satisfies GatoState);
    return gatoView(board, "playing");
  })();
  emit(restaurantId, "tables");
  return view;
}

export function moveGato(sessionId: number, cell: number): GatoView {
  if (!Number.isInteger(cell) || cell < 0 || cell > 8) throw new RewardError(400, "Casilla inválida.");
  const d = db();
  let alert = false;
  let restaurantId = 0;
  const view = d.transaction((): GatoView => {
    const s = d.prepare("SELECT * FROM table_sessions WHERE id = ?").get(sessionId) as SessionRow;
    if (!s || s.status !== "open") throw new RewardError(403, "Tu mesa ya no está activa.");
    restaurantId = s.restaurant_id;
    const play = d
      .prepare("SELECT id, state FROM reward_plays WHERE session_id = ? AND game = 'gato' AND status = 'playing' ORDER BY id DESC LIMIT 1")
      .get(sessionId) as { id: number; state: string } | undefined;
    if (!play) throw new RewardError(409, "No hay una partida en curso.");
    const st = JSON.parse(play.state) as GatoState;
    if (st.board[cell]) throw new RewardError(400, "Esa casilla ya está ocupada.");

    st.board[cell] = "X";
    if (!outcome(st.board)) st.board[aiMove(st.board, st.mode, randInt)] = "O";
    d.prepare("UPDATE reward_plays SET state = ? WHERE id = ?").run(JSON.stringify(st), play.id);

    const o = outcome(st.board);
    if (!o) return gatoView(st.board, "playing");
    if (o === "X") {
      const award = awardPrize(play.id, s);
      if (award) {
        alert = true;
        return gatoView(st.board, "won", award.prize.name, award.code);
      }
    }
    d.prepare("UPDATE reward_plays SET status = 'lost', finished_at = datetime('now') WHERE id = ?").run(play.id);
    return gatoView(st.board, "lost");
  })();
  if (alert) emit(restaurantId, "requests", true);
  return view;
}
