import bcrypt from "bcryptjs";
import { requireStaff } from "@/lib/admin";
import { db } from "@/lib/db";
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
  const d = db();
  const rid = user.restaurant_id;
  const password = (b.password ?? "").toString();

  if (b.action === "create") {
    const username = (b.username ?? "").toString().trim().toLowerCase();
    const name = (b.name ?? "").toString().trim().slice(0, 40);
    if (!USER_RE.test(username)) return fail(400, "Usuario: 3–30 letras minúsculas, números, punto o guion.");
    if (!name) return fail(400, "Escribe el nombre.");
    if (password.length < 8) return fail(400, "La contraseña debe tener al menos 8 caracteres.");
    const role = b.role === "owner" ? "owner" : "staff";
    if (d.prepare("SELECT id FROM staff WHERE username = ?").get(username)) {
      return fail(409, "Ese usuario ya existe.");
    }
    d.prepare(
      "INSERT INTO staff (restaurant_id, username, name, password_hash, role) VALUES (?, ?, ?, ?, ?)",
    ).run(rid, username, name, await bcrypt.hash(password, 10), role);
    return ok();
  }

  const id = Number(b.id);
  const target = d.prepare("SELECT id FROM staff WHERE id = ? AND restaurant_id = ?").get(id, rid);
  if (!target) return fail(404, "Usuario no encontrado.");

  if (b.action === "password") {
    if (password.length < 8) return fail(400, "La contraseña debe tener al menos 8 caracteres.");
    d.prepare("UPDATE staff SET password_hash = ? WHERE id = ?").run(await bcrypt.hash(password, 10), id);
    return ok();
  }
  if (b.action === "toggle") {
    if (id === user.id) return fail(400, "No puedes desactivar tu propio usuario.");
    d.prepare("UPDATE staff SET active = 1 - active WHERE id = ?").run(id);
    return ok();
  }
  return fail(400, "Acción inválida.");
}
