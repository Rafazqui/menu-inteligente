import "server-only";
import { EventEmitter } from "node:events";

/**
 * Bus de eventos en memoria para avisar al panel en tiempo real (vía SSE).
 * Funciona con un solo proceso de servidor; para varias instancias se cambiaría
 * por Redis pub/sub o el realtime de Postgres/Supabase.
 */
export type BusTopic = "requests" | "tables" | "config";
export interface BusEvent {
  restaurantId: number;
  topic: BusTopic;
  /** true si es algo nuevo que merece sonar en el panel. */
  alert?: boolean;
}

declare global {
  var __mesaBus: EventEmitter | undefined;
}

export const bus: EventEmitter =
  globalThis.__mesaBus ?? (globalThis.__mesaBus = new EventEmitter().setMaxListeners(1000));

export function emit(restaurantId: number, topic: BusTopic, alert = false) {
  bus.emit("evt", { restaurantId, topic, alert } satisfies BusEvent);
}
