import "server-only";
import { after } from "next/server";
import { generateVAPIDKeys, sendNotification } from "web-push";
import { exec, q, q1 } from "./db";
import { getSettings } from "./repo";

/**
 * Notificaciones push para los celulares del personal (Web Push, gratis).
 * Las llaves VAPID se generan solas la primera vez y se guardan en app_secrets,
 * así todos los servidores usan las mismas (o se definen con VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY).
 */

interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

let cached: Promise<VapidKeys> | null = null;

export function vapidKeys(): Promise<VapidKeys> {
  if (!cached) {
    cached = (async () => {
      if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
        return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
      }
      const fresh = generateVAPIDKeys();
      await q("INSERT INTO app_secrets (key, value) VALUES ('vapid', $1) ON CONFLICT (key) DO NOTHING", [
        JSON.stringify({ publicKey: fresh.publicKey, privateKey: fresh.privateKey }),
      ]);
      const row = await q1<{ value: string }>("SELECT value FROM app_secrets WHERE key = 'vapid'");
      return JSON.parse(row!.value) as VapidKeys;
    })().catch((e) => {
      cached = null;
      throw e;
    });
  }
  return cached;
}

export interface PushMessage {
  title: string;
  body: string;
  /** Notificaciones con el mismo tag se reemplazan en vez de amontonarse. */
  tag?: string;
  url?: string;
}

interface SubRow {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
}

async function deliver(subs: SubRow[], restaurantId: number, msg: PushMessage) {
  if (subs.length === 0) return;
  const keys = await vapidKeys();
  const { legal } = await getSettings(restaurantId);
  const subject = process.env.VAPID_SUBJECT || (legal.email ? `mailto:${legal.email}` : "mailto:notificaciones@menu-inteligente.app");
  const payload = JSON.stringify({ url: "/admin", ...msg });
  await Promise.all(
    subs.map(async (s) => {
      try {
        await sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
          vapidDetails: { subject, publicKey: keys.publicKey, privateKey: keys.privateKey },
          TTL: 300, // si el celular está apagado más de 5 min, ya no vale la pena avisar
          urgency: "high",
        });
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        // 404/410: el celular canceló el permiso o la suscripción expiró → se borra.
        if (code === 404 || code === 410) await exec("DELETE FROM push_subscriptions WHERE id = $1", [s.id]);
        else console.warn("[push] no se pudo enviar:", code ?? (e as Error).message);
      }
    }),
  );
}

/** Envía a todos los celulares del personal activo del negocio, sin retrasar la respuesta al cliente. */
export function notifyStaff(restaurantId: number, msg: PushMessage) {
  const run = async () => {
    const subs = await q<SubRow>(
      `SELECT ps.id, ps.endpoint, ps.p256dh, ps.auth
       FROM push_subscriptions ps JOIN staff s ON s.id = ps.staff_id AND s.active = 1
       WHERE ps.restaurant_id = $1`,
      [restaurantId],
    );
    await deliver(subs, restaurantId, msg);
  };
  const safe = () => run().catch((e) => console.warn("[push]", (e as Error).message));
  try {
    after(safe); // se ejecuta cuando ya se respondió (en Vercel mantiene viva la función hasta terminar)
  } catch {
    void safe(); // fuera de una petición (p. ej. scripts)
  }
}

/** Prueba: envía solo a los dispositivos de un usuario. Devuelve cuántos había. */
export async function notifyStaffMember(staffId: number, restaurantId: number, msg: PushMessage): Promise<number> {
  const subs = await q<SubRow>(
    "SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE staff_id = $1",
    [staffId],
  );
  await deliver(subs, restaurantId, msg);
  return subs.length;
}

/** Número y área de una mesa, para el texto de la notificación. */
export async function tableLabel(tableId: number): Promise<string> {
  const t = await q1<{ number: number }>("SELECT number FROM tables WHERE id = $1", [tableId]);
  return t ? `Mesa ${t.number}` : "Una mesa";
}
