import bcrypt from "bcryptjs";
import { requireStaff } from "@/lib/admin";
import { exec, q1 } from "@/lib/db";
import { fail, ok, rateLimit, readJson } from "@/lib/http";
import { weakPassword } from "@/lib/passwords";

/** Cualquier usuario del panel cambia SU propia contraseña (pide la actual). */
export async function POST(req: Request) {
  const user = await requireStaff(req);
  if (user instanceof Response) return user;
  if (!rateLimit(`mypw:${user.id}`, 5, 10 * 60_000)) return fail(429, "Demasiados intentos. Espera unos minutos.");

  const b = await readJson<{ current?: string; next?: string }>(req);
  const current = (b?.current ?? "").toString();
  const next = (b?.next ?? "").toString();

  const row = await q1<{ password_hash: string }>("SELECT password_hash FROM staff WHERE id = $1", [user.id]);
  if (!row || !(await bcrypt.compare(current, row.password_hash))) {
    return fail(400, "Tu contraseña actual no es correcta.");
  }
  if (next === current) return fail(400, "La contraseña nueva debe ser distinta de la actual.");
  const weak = weakPassword(next, user.username);
  if (weak) return fail(400, weak);

  await exec("UPDATE staff SET password_hash = $1 WHERE id = $2", [await bcrypt.hash(next, 10), user.id]);
  return ok();
}
