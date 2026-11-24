import { NextResponse, type NextRequest } from "next/server";
import { getTableContext, signTableCookie, TABLE_COOKIE, tableCookieOptions } from "@/lib/auth";
import { publicUrl, rateLimit } from "@/lib/http";
import { createSession, getLiveSession, getSettings, getTableByToken } from "@/lib/repo";

/**
 * Punto de entrada del QR / NFC de cada mesa: /m/<token>
 * - Si la mesa ya tiene una sesión viva, el teléfono se une a ella.
 * - Si no, se crea una sesión "pendiente" que el mesero aprueba desde el panel
 *   (o abierta directamente si el dueño desactivó la aprobación).
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/m/[token]">) {
  const { token } = await ctx.params;
  const table = getTableByToken(token);
  if (!table) return NextResponse.redirect(publicUrl(req, "/?aviso=mesa"));

  const current = await getTableContext();
  let sessionId: number;

  if (current && current.table.id === table.id) {
    sessionId = current.session.id;
  } else {
    const live = getLiveSession(table.id);
    if (live) {
      sessionId = live.session.id;
    } else {
      const { requireApproval } = getSettings(table.restaurant_id);
      // Evita que alguien con una foto del QR inunde el panel de solicitudes.
      if (requireApproval && !rateLimit(`pending:${table.id}`, 3, 2 * 60_000)) {
        return NextResponse.redirect(publicUrl(req, "/?aviso=espera"));
      }
      sessionId = createSession(table, requireApproval ? "pending" : "open").id;
    }
  }

  const res = NextResponse.redirect(publicUrl(req, "/mesa"));
  res.cookies.set(TABLE_COOKIE, await signTableCookie(sessionId), tableCookieOptions);
  return res;
}
