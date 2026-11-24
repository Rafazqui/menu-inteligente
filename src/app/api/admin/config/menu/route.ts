import { requireStaff } from "@/lib/admin";
import { exec } from "@/lib/db";
import { fail, ok } from "@/lib/http";
import { getRestaurant } from "@/lib/repo";
import { deleteUpload, saveUpload, UploadError } from "@/lib/uploads";

/** Sube (o reemplaza) el menú en PDF. */
export async function POST(req: Request) {
  const user = await requireStaff(req, "owner");
  if (user instanceof Response) return user;
  let file: FormDataEntryValue | null;
  try {
    file = (await req.formData()).get("file");
  } catch {
    return fail(400, "Formulario inválido.");
  }
  if (!(file instanceof File)) return fail(400, "Selecciona un PDF.");
  try {
    const name = await saveUpload(file, "pdf", user.restaurant_id);
    const prev = (await getRestaurant(user.restaurant_id))?.menu_file;
    await exec("UPDATE restaurants SET menu_file = $1 WHERE id = $2", [name, user.restaurant_id]);
    await deleteUpload(prev);
    return ok({ menuFile: name });
  } catch (e) {
    if (e instanceof UploadError) return fail(400, e.message);
    throw e;
  }
}
