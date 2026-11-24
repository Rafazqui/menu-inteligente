import { getTableContext } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { buildMesaState } from "@/lib/repo";

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await getTableContext();
  if (!ctx) return fail(401, "sin_sesion");
  return ok(buildMesaState(ctx));
}
