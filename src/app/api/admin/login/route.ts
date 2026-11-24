import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { signStaffCookie, STAFF_COOKIE, staffCookieOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { clientIp, fail, ok, rateLimit, readJson, sameOrigin } from "@/lib/http";

// Hash de relleno para que el tiempo de respuesta no revele si el usuario existe.
const DUMMY_HASH = bcrypt.hashSync("no-existe", 10);

export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, "Origen no permitido.");
  const body = await readJson<{ username?: string; password?: string }>(req);
  const username = (body?.username ?? "").toString().trim().toLowerCase();
  const password = (body?.password ?? "").toString();
  if (!username || !password) return fail(400, "Escribe usuario y contraseña.");

  const ip = clientIp(req);
  if (!rateLimit(`login:${ip}:${username}`, 6, 10 * 60_000) || !rateLimit(`login:${ip}`, 20, 10 * 60_000)) {
    return fail(429, "Demasiados intentos. Espera unos minutos.");
  }

  const user = db()
    .prepare("SELECT id, password_hash FROM staff WHERE username = ? AND active = 1")
    .get(username) as { id: number; password_hash: string } | undefined;
  const valid = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !valid) return fail(401, "Usuario o contraseña incorrectos.");

  (await cookies()).set(STAFF_COOKIE, await signStaffCookie(user.id), staffCookieOptions);
  return ok({ ok: true });
}

export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return fail(403, "Origen no permitido.");
  (await cookies()).delete(STAFF_COOKIE);
  return ok({ ok: true });
}
