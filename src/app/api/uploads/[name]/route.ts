import { getUpload } from "@/lib/uploads";

/** Sirve archivos subidos (menú PDF, portadas) desde PostgreSQL. Los nombres son aleatorios e inmutables. */
export async function GET(_req: Request, ctx: RouteContext<"/api/uploads/[name]">) {
  const { name } = await ctx.params;
  const file = await getUpload(name);
  if (!file) return new Response("No encontrado", { status: 404 });
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.mime,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
