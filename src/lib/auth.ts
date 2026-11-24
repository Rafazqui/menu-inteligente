import "server-only";
import crypto from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { q, q1 } from "./db";
import { getLiveSession, getRestaurant, type RestaurantRow, type SessionRow, type TableRow } from "./repo";

export const TABLE_COOKIE = "mesa_sesion";
export const STAFF_COOKIE = "mesa_staff";
const TABLE_TTL_SEC = 12 * 60 * 60;
const STAFF_TTL_SEC = 14 * 60 * 60;

let cachedSecret: Promise<Uint8Array> | null = null;

/**
 * Clave para firmar cookies. Usa AUTH_SECRET o la guardada en la base (tabla app_secrets),
 * así todos los servidores comparten la misma y las sesiones siguen valiendo entre ellos.
 */
function secret(): Promise<Uint8Array> {
  if (!cachedSecret) {
    cachedSecret = (async () => {
      let value = process.env.AUTH_SECRET;
      if (!value) {
        await q("INSERT INTO app_secrets (key, value) VALUES ('auth', $1) ON CONFLICT (key) DO NOTHING", [
          crypto.randomBytes(48).toString("base64url"),
        ]);
        value = (await q1<{ value: string }>("SELECT value FROM app_secrets WHERE key = 'auth'"))!.value;
      }
      return new TextEncoder().encode(value);
    })().catch((e) => {
      cachedSecret = null;
      throw e;
    });
  }
  return cachedSecret;
}

export const cookieBase = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

// ---------- Mesa (cliente) ----------

export async function signTableCookie(sessionId: number): Promise<string> {
  return new SignJWT({ sid: sessionId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${TABLE_TTL_SEC}s`)
    .setAudience("mesa")
    .sign(await secret());
}

export const tableCookieOptions = { ...cookieBase, maxAge: TABLE_TTL_SEC };

export interface TableContext {
  session: SessionRow;
  table: TableRow;
  restaurant: RestaurantRow;
}

/** Devuelve la sesión de mesa del dispositivo si sigue viva (pendiente o abierta). */
export async function getTableContext(): Promise<TableContext | null> {
  const store = await cookies();
  const raw = store.get(TABLE_COOKIE)?.value;
  if (!raw) return null;
  let sid: number;
  try {
    const { payload } = await jwtVerify(raw, await secret(), { audience: "mesa" });
    sid = Number(payload.sid);
    if (!Number.isInteger(sid)) return null;
  } catch {
    return null; // cookie alterada o vencida
  }
  const row = await q1<{ table_id: number }>("SELECT table_id FROM table_sessions WHERE id = $1", [sid]);
  if (!row) return null;
  // getLiveSession aplica la expiración automática de sesiones viejas.
  const live = await getLiveSession(row.table_id);
  if (!live || live.session.id !== sid) return null;
  const restaurant = await getRestaurant(live.table.restaurant_id);
  if (!restaurant) return null;
  return { session: live.session, table: live.table, restaurant };
}

// ---------- Personal (admin / mesero) ----------

export interface StaffUser {
  id: number;
  restaurant_id: number;
  username: string;
  name: string;
  role: "owner" | "staff";
}

export async function signStaffCookie(staffId: number): Promise<string> {
  return new SignJWT({ uid: staffId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${STAFF_TTL_SEC}s`)
    .setAudience("staff")
    .sign(await secret());
}

export const staffCookieOptions = { ...cookieBase, maxAge: STAFF_TTL_SEC };

export async function getStaff(): Promise<StaffUser | null> {
  const store = await cookies();
  const raw = store.get(STAFF_COOKIE)?.value;
  if (!raw) return null;
  let uid: number;
  try {
    const { payload } = await jwtVerify(raw, await secret(), { audience: "staff" });
    uid = Number(payload.uid);
  } catch {
    return null;
  }
  const user = await q1<StaffUser>(
    "SELECT id, restaurant_id, username, name, role FROM staff WHERE id = $1 AND active = 1",
    [uid],
  );
  return user ?? null;
}
