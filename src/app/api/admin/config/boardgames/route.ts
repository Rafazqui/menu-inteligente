import { requireStaff } from "@/lib/admin";
import { exec, q1 } from "@/lib/db";
import { fail, ok } from "@/lib/http";
import { deleteUpload, saveUpload, UploadError } from "@/lib/uploads";

const int = (v: FormDataEntryValue | null, min: number, max: number, def: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};

/** Alta / edición / baja de juegos de la ludoteca (multipart, con portada y contraportada). */
export async function POST(req: Request) {
  const user = await requireStaff(req, "owner");
  if (user instanceof Response) return user;
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, "Formulario inválido.");
  }
  const rid = user.restaurant_id;
  const id = Number(form.get("id")) || null;
  const existing = id
    ? await q1<{ cover_file: string | null; back_file: string | null }>(
        "SELECT cover_file, back_file FROM board_games WHERE id = $1 AND restaurant_id = $2",
        [id, rid],
      )
    : undefined;
  if (id && !existing) return fail(404, "Juego no encontrado.");

  if (form.get("action") === "delete" && id) {
    await exec("DELETE FROM board_games WHERE id = $1", [id]);
    await deleteUpload(existing?.cover_file);
    await deleteUpload(existing?.back_file);
    return ok();
  }

  const name = (form.get("name") ?? "").toString().trim().slice(0, 60);
  if (!name) return fail(400, "Escribe el nombre del juego.");
  const genre = (form.get("genre") ?? "").toString().trim().slice(0, 40);
  const summary = (form.get("summary") ?? "").toString().trim().slice(0, 400);
  const minP = int(form.get("min_players"), 1, 30, 2);
  const maxP = Math.max(minP, int(form.get("max_players"), 1, 30, 4));
  const minutes = int(form.get("minutes"), 1, 600, 30);
  const available = form.get("available") === "0" ? 0 : 1;

  let cover = existing?.cover_file ?? null;
  let back = existing?.back_file ?? null;
  try {
    const c = form.get("cover");
    if (c instanceof File && c.size > 0) {
      const n = await saveUpload(c, "image", rid);
      await deleteUpload(cover);
      cover = n;
    }
    const bk = form.get("back");
    if (bk instanceof File && bk.size > 0) {
      const n = await saveUpload(bk, "image", rid);
      await deleteUpload(back);
      back = n;
    }
  } catch (e) {
    if (e instanceof UploadError) return fail(400, e.message);
    throw e;
  }

  if (id) {
    await exec(
      `UPDATE board_games SET name=$1, genre=$2, summary=$3, min_players=$4, max_players=$5, minutes=$6,
         available=$7, cover_file=$8, back_file=$9
       WHERE id = $10`,
      [name, genre, summary, minP, maxP, minutes, available, cover, back, id],
    );
  } else {
    await exec(
      `INSERT INTO board_games (restaurant_id, name, genre, summary, min_players, max_players, minutes, available, cover_file, back_file)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [rid, name, genre, summary, minP, maxP, minutes, available, cover, back],
    );
  }
  return ok();
}
