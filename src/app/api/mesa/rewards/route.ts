import { getTableContext } from "@/lib/auth";
import { fail, ok, rateLimit, readJson, sameOrigin } from "@/lib/http";
import { availablePrizes } from "@/lib/repo";
import { playInstant, RewardError } from "@/lib/rewards";

export const dynamic = "force-dynamic";

/** Lista pública de premios (sin probabilidades) para dibujar la ruleta. */
export async function GET() {
  const ctx = await getTableContext();
  if (!ctx) return fail(401, "sin_sesion");
  const prizes = (await availablePrizes(ctx.restaurant.id)).map((p) => ({ id: p.id, name: p.name }));
  return ok({ prizes });
}

/** Ruleta o rasca y gana: el servidor decide el resultado. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, "Origen no permitido.");
  const ctx = await getTableContext();
  if (!ctx) return fail(401, "sin_sesion");
  if (!rateLimit(`reward:${ctx.session.id}`, 5, 60_000)) return fail(429, "Espera un momento.");
  const body = await readJson<{ game?: string }>(req);
  if (body?.game !== "ruleta" && body?.game !== "rasca") return fail(400, "Juego inválido.");
  try {
    return ok(await playInstant(ctx.session.id, body.game));
  } catch (e) {
    if (e instanceof RewardError) return fail(e.status, e.message);
    throw e;
  }
}
