import { requireStaff } from "@/lib/admin";
import { exec, q1, randomToken, tx } from "@/lib/db";
import { emit } from "@/lib/events";
import { fail, ok, readJson } from "@/lib/http";
import { closeSession, getLiveSession } from "@/lib/repo";

/**
 * add: crea mesas de `from` a `to` en un área.
 * update: cambia área.
 * remove: desactiva la mesa (su QR deja de funcionar).
 * regen: genera un QR nuevo (el impreso anterior deja de servir).
 */
export async function POST(req: Request) {
  const user = await requireStaff(req, "owner");
  if (user instanceof Response) return user;
  const b = await readJson<{ action?: string; id?: number; from?: number; to?: number; area?: string }>(req);
  if (!b) return fail(400, "Solicitud inválida.");
  const rid = user.restaurant_id;
  const area = (b.area ?? "").toString().trim().slice(0, 30);

  if (b.action === "add") {
    const from = Math.round(Number(b.from));
    const to = Math.round(Number(b.to ?? b.from));
    if (!(from >= 1 && to >= from && to <= 999 && to - from < 100)) {
      return fail(400, "Rango de mesas inválido (máximo 100 a la vez).");
    }
    await tx(async (c) => {
      for (let n = from; n <= to; n++) {
        // Si la mesa existía (desactivada), se reactiva conservando su QR.
        await c.query(
          `INSERT INTO tables (restaurant_id, number, area, token) VALUES ($1, $2, $3, $4)
           ON CONFLICT (restaurant_id, number) DO UPDATE SET active = 1, area = EXCLUDED.area`,
          [rid, n, area, randomToken()],
        );
      }
    });
    emit(rid, "tables");
    return ok();
  }

  const id = Number(b.id);
  const t = Number.isInteger(id)
    ? await q1("SELECT id FROM tables WHERE id = $1 AND restaurant_id = $2", [id, rid])
    : undefined;
  if (!t) return fail(404, "Mesa no encontrada.");

  if (b.action === "update") {
    await exec("UPDATE tables SET area = $1 WHERE id = $2", [area, id]);
  } else if (b.action === "remove") {
    const live = await getLiveSession(id);
    if (live) await closeSession(live.session.id);
    await exec("UPDATE tables SET active = 0 WHERE id = $1", [id]);
  } else if (b.action === "regen") {
    const live = await getLiveSession(id);
    if (live) await closeSession(live.session.id);
    await exec("UPDATE tables SET token = $1 WHERE id = $2", [randomToken(), id]);
  } else {
    return fail(400, "Acción inválida.");
  }
  emit(rid, "tables");
  return ok();
}
