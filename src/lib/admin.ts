import "server-only";
import { getStaff, type StaffUser } from "./auth";
import { q } from "./db";
import { fail, sameOrigin } from "./http";
import { getLiveSession } from "./repo";

/** Para rutas del panel: devuelve el usuario o una respuesta de error. */
export async function requireStaff(
  req: Request | null,
  role?: "owner",
): Promise<StaffUser | Response> {
  if (req && req.method !== "GET" && !sameOrigin(req)) return fail(403, "Origen no permitido.");
  const user = await getStaff();
  if (!user) return fail(401, "Inicia sesión.");
  if (role === "owner" && user.role !== "owner") return fail(403, "Solo el dueño puede hacer esto.");
  return user;
}

export interface OverviewTable {
  id: number;
  number: number;
  area: string;
  session: null | {
    id: number;
    status: "pending" | "open";
    since: string;
    reward_used: number;
  };
}

export interface OverviewLoan {
  game_id: number;
  game_name: string;
  table_number: number;
  area: string;
  since: string;
}

export interface OverviewRequest {
  id: number;
  type: "waiter" | "boardgame" | "prize" | "bill" | "promo";
  status: "pending" | "attending" | "done" | "cancelled";
  message: string | null;
  payment_method: "efectivo" | "tarjeta" | null;
  table_number: number;
  area: string;
  game_name: string | null;
  handled_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export async function overview(restaurantId: number) {
  // Aplica expiración automática a las sesiones viejas antes de listar.
  const live = await q<{ table_id: number }>(
    "SELECT DISTINCT table_id FROM table_sessions WHERE restaurant_id = $1 AND status IN ('pending','open')",
    [restaurantId],
  );
  await Promise.all(live.map((l) => getLiveSession(l.table_id)));

  const rows = await q<{
    id: number; number: number; area: string;
    sid: number | null; status: "pending" | "open" | null; since: string | null; reward_used: number | null;
  }>(
    `SELECT t.id, t.number, t.area,
            s.id AS sid, s.status, COALESCE(s.opened_at, s.created_at) AS since, s.reward_used
     FROM tables t
     LEFT JOIN table_sessions s ON s.table_id = t.id AND s.status IN ('pending','open')
     WHERE t.restaurant_id = $1 AND t.active = 1
     ORDER BY t.number`,
    [restaurantId],
  );

  const tables: OverviewTable[] = rows.map((r) => ({
    id: r.id,
    number: r.number,
    area: r.area,
    session: r.sid
      ? { id: r.sid, status: r.status!, since: r.since!, reward_used: r.reward_used ?? 0 }
      : null,
  }));

  const baseSql = `
    SELECT r.id, r.type, r.status, r.message, r.payment_method, t.number AS table_number, t.area,
           g.name AS game_name, st.name AS handled_by_name, r.created_at, r.updated_at
    FROM requests r
    JOIN tables t ON t.id = r.table_id
    LEFT JOIN board_games g ON g.id = r.board_game_id
    LEFT JOIN staff st ON st.id = r.handled_by
    WHERE r.restaurant_id = $1`;

  const [active, recent, loans] = await Promise.all([
    q<OverviewRequest>(`${baseSql} AND r.status IN ('pending','attending') ORDER BY r.id ASC`, [restaurantId]),
    q<OverviewRequest>(
      `${baseSql} AND r.status IN ('done','cancelled') AND r.updated_at > now() - interval '3 hours'
       ORDER BY r.updated_at DESC LIMIT 25`,
      [restaurantId],
    ),
    q<OverviewLoan>(
      `SELECT g.id AS game_id, g.name AS game_name, t.number AS table_number, t.area, g.in_use_since AS since
       FROM board_games g
       JOIN table_sessions s ON s.id = g.in_use_session_id
       JOIN tables t ON t.id = s.table_id
       WHERE g.restaurant_id = $1
       ORDER BY g.in_use_since`,
      [restaurantId],
    ),
  ]);

  return { tables, active, recent, loans };
}
