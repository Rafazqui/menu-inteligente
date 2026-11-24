import "server-only";
import { EventEmitter } from "node:events";
import pg from "pg";
import { pool } from "./db";

/**
 * Avisos en tiempo real para el panel (vía SSE).
 * Se publican con NOTIFY de PostgreSQL, así llegan a TODOS los servidores conectados
 * a la misma base, no solo al que recibió la petición.
 */
export type BusTopic = "requests" | "tables" | "config";
export interface BusEvent {
  restaurantId: number;
  topic: BusTopic;
  /** true si es algo nuevo que merece sonar en el panel. */
  alert?: boolean;
}

const CHANNEL = "mesa_eventos";

declare global {
  var __mesaBus: EventEmitter | undefined;
  var __mesaListener: { started: boolean } | undefined;
}

export const bus: EventEmitter =
  globalThis.__mesaBus ?? (globalThis.__mesaBus = new EventEmitter().setMaxListeners(1000));

/**
 * Conexión dedicada que escucha el canal. Si la base usa un "pooler" en modo transacción
 * (Neon/Supabase), define DATABASE_URL_DIRECT con la conexión directa: LISTEN no funciona a través del pooler.
 */
export function ensureListener() {
  if (globalThis.__mesaListener?.started) return;
  globalThis.__mesaListener = { started: true };
  const connectionString = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
  if (!connectionString) return;

  const connect = () => {
    const client = new pg.Client({ connectionString });
    let retried = false;
    const retry = (why: string) => {
      if (retried) return;
      retried = true;
      console.warn(`[eventos] reconectando LISTEN (${why})`);
      client.end().catch(() => {});
      setTimeout(connect, 3000);
    };
    client.on("notification", (n) => {
      if (n.channel !== CHANNEL || !n.payload) return;
      try {
        bus.emit("evt", JSON.parse(n.payload) as BusEvent);
      } catch {}
    });
    client.on("error", (e) => retry(e.message));
    client.on("end", () => retry("conexión cerrada"));
    client
      .connect()
      .then(() => client.query(`LISTEN ${CHANNEL}`))
      .catch((e) => retry(e.message));
  };
  connect();
}

export function emit(restaurantId: number, topic: BusTopic, alert = false) {
  ensureListener();
  const evt: BusEvent = { restaurantId, topic, alert };
  pool()
    .query("SELECT pg_notify($1, $2)", [CHANNEL, JSON.stringify(evt)])
    .catch(() => bus.emit("evt", evt)); // si falla NOTIFY, al menos avisar en este servidor
}
