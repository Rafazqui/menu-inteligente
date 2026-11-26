import { requireStaff } from "@/lib/admin";
import { exec } from "@/lib/db";
import { fail, ok, readJson } from "@/lib/http";
import { notifyStaffMember, vapidKeys } from "@/lib/push";

export const dynamic = "force-dynamic";

/** Llave pública para que el navegador se suscriba. */
export async function GET() {
  const user = await requireStaff(null);
  if (user instanceof Response) return user;
  return ok({ publicKey: (await vapidKeys()).publicKey });
}

interface SubscriptionJSON {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
}

/** Suscribe este dispositivo (action "subscribe"), lo da de baja ("unsubscribe") o envía una prueba ("test"). */
export async function POST(req: Request) {
  const user = await requireStaff(req);
  if (user instanceof Response) return user;
  const b = await readJson<{ action?: string; subscription?: SubscriptionJSON; endpoint?: string }>(req);

  if (b?.action === "subscribe") {
    const s = b.subscription;
    const endpoint = s?.endpoint ?? "";
    // Solo servicios push reales (https); evita guardar URLs arbitrarias.
    if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !s?.keys?.p256dh || !s.keys.auth) {
      return fail(400, "Suscripción inválida.");
    }
    await exec(
      `INSERT INTO push_subscriptions (restaurant_id, staff_id, endpoint, p256dh, auth)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (endpoint) DO UPDATE SET restaurant_id = EXCLUDED.restaurant_id, staff_id = EXCLUDED.staff_id,
         p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
      [user.restaurant_id, user.id, endpoint, s.keys.p256dh, s.keys.auth],
    );
    return ok();
  }

  if (b?.action === "unsubscribe") {
    if (b.endpoint) await exec("DELETE FROM push_subscriptions WHERE endpoint = $1 AND staff_id = $2", [b.endpoint, user.id]);
    return ok();
  }

  if (b?.action === "test") {
    const n = await notifyStaffMember(user.id, user.restaurant_id, {
      title: "Notificaciones activadas ✓",
      body: "Así te avisaremos cuando una mesa te necesite.",
      tag: "prueba",
    });
    if (n === 0) return fail(404, "Este dispositivo no está suscrito.");
    return ok({ devices: n });
  }

  return fail(400, "Acción inválida.");
}
