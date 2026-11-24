import fs from "node:fs/promises";
import path from "node:path";
import { UPLOADS_DIR } from "@/lib/db";
import { mimeFor, UPLOAD_NAME_RE } from "@/lib/uploads";

/** Sirve archivos subidos (menú PDF, portadas). Los nombres son aleatorios e inmutables. */
export async function GET(_req: Request, ctx: RouteContext<"/api/uploads/[name]">) {
  const { name } = await ctx.params;
  if (!UPLOAD_NAME_RE.test(name)) return new Response("No encontrado", { status: 404 });
  try {
    const buf = await fs.readFile(path.join(UPLOADS_DIR, name));
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": mimeFor(name),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("No encontrado", { status: 404 });
  }
}
