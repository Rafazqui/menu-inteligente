import { requireStaff } from "@/lib/admin";
import { db, randomToken } from "@/lib/db";
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
  const d = db();
  const rid = user.restaurant_id;
  const area = (b.area ?? "").toString().trim().slice(0, 30);

  if (b.action === "add") {
    const from = Math.round(Number(b.from));
    const to = Math.round(Number(b.to ?? b.from));
    if (!(from >= 1 && to >= from && to <= 999 && to - from < 100)) {
      return fail(400, "Rango de mesas inválido (máximo 100 a la vez).");
    }
    d.transaction(() => {
      for (let n = from; n <= to; n++) {
        const ex = d.prepare("SELECT id FROM tables WHERE restaurant_id = ? AND number = ?").get(rid, n) as
          | { id: number }
          | undefined;
        if (ex) d.prepare("UPDATE tables SET active = 1, area = ? WHERE id = ?").run(area, ex.id);
        else d.prepare("INSERT INTO tables (restaurant_id, number, area, token) VALUES (?, ?, ?, ?)").run(rid, n, area, randomToken());
      }
    })();
    emit(rid, "tables");
    return ok();
  }

  const id = Number(b.id);
  const t = d.prepare("SELECT id FROM tables WHERE id = ? AND restaurant_id = ?").get(id, rid);
  if (!t) return fail(404, "Mesa no encontrada.");

  if (b.action === "update") {
    d.prepare("UPDATE tables SET area = ? WHERE id = ?").run(area, id);
  } else if (b.action === "remove") {
    const live = getLiveSession(id);
    if (live) closeSession(live.session.id);
    d.prepare("UPDATE tables SET active = 0 WHERE id = ?").run(id);
  } else if (b.action === "regen") {
    const live = getLiveSession(id);
    if (live) closeSession(live.session.id);
    d.prepare("UPDATE tables SET token = ? WHERE id = ?").run(randomToken(), id);
  } else {
    return fail(400, "Acción inválida.");
  }
  emit(rid, "tables");
  return ok();
}
