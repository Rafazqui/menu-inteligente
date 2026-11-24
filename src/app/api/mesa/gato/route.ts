import { getTableContext } from "@/lib/auth";
import { fail, ok, rateLimit, readJson, sameOrigin } from "@/lib/http";
import { getGato, moveGato, RewardError, startGato } from "@/lib/rewards";

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await getTableContext();
  if (!ctx) return fail(401, "sin_sesion");
  return ok({ game: getGato(ctx.session.id) });
}

/** Cada jugada se valida en el servidor; la IA responde desde aquí. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, "Origen no permitido.");
  const ctx = await getTableContext();
  if (!ctx) return fail(401, "sin_sesion");
  if (!rateLimit(`gato:${ctx.session.id}`, 30, 60_000)) return fail(429, "Más despacio 🙂");
  const body = await readJson<{ action?: string; cell?: number }>(req);
  try {
    if (body?.action === "start") return ok({ game: startGato(ctx.session.id) });
    if (body?.action === "move") return ok({ game: moveGato(ctx.session.id, Number(body.cell)) });
    return fail(400, "Acción inválida.");
  } catch (e) {
    if (e instanceof RewardError) return fail(e.status, e.message);
    throw e;
  }
}
