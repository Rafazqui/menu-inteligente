import "server-only";
import { getStaff, type StaffUser } from "./auth";
import { db } from "./db";
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

export interface OverviewRequest {
  id: number;
  type: "waiter" | "boardgame" | "prize";
  status: "pending" | "attending" | "done" | "cancelled";
  message: string | null;
  table_number: number;
  area: string;
  game_name: string | null;
  handled_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export function overview(restaurantId: number) {
  const d = db();
  // Aplica expiración automática a las sesiones viejas antes de listar.
  const live = d
    .prepare(
      "SELECT DISTINCT table_id FROM table_sessions WHERE restaurant_id = ? AND status IN ('pending','open')",
    )
    .all(restaurantId) as { table_id: number }[];
  for (const l of live) getLiveSession(l.table_id);

  const rows = d
    .prepare(
      `SELECT t.id, t.number, t.area,
              s.id AS sid, s.status, COALESCE(s.opened_at, s.created_at) AS since, s.reward_used
       FROM tables t
       LEFT JOIN table_sessions s ON s.id = (
         SELECT id FROM table_sessions WHERE table_id = t.id AND status IN ('pending','open') ORDER BY id DESC LIMIT 1
       )
       WHERE t.restaurant_id = ? AND t.active = 1
       ORDER BY t.number`,
    )
    .all(restaurantId) as {
    id: number; number: number; area: string;
    sid: number | null; status: "pending" | "open" | null; since: string | null; reward_used: number | null;
  }[];

  const tables: OverviewTable[] = rows.map((r) => ({
    id: r.id,
    number: r.number,
    area: r.area,
    session: r.sid
      ? { id: r.sid, status: r.status!, since: r.since!, reward_used: r.reward_used ?? 0 }
      : null,
  }));

  const baseSql = `
    SELECT r.id, r.type, r.status, r.message, t.number AS table_number, t.area,
           g.name AS game_name, st.name AS handled_by_name, r.created_at, r.updated_at
    FROM requests r
    JOIN tables t ON t.id = r.table_id
    LEFT JOIN board_games g ON g.id = r.board_game_id
    LEFT JOIN staff st ON st.id = r.handled_by
    WHERE r.restaurant_id = ?`;

  const active = d
    .prepare(`${baseSql} AND r.status IN ('pending','attending') ORDER BY r.id ASC`)
    .all(restaurantId) as OverviewRequest[];
  const recent = d
    .prepare(
      `${baseSql} AND r.status IN ('done','cancelled') AND r.updated_at > datetime('now','-3 hours')
       ORDER BY r.updated_at DESC LIMIT 25`,
    )
    .all(restaurantId) as OverviewRequest[];

  return { tables, active, recent };
}
