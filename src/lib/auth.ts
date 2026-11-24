import "server-only";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { db, DATA_DIR } from "./db";
import { getRestaurant, getLiveSession, type RestaurantRow, type SessionRow, type TableRow } from "./repo";

export const TABLE_COOKIE = "mesa_sesion";
export const STAFF_COOKIE = "mesa_staff";
const TABLE_TTL_SEC = 12 * 60 * 60;
const STAFF_TTL_SEC = 14 * 60 * 60;

let cachedSecret: Uint8Array | null = null;

/** Clave para firmar cookies. Usa AUTH_SECRET o genera una y la guarda en data/.auth-secret. */
function secret(): Uint8Array {
  if (cachedSecret) return cachedSecret;
  let value = process.env.AUTH_SECRET;
  if (!value) {
    db(); // asegura que exista DATA_DIR
    const file = path.join(DATA_DIR, ".auth-secret");
    if (fs.existsSync(file)) {
      value = fs.readFileSync(file, "utf8").trim();
    } else {
      value = crypto.randomBytes(48).toString("base64url");
      fs.writeFileSync(file, value, { mode: 0o600 });
    }
  }
  cachedSecret = new TextEncoder().encode(value);
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
    .sign(secret());
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
  try {
    const { payload } = await jwtVerify(raw, secret(), { audience: "mesa" });
    const sid = Number(payload.sid);
    if (!Number.isInteger(sid)) return null;
    const row = db()
      .prepare("SELECT table_id FROM table_sessions WHERE id = ?")
      .get(sid) as { table_id: number } | undefined;
    if (!row) return null;
    // getLiveSession aplica la expiración automática de sesiones viejas.
    const live = getLiveSession(row.table_id);
    if (!live || live.session.id !== sid) return null;
    const restaurant = getRestaurant(live.table.restaurant_id);
    if (!restaurant) return null;
    return { session: live.session, table: live.table, restaurant };
  } catch {
    return null;
  }
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
    .sign(secret());
}

export const staffCookieOptions = { ...cookieBase, maxAge: STAFF_TTL_SEC };

export async function getStaff(): Promise<StaffUser | null> {
  const store = await cookies();
  const raw = store.get(STAFF_COOKIE)?.value;
  if (!raw) return null;
  try {
    const { payload } = await jwtVerify(raw, secret(), { audience: "staff" });
    const user = db()
      .prepare(
        "SELECT id, restaurant_id, username, name, role FROM staff WHERE id = ? AND active = 1",
      )
      .get(Number(payload.uid)) as StaffUser | undefined;
    return user ?? null;
  } catch {
    return null;
  }
}
