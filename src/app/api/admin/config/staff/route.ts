import bcrypt from "bcryptjs";
import { requireStaff } from "@/lib/admin";
import { exec, q1 } from "@/lib/db";
import { fail, ok, readJson } from "@/lib/http";

const USER_RE = /^[a-z0-9._-]{3,30}$/;

/** Gestión del personal: crear usuarios, cambiar contraseñas, activar/desactivar. */
export async function POST(req: Request) {
  const user = await requireStaff(req, "owner");
  if (user instanceof Response) return user;
  const b = await readJson<{
    action?: string;
    id?: number;
    username?: string;
    name?: string;
    password?: string;
    role?: string;
  }>(req);
  if (!b) return fail(400, "Solicitud inválida.");
  const rid = user.restaurant_id;
  const password = (b.password ?? "").toString();

  if (b.action === "create") {
    const username = (b.username ?? "").toString().trim().toLowerCase();
    const name = (b.name ?? "").toString().trim().slice(0, 40);
    if (!USER_RE.test(username)) return fail(400, "Usuario: 3–30 letras minúsculas, números, punto o guion.");
    if (!name) return fail(400, "Escribe el nombre.");
    if (password.length < 8) return fail(400, "La contraseña debe tener al menos 8 caracteres.");
    const role = b.role === "owner" ? "owner" : "staff";
    const created = await q1(
      `INSERT INTO staff (restaurant_id, username, name, password_hash, role) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (username) DO NOTHING RETURNING id`,
      [rid, username, name, await bcrypt.hash(password, 10), role],
    );
    if (!created) return fail(409, "Ese usuario ya existe.");
    return ok();
  }

  const id = Number(b.id);
  const target = Number.isInteger(id)
    ? await q1("SELECT id FROM staff WHERE id = $1 AND restaurant_id = $2", [id, rid])
    : undefined;
  if (!target) return fail(404, "Usuario no encontrado.");

  if (b.action === "password") {
    if (password.length < 8) return fail(400, "La contraseña debe tener al menos 8 caracteres.");
    await exec("UPDATE staff SET password_hash = $1 WHERE id = $2", [await bcrypt.hash(password, 10), id]);
    return ok();
  }
  if (b.action === "toggle") {
    if (id === user.id) return fail(400, "No puedes desactivar tu propio usuario.");
    await exec("UPDATE staff SET active = 1 - active WHERE id = $1", [id]);
    return ok();
  }
  return fail(400, "Acción inválida.");
}
