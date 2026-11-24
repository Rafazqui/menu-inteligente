import "server-only";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import pg, { type PoolClient, type QueryResultRow } from "pg";
import { SCHEMA_LOCK_ID, SCHEMA_SQL } from "./schema";
import { DEFAULT_SETTINGS } from "./types";

// Las fechas (timestamptz) se entregan como texto ISO: se serializan igual en servidor y cliente.
pg.types.setTypeParser(1184, (v) => new Date(v).toISOString());

/** Conexión o transacción sobre la que se ejecuta una consulta. */
export type Db = pg.Pool | PoolClient;

declare global {
  var __mesaPool: pg.Pool | undefined;
  var __mesaReady: Promise<void> | undefined;
}

export function pool(): pg.Pool {
  if (!globalThis.__mesaPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        "Falta DATABASE_URL. Crea el archivo .env.local con la cadena de conexión de PostgreSQL (ver README).",
      );
    }
    globalThis.__mesaPool = new pg.Pool({
      connectionString,
      max: Number(process.env.PG_POOL_MAX) || 10,
      idleTimeoutMillis: 30_000,
    });
    // Un error en una conexión inactiva no debe tumbar el servidor.
    globalThis.__mesaPool.on("error", (e) => console.error("[db] conexión inactiva con error:", e.message));
  }
  return globalThis.__mesaPool;
}

/** Crea el esquema (y los datos iniciales si la base está vacía) una sola vez por proceso. */
export function ready(): Promise<void> {
  if (!globalThis.__mesaReady) {
    globalThis.__mesaReady = init().catch((e) => {
      globalThis.__mesaReady = undefined; // reintentar en la siguiente petición
      throw e;
    });
  }
  return globalThis.__mesaReady;
}

/**
 * Todo en UNA transacción con bloqueo de transacción (pg_advisory_xact_lock): se libera solo al
 * terminar, así funciona también detrás de un "pooler" (Neon/Vercel), donde un bloqueo de sesión
 * podría quedarse tomado en otra conexión y congelar la app.
 */
async function init() {
  const c = await pool().connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock($1)", [SCHEMA_LOCK_ID]);
    await c.query(SCHEMA_SQL);
    await seedIfEmpty(c);
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/** Ejecuta una consulta y devuelve las filas. */
export async function q<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
  c?: Db,
): Promise<T[]> {
  await ready();
  return (await (c ?? pool()).query<T>(text, params)).rows;
}

/** Primera fila o undefined. */
export async function q1<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
  c?: Db,
): Promise<T | undefined> {
  return (await q<T>(text, params, c))[0];
}

/** Número de filas afectadas (UPDATE / DELETE). */
export async function exec(text: string, params: unknown[] = [], c?: Db): Promise<number> {
  await ready();
  return (await (c ?? pool()).query(text, params)).rowCount ?? 0;
}

/** Transacción: todo o nada. */
export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  await ready();
  const c = await pool().connect();
  try {
    await c.query("BEGIN");
    const result = await fn(c);
    await c.query("COMMIT");
    return result;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/** Token aleatorio para las URLs de los QR (no adivinable, a diferencia del número de mesa). */
export function randomToken(len = 12): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[crypto.randomInt(alphabet.length)];
  return out;
}

/** Datos de ejemplo si la base está vacía. Se ejecuta dentro de la transacción de init(). */
async function seedIfEmpty(c: PoolClient) {
  const exists = await c.query("SELECT 1 FROM restaurants LIMIT 1");
  if (exists.rowCount) return;
  // Al migrar desde SQLite no se deben crear datos de ejemplo.
  if (process.env.NO_SEED === "1") return;

  {
    const r = await c.query<{ id: number }>(
      `INSERT INTO restaurants (slug, name, tagline, logo_url, google_review_url, settings)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [
        "hr-coffee",
        "HR Coffee & Deli",
        "Tu pausa sabe mejor en HR",
        "/brand/logo.png",
        // Reemplazar desde el panel por el enlace directo de reseña del perfil de Google.
        "https://www.google.com/maps/search/?api=1&query=HR+Coffee+%26+Deli+Tijuana",
        JSON.stringify(DEFAULT_SETTINGS),
      ],
    );
    const rid = r.rows[0].id;

    for (let n = 1; n <= 20; n++) {
      await c.query("INSERT INTO tables (restaurant_id, number, area, token) VALUES ($1, $2, $3, $4)", [
        rid, n, n <= 10 ? "Planta baja" : "Rooftop", randomToken(),
      ]);
    }

    const insStaff = "INSERT INTO staff (restaurant_id, username, name, password_hash, role) VALUES ($1, $2, $3, $4, $5)";
    await c.query(insStaff, [rid, "admin", "Administrador", bcrypt.hashSync(process.env.SEED_OWNER_PASSWORD || "hrcoffee2026", 10), "owner"]);
    await c.query(insStaff, [rid, "mesero", "Mesero en turno", bcrypt.hashSync(process.env.SEED_STAFF_PASSWORD || "mesero2026", 10), "staff"]);

    const prizes: [string, number, number | null][] = [
      ["Galleta de la casa", 5, null],
      ["Topping extra gratis", 4, null],
      ["10% de descuento", 3, null],
      ["Café americano gratis", 1, 10],
    ];
    for (const p of prizes) {
      await c.query("INSERT INTO prizes (restaurant_id, name, weight, stock) VALUES ($1, $2, $3, $4)", [rid, ...p]);
    }

    const games: [string, string, number, number, number, string][] = [
      ["Jenga", "Destreza", 1, 8, 15, "Saquen bloques de la torre sin tirarla y pónganlos arriba. Quien la derrumbe pierde. Nervios garantizados."],
      ["UNO", "Cartas", 2, 10, 20, "Descarta tus cartas por color o número y usa las especiales para fastidiar a los demás. ¡No olvides gritar UNO!"],
      ["Lotería", "Tradicional", 2, 10, 30, "El clásico mexicano: un cantor saca cartas y los demás marcan su tabla. Gana quien llene primero el patrón."],
      ["Catan", "Estrategia", 3, 4, 75, "Recolecta recursos, comercia con los demás y construye caminos y pueblos para dominar la isla."],
      ["Dixit", "Creatividad", 3, 8, 30, "Describe una carta ilustrada con una pista ingeniosa: ni muy obvia ni muy difícil. Imaginación pura."],
      ["Código Secreto", "Equipos y palabras", 4, 8, 20, "Dos equipos, un espía maestro por lado: da pistas de una palabra para que tu equipo encuentre a sus agentes."],
      ["Dobble", "Rapidez", 2, 8, 10, "Siempre hay exactamente un símbolo en común entre dos cartas. Encuéntralo antes que nadie."],
      ["Ajedrez", "Estrategia clásica", 2, 2, 30, "El juego de estrategia por excelencia. Acorrala al rey rival con jaque mate."],
    ];
    for (const g of games) {
      await c.query(
        `INSERT INTO board_games (restaurant_id, name, genre, min_players, max_players, minutes, summary)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [rid, ...g],
      );
    }
  }
}
