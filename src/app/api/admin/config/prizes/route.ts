import { requireStaff } from "@/lib/admin";
import { exec } from "@/lib/db";
import { fail, ok, readJson } from "@/lib/http";

/** Crear / editar / borrar premios. `weight` es el peso relativo entre premios. */
export async function POST(req: Request) {
  const user = await requireStaff(req, "owner");
  if (user instanceof Response) return user;
  const b = await readJson<{
    action?: "save" | "delete";
    id?: number;
    name?: string;
    weight?: number;
    stock?: number | null;
    active?: boolean;
  }>(req);
  if (!b) return fail(400, "Solicitud inválida.");
  const rid = user.restaurant_id;

  if (b.action === "delete") {
    await exec("DELETE FROM prizes WHERE id = $1 AND restaurant_id = $2", [Number(b.id) || 0, rid]);
    return ok();
  }

  const name = (b.name ?? "").toString().trim().slice(0, 50);
  if (!name) return fail(400, "Escribe el nombre del premio.");
  const weight = Math.min(1000, Math.max(0, Math.round(Number(b.weight) || 0)));
  const stock =
    b.stock === null || b.stock === undefined || (b.stock as unknown) === ""
      ? null
      : Math.max(0, Math.round(Number(b.stock) || 0));
  const active = b.active === false ? 0 : 1;

  if (b.id) {
    const changed = await exec(
      "UPDATE prizes SET name = $1, weight = $2, stock = $3, active = $4 WHERE id = $5 AND restaurant_id = $6",
      [name, weight, stock, active, Number(b.id) || 0, rid],
    );
    if (changed === 0) return fail(404, "Premio no encontrado.");
  } else {
    await exec("INSERT INTO prizes (restaurant_id, name, weight, stock, active) VALUES ($1, $2, $3, $4, $5)", [
      rid, name, weight, stock, active,
    ]);
  }
  return ok();
}
