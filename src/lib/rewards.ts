import "server-only";
import crypto from "node:crypto";
import type { PoolClient } from "pg";
import { q, q1, tx } from "./db";
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

async function pickPrize(c: PoolClient, restaurantId: number): Promise<PrizeRow | null> {
  const prizes = await availablePrizes(restaurantId, c);
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

/**
 * Verifica (dentro de la transacción) que la sesión pueda usar su premio y lo marca como usado.
 * FOR UPDATE bloquea la fila: si dos celulares juegan a la vez, el segundo espera y ve el premio ya usado.
 */
async function claimReward(c: PoolClient, sessionId: number, game: RewardGame): Promise<SessionRow> {
  const s = await q1<SessionRow>("SELECT * FROM table_sessions WHERE id = $1 FOR UPDATE", [sessionId], c);
  if (!s || s.status !== "open") throw new RewardError(403, "Tu mesa aún no está activa.");
  if (s.reward_used) throw new RewardError(409, "El premio de esta mesa ya se usó en esta visita.");
  const settings = await getSettings(s.restaurant_id, c);
  if (!settings.games[game]?.enabled) throw new RewardError(400, "Ese juego no está disponible.");
  if ((await availablePrizes(s.restaurant_id, c)).length === 0)
    throw new RewardError(409, "Por hoy se agotaron los premios. ¡Gracias por participar!");
  await q("UPDATE table_sessions SET reward_used = 1 WHERE id = $1", [sessionId], c);
  return s;
}

/** Asigna un premio a una jugada ganada. Devuelve null si ya no hay premios disponibles. */
async function awardPrize(c: PoolClient, playId: number, s: SessionRow): Promise<{ prize: PrizeRow; code: string } | null> {
  const prize = await pickPrize(c, s.restaurant_id);
  if (!prize) return null;
  if (prize.stock !== null) {
    const ok = await q1("UPDATE prizes SET stock = stock - 1 WHERE id = $1 AND stock > 0 RETURNING id", [prize.id], c);
    if (!ok) return null; // otra mesa se llevó la última unidad en ese instante
  }
  const code = makeCode();
  await q(
    `UPDATE reward_plays SET status = 'won', prize_id = $1, prize_name = $2, code = $3, finished_at = now()
     WHERE id = $4`,
    [prize.id, prize.name, code, playId],
    c,
  );
  await q(
    `INSERT INTO requests (restaurant_id, table_id, session_id, type, message, reward_play_id)
     VALUES ($1, $2, $3, 'prize', $4, $5)`,
    [s.restaurant_id, s.table_id, s.id, `${prize.name} · código ${code}`, playId],
    c,
  );
  return { prize, code };
}

async function insertPlay(c: PoolClient, s: SessionRow, game: RewardGame, status: "playing" | "lost", state?: object) {
  const row = await q1<{ id: number }>(
    `INSERT INTO reward_plays (restaurant_id, session_id, table_id, game, status, state, finished_at)
     VALUES ($1, $2, $3, $4, $5::text, $6, CASE WHEN $5::text = 'lost' THEN now() END)
     RETURNING id`,
    [s.restaurant_id, s.id, s.table_id, game, status, state ? JSON.stringify(state) : null],
    c,
  );
  return row!.id;
}

export interface InstantResult {
  won: boolean;
  prizeId: number | null;
  prizeName: string | null;
  code: string | null;
}

const NO_PRIZE: InstantResult = { won: false, prizeId: null, prizeName: null, code: null };

/** Ruleta y rasca y gana: el resultado se decide aquí; el cliente solo lo anima. */
export async function playInstant(sessionId: number, game: "ruleta" | "rasca"): Promise<InstantResult> {
  let restaurantId = 0;
  const result = await tx(async (c): Promise<InstantResult> => {
    const s = await claimReward(c, sessionId, game);
    restaurantId = s.restaurant_id;
    const chance = (await getSettings(s.restaurant_id, c)).games[game].winChance;
    if (!rollWin(chance)) {
      await insertPlay(c, s, game, "lost");
      return NO_PRIZE;
    }
    const playId = await insertPlay(c, s, game, "playing");
    const award = await awardPrize(c, playId, s);
    if (!award) {
      await q("UPDATE reward_plays SET status = 'lost', finished_at = now() WHERE id = $1", [playId], c);
      return NO_PRIZE;
    }
    return { won: true, prizeId: award.prize.id, prizeName: award.prize.name, code: award.code };
  });
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

export async function getGato(sessionId: number): Promise<GatoView | null> {
  const row = await q1<{ state: string; status: GatoView["status"]; prize_name: string | null; code: string | null }>(
    "SELECT state, status, prize_name, code FROM reward_plays WHERE session_id = $1 AND game = 'gato' ORDER BY id DESC LIMIT 1",
    [sessionId],
  );
  if (!row) return null;
  const st = JSON.parse(row.state) as GatoState;
  return gatoView(st.board, row.status, row.prize_name, row.code);
}

export async function startGato(sessionId: number): Promise<GatoView> {
  let restaurantId = 0;
  const view = await tx(async (c) => {
    const s = await claimReward(c, sessionId, "gato");
    restaurantId = s.restaurant_id;
    // Se decide al inicio si en esta partida la IA "se deja ganar".
    const chance = (await getSettings(s.restaurant_id, c)).games.gato.winChance;
    const mode: GatoMode = rollWin(chance) ? "blunder" : "perfect";
    const board: Cell[] = Array(9).fill("");
    await insertPlay(c, s, "gato", "playing", { board, mode } satisfies GatoState);
    return gatoView(board, "playing");
  });
  emit(restaurantId, "tables");
  return view;
}

export async function moveGato(sessionId: number, cell: number): Promise<GatoView> {
  if (!Number.isInteger(cell) || cell < 0 || cell > 8) throw new RewardError(400, "Casilla inválida.");
  let alert = false;
  let restaurantId = 0;
  const view = await tx(async (c): Promise<GatoView> => {
    const s = await q1<SessionRow>("SELECT * FROM table_sessions WHERE id = $1", [sessionId], c);
    if (!s || s.status !== "open") throw new RewardError(403, "Tu mesa ya no está activa.");
    restaurantId = s.restaurant_id;
    // Bloquea la partida: dos toques simultáneos no pueden mover a la vez.
    const play = await q1<{ id: number; state: string }>(
      `SELECT id, state FROM reward_plays
       WHERE session_id = $1 AND game = 'gato' AND status = 'playing'
       ORDER BY id DESC LIMIT 1 FOR UPDATE`,
      [sessionId],
      c,
    );
    if (!play) throw new RewardError(409, "No hay una partida en curso.");
    const st = JSON.parse(play.state) as GatoState;
    if (st.board[cell]) throw new RewardError(400, "Esa casilla ya está ocupada.");

    st.board[cell] = "X";
    if (!outcome(st.board)) st.board[aiMove(st.board, st.mode, randInt)] = "O";
    await q("UPDATE reward_plays SET state = $1 WHERE id = $2", [JSON.stringify(st), play.id], c);

    const o = outcome(st.board);
    if (!o) return gatoView(st.board, "playing");
    if (o === "X") {
      const award = await awardPrize(c, play.id, s);
      if (award) {
        alert = true;
        return gatoView(st.board, "won", award.prize.name, award.code);
      }
    }
    await q("UPDATE reward_plays SET status = 'lost', finished_at = now() WHERE id = $1", [play.id], c);
    return gatoView(st.board, "lost");
  });
  if (alert) emit(restaurantId, "requests", true);
  return view;
}
