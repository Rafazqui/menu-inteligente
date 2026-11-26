import { getTableContext } from "@/lib/auth";
import { exec } from "@/lib/db";
import { fail, readJson, sameOrigin } from "@/lib/http";

const TYPES = new Set(["menu_view", "review_click", "ludoteca_view"]);

/**
 * Registra eventos para las estadísticas (ver el menú, abrir el enlace de reseña…).
 * Cuenta como máximo uno por mesa y tipo cada 10 minutos, así recargar la página no infla los números.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, "Origen no permitido.");
  const ctx = await getTableContext();
  if (!ctx) return new Response(null, { status: 204 });
  const body = await readJson<{ type?: string }>(req);
  const type = body?.type ?? "";
  if (!TYPES.has(type)) return fail(400, "Evento inválido.");
  await exec(
    `INSERT INTO analytics_events (restaurant_id, session_id, table_id, type)
     SELECT $1, $2, $3, $4::text
     WHERE NOT EXISTS (
       SELECT 1 FROM analytics_events
       WHERE session_id = $2 AND type = $4::text AND created_at > now() - interval '10 minutes'
     )`,
    [ctx.restaurant.id, ctx.session.id, ctx.table.id, type],
  );
  return new Response(null, { status: 204 });
}
