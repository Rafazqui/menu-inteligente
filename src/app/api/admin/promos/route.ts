import { requireStaff } from "@/lib/admin";
import { exec, q, q1, tx } from "@/lib/db";
import { emit } from "@/lib/events";
import { fail, ok } from "@/lib/http";
import type { PromoRow } from "@/lib/promos";
import { deleteUpload, saveUpload, UploadError } from "@/lib/uploads";

export const dynamic = "force-dynamic";

/** Lista de recomendaciones (dueño y meseros), con cuántas veces se pidieron en 30 días. */
export async function GET() {
  const user = await requireStaff(null);
  if (user instanceof Response) return user;
  const rows = await q<PromoRow & { ends_date: string | null; expired: boolean; requests_30d: number }>(
    `SELECT p.*,
            to_char(((p.ends_at AT TIME ZONE r.timezone) - interval '1 second')::date, 'YYYY-MM-DD') AS ends_date,
            (p.ends_at IS NOT NULL AND p.ends_at <= now()) AS expired,
            (SELECT COUNT(*)::int FROM requests q
              WHERE q.promo_id = p.id AND q.created_at > now() - interval '30 days') AS requests_30d
     FROM promotions p JOIN restaurants r ON r.id = p.restaurant_id
     WHERE p.restaurant_id = $1
     ORDER BY p.sort, p.id`,
    [user.restaurant_id],
  );
  return ok({ promos: rows });
}

/** Pesos escritos por el usuario ("85", "85.50") → centavos, o null si viene vacío. */
function toCents(v: FormDataEntryValue | null): number | null | "error" {
  const s = (v ?? "").toString().trim().replace(/[$,\s]/g, "");
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > 100000) return "error";
  return Math.round(n * 100);
}

export async function POST(req: Request) {
  const user = await requireStaff(req);
  if (user instanceof Response) return user;
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, "Formulario inválido.");
  }
  const rid = user.restaurant_id;
  const action = (form.get("action") ?? "save").toString();
  const id = Number(form.get("id")) || null;
  const existing = id
    ? await q1<PromoRow>("SELECT * FROM promotions WHERE id = $1 AND restaurant_id = $2", [id, rid])
    : undefined;
  if (id && !existing) return fail(404, "Recomendación no encontrada.");

  const done = () => {
    emit(rid, "config");
    return ok();
  };

  if (action === "delete" && existing) {
    await exec("DELETE FROM promotions WHERE id = $1", [existing.id]);
    await deleteUpload(existing.image_file);
    return done();
  }
  if (action === "toggle" && existing) {
    await exec("UPDATE promotions SET active = 1 - active, updated_by = $2, updated_at = now() WHERE id = $1", [existing.id, user.id]);
    return done();
  }
  if (action === "move" && existing) {
    // Reordena: intercambia posición con la vecina de arriba o de abajo.
    const dir = form.get("dir") === "up" ? -1 : 1;
    await tx(async (c) => {
      const list = (await c.query<{ id: number }>("SELECT id FROM promotions WHERE restaurant_id = $1 ORDER BY sort, id", [rid])).rows;
      const i = list.findIndex((p) => p.id === existing.id);
      const j = i + dir;
      if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      for (let k = 0; k < list.length; k++) await c.query("UPDATE promotions SET sort = $1 WHERE id = $2", [k, list[k].id]);
    });
    return done();
  }
  if (action !== "save") return fail(400, "Acción inválida.");

  // ---- Guardar (nueva o edición) ----
  const title = (form.get("title") ?? "").toString().trim().slice(0, 60);
  if (!title) return fail(400, "Escribe el nombre de lo que quieres recomendar.");
  const description = (form.get("description") ?? "").toString().trim().slice(0, 160);
  const price = toCents(form.get("price"));
  if (price === "error") return fail(400, "El precio no es válido.");

  const dtype = (form.get("discount_type") ?? "none").toString();
  const discountType = dtype === "percent" || dtype === "amount" ? dtype : "none";
  let discountValue = 0;
  if (discountType === "percent") {
    discountValue = Math.round(Number(form.get("discount_value")));
    if (!(discountValue >= 1 && discountValue <= 90)) return fail(400, "El descuento debe ser de 1% a 90%.");
  } else if (discountType === "amount") {
    const v = toCents(form.get("discount_value"));
    if (v === "error" || v === null || v <= 0) return fail(400, "Escribe cuántos pesos de descuento.");
    if (price !== null && v >= price) return fail(400, "El descuento no puede ser mayor o igual al precio.");
    discountValue = v;
  }

  const endsDate = (form.get("ends_date") ?? "").toString().trim();
  if (endsDate && !/^\d{4}-\d{2}-\d{2}$/.test(endsDate)) return fail(400, "Fecha de fin inválida.");
  const active = form.get("active") === "0" ? 0 : 1;

  let image = existing?.image_file ?? null;
  try {
    const file = form.get("image");
    if (file instanceof File && file.size > 0) {
      const name = await saveUpload(file, "image", rid);
      await deleteUpload(image);
      image = name;
    } else if (form.get("remove_image") === "1") {
      await deleteUpload(image);
      image = null;
    }
  } catch (e) {
    if (e instanceof UploadError) return fail(400, e.message);
    throw e;
  }

  // La fecha de fin incluye todo ese día en la hora del café: vence a la medianoche siguiente.
  const endsSql = `CASE WHEN $8::text = '' THEN NULL
    ELSE (($8::text)::date + 1)::timestamp AT TIME ZONE (SELECT timezone FROM restaurants WHERE id = $9) END`;
  const values = [title, description, price, discountType, discountValue, image, active, endsDate, rid, user.id];

  if (existing) {
    await exec(
      `UPDATE promotions SET title = $1, description = $2, price_cents = $3, discount_type = $4, discount_value = $5,
         image_file = $6, active = $7, ends_at = ${endsSql}, updated_by = $10, updated_at = now()
       WHERE id = $11`,
      [...values, existing.id],
    );
  } else {
    await exec(
      `INSERT INTO promotions (title, description, price_cents, discount_type, discount_value, image_file, active,
         ends_at, restaurant_id, updated_by, sort)
       VALUES ($1, $2, $3, $4, $5, $6, $7, ${endsSql}, $9, $10,
         (SELECT COALESCE(MAX(sort), -1) + 1 FROM promotions WHERE restaurant_id = $9))`,
      values,
    );
  }
  return done();
}
