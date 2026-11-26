import "server-only";
import { q, q1 } from "./db";
import type { RewardGame } from "./types";

export type StatsRange = "hoy" | "7d" | "30d";
export const RANGE_DAYS: Record<StatsRange, number> = { hoy: 1, "7d": 7, "30d": 30 };

export interface Kpis {
  /** Mesas que se abrieron (clientes que usaron la app). */
  visits: number;
  waiterCalls: number;
  gameRequests: number;
  /** Segundos entre que el cliente pide algo y el personal responde ("voy" o "listo"). */
  avgResponseSec: number | null;
  medianResponseSec: number | null;
  /** Minutos promedio que una mesa estuvo abierta. */
  avgStayMin: number | null;
  prizesPlayed: number;
  prizesWon: number;
  reviewClicks: number;
  menuViews: number;
}

export interface Stats {
  range: StatsRange;
  timezone: string;
  start: string;
  end: string;
  current: Kpis;
  previous: Kpis;
  daily: { day: string; visits: number; requests: number }[];
  hourly: { hour: number; requests: number }[];
  topGames: { name: string; n: number }[];
  topTables: { number: number; area: string; n: number }[];
  prizes: { name: string; n: number }[];
  byGame: { game: RewardGame; played: number; won: number }[];
  topPromos: { name: string; n: number }[];
}

// Tiempo de respuesta: para solicitudes viejas (antes de existir responded_at) se usa
// la última actualización si ya estaban atendidas.
const RESPONSE_SUBQUERY = `
  SELECT EXTRACT(EPOCH FROM resp - created_at)::float8 AS secs
  FROM (
    SELECT created_at,
           COALESCE(responded_at, CASE WHEN status IN ('attending','done') THEN updated_at END) AS resp
    FROM requests
    WHERE restaurant_id = $1 AND type <> 'prize'
      AND created_at >= $2::timestamptz AND created_at < $3::timestamptz
  ) r
  WHERE resp IS NOT NULL AND resp >= created_at`;

async function kpis(rid: number, start: string, end: string): Promise<Kpis> {
  const r = await q1<{
    visits: number; waiter_calls: number; game_requests: number;
    avg_response: number | null; median_response: number | null; avg_stay: number | null;
    prizes_played: number; prizes_won: number; review_clicks: number; menu_views: number;
  }>(
    `SELECT
       (SELECT COUNT(*)::int FROM table_sessions
         WHERE restaurant_id = $1 AND opened_at >= $2::timestamptz AND opened_at < $3::timestamptz) AS visits,
       (SELECT COUNT(*)::int FROM requests
         WHERE restaurant_id = $1 AND type = 'waiter' AND created_at >= $2::timestamptz AND created_at < $3::timestamptz) AS waiter_calls,
       (SELECT COUNT(*)::int FROM requests
         WHERE restaurant_id = $1 AND type = 'boardgame' AND created_at >= $2::timestamptz AND created_at < $3::timestamptz) AS game_requests,
       (SELECT AVG(secs) FROM (${RESPONSE_SUBQUERY}) x) AS avg_response,
       (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY secs) FROM (${RESPONSE_SUBQUERY}) x) AS median_response,
       (SELECT AVG(EXTRACT(EPOCH FROM closed_at - opened_at)::float8 / 60) FROM table_sessions
         WHERE restaurant_id = $1 AND opened_at >= $2::timestamptz AND opened_at < $3::timestamptz
           AND closed_at IS NOT NULL) AS avg_stay,
       (SELECT COUNT(*)::int FROM reward_plays
         WHERE restaurant_id = $1 AND status <> 'playing' AND created_at >= $2::timestamptz AND created_at < $3::timestamptz) AS prizes_played,
       (SELECT COUNT(*)::int FROM reward_plays
         WHERE restaurant_id = $1 AND status = 'won' AND created_at >= $2::timestamptz AND created_at < $3::timestamptz) AS prizes_won,
       (SELECT COUNT(*)::int FROM analytics_events
         WHERE restaurant_id = $1 AND type = 'review_click' AND created_at >= $2::timestamptz AND created_at < $3::timestamptz) AS review_clicks,
       (SELECT COUNT(*)::int FROM analytics_events
         WHERE restaurant_id = $1 AND type = 'menu_view' AND created_at >= $2::timestamptz AND created_at < $3::timestamptz) AS menu_views`,
    [rid, start, end],
  );
  return {
    visits: r!.visits,
    waiterCalls: r!.waiter_calls,
    gameRequests: r!.game_requests,
    avgResponseSec: r!.avg_response,
    medianResponseSec: r!.median_response,
    avgStayMin: r!.avg_stay,
    prizesPlayed: r!.prizes_played,
    prizesWon: r!.prizes_won,
    reviewClicks: r!.review_clicks,
    menuViews: r!.menu_views,
  };
}

export async function getStats(rid: number, range: StatsRange): Promise<Stats> {
  const days = RANGE_DAYS[range];
  const tz = (await q1<{ timezone: string }>("SELECT timezone FROM restaurants WHERE id = $1", [rid]))!.timezone;

  // Periodo actual: desde la medianoche (hora del café) de hace N-1 días hasta ahora.
  // Periodo anterior: la misma ventana desplazada N días atrás (comparación justa aunque hoy no haya terminado).
  const b = (await q1<{ start: string; end: string; prev_start: string; prev_end: string }>(
    `WITH s AS (
       SELECT (date_trunc('day', now() AT TIME ZONE $1) - make_interval(days => $2::int - 1)) AT TIME ZONE $1 AS start
     )
     SELECT s.start, now() AS "end",
            s.start - make_interval(days => $2::int) AS prev_start,
            now() - make_interval(days => $2::int) AS prev_end
     FROM s`,
    [tz, days],
  ))!;

  const range3 = [rid, b.start, b.end];
  const [current, previous, daily, hourly, topGames, topTables, prizes, byGame, topPromos] = await Promise.all([
    kpis(rid, b.start, b.end),
    kpis(rid, b.prev_start, b.prev_end),
    q<{ day: string; visits: number; requests: number }>(
      `SELECT to_char(d, 'YYYY-MM-DD') AS day,
         (SELECT COUNT(*)::int FROM table_sessions s
           WHERE s.restaurant_id = $1 AND (s.opened_at AT TIME ZONE $3)::date = d) AS visits,
         (SELECT COUNT(*)::int FROM requests r
           WHERE r.restaurant_id = $1 AND r.type <> 'prize'
             AND (r.created_at AT TIME ZONE $3)::date = d) AS requests
       FROM generate_series(
         (($2::timestamptz) AT TIME ZONE $3)::date,
         (now() AT TIME ZONE $3)::date,
         interval '1 day'
       ) AS g(dt), LATERAL (SELECT g.dt::date AS d) x
       ORDER BY d`,
      [rid, b.start, tz],
    ),
    q<{ hour: number; requests: number }>(
      `SELECT h AS hour, COUNT(r.id)::int AS requests
       FROM generate_series(0, 23) AS h
       LEFT JOIN requests r
         ON r.restaurant_id = $1 AND r.type <> 'prize'
        AND r.created_at >= $2::timestamptz AND r.created_at < $3::timestamptz
        AND EXTRACT(HOUR FROM r.created_at AT TIME ZONE $4)::int = h
       GROUP BY h ORDER BY h`,
      [...range3, tz],
    ),
    q<{ name: string; n: number }>(
      `SELECT g.name, COUNT(*)::int AS n
       FROM requests r JOIN board_games g ON g.id = r.board_game_id
       WHERE r.restaurant_id = $1 AND r.type = 'boardgame'
         AND r.created_at >= $2::timestamptz AND r.created_at < $3::timestamptz
       GROUP BY g.name ORDER BY n DESC, g.name LIMIT 6`,
      range3,
    ),
    q<{ number: number; area: string; n: number }>(
      `SELECT t.number, t.area, COUNT(*)::int AS n
       FROM requests r JOIN tables t ON t.id = r.table_id
       WHERE r.restaurant_id = $1 AND r.type <> 'prize'
         AND r.created_at >= $2::timestamptz AND r.created_at < $3::timestamptz
       GROUP BY t.number, t.area ORDER BY n DESC, t.number LIMIT 6`,
      range3,
    ),
    q<{ name: string; n: number }>(
      `SELECT prize_name AS name, COUNT(*)::int AS n
       FROM reward_plays
       WHERE restaurant_id = $1 AND status = 'won'
         AND created_at >= $2::timestamptz AND created_at < $3::timestamptz
       GROUP BY prize_name ORDER BY n DESC, prize_name LIMIT 6`,
      range3,
    ),
    q<{ game: RewardGame; played: number; won: number }>(
      `SELECT game, COUNT(*)::int AS played, COUNT(*) FILTER (WHERE status = 'won')::int AS won
       FROM reward_plays
       WHERE restaurant_id = $1 AND status <> 'playing'
         AND created_at >= $2::timestamptz AND created_at < $3::timestamptz
       GROUP BY game ORDER BY game`,
      range3,
    ),
    // Recomendaciones pedidas con "Lo quiero" (el título se guarda en el mensaje al momento de pedirla).
    q<{ name: string; n: number }>(
      `SELECT message AS name, COUNT(*)::int AS n
       FROM requests
       WHERE restaurant_id = $1 AND type = 'promo' AND message IS NOT NULL
         AND created_at >= $2::timestamptz AND created_at < $3::timestamptz
       GROUP BY message ORDER BY n DESC, message LIMIT 6`,
      range3,
    ),
  ]);

  return { range, timezone: tz, start: b.start, end: b.end, current, previous, daily, hourly, topGames, topTables, prizes, byGame, topPromos };
}
