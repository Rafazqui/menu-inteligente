// Migra TODOS los datos de la base SQLite (data/app.db) a PostgreSQL.
//
// Uso:   npm run db:migrar                 (lee DATABASE_URL de .env.local)
//        npm run db:migrar -- --reemplazar (borra lo que haya en PostgreSQL y migra de nuevo)
//
// - Conserva los mismos IDs, tokens de QR, contraseñas (hash bcrypt) e historial.
// - Copia los archivos de data/uploads a la tabla `files`.
// - Copia la clave de cookies (data/.auth-secret) para que las sesiones abiertas sigan valiendo.
// - Todo ocurre en una sola transacción: si algo falla, PostgreSQL queda como estaba.

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import pg from "pg";
import { ID_TABLES, SCHEMA_LOCK_ID, SCHEMA_SQL } from "../src/lib/schema.ts";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const SQLITE_PATH = process.env.SQLITE_PATH || path.join(DATA_DIR, "app.db");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
const SECRET_FILE = path.join(DATA_DIR, ".auth-secret");
const REPLACE = process.argv.includes("--reemplazar");
const UPLOAD_NAME_RE = /^[a-f0-9]{32}\.(pdf|png|jpg|webp)$/;
const MIME: Record<string, string> = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", webp: "image/webp" };

function die(msg: string): never {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

/** SQLite guarda fechas UTC como "YYYY-MM-DD HH:MM:SS"; PostgreSQL las recibe en ISO con zona. */
function toTimestamp(v: unknown): unknown {
  if (typeof v !== "string" || !v) return v;
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(v) ? v.replace(" ", "T") + "Z" : v;
}

function sniff(buf: Buffer): string | null {
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  return null;
}

// Preferimos la conexión directa (sin pooler): una migración larga funciona mejor así.
const connectionString =
  process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!connectionString) die("Falta DATABASE_URL. Ponla en .env.local (ver README).");
if (!fs.existsSync(SQLITE_PATH)) die(`No encontré la base SQLite en ${SQLITE_PATH}`);

const lite = new Database(SQLITE_PATH, { readonly: true, fileMustExist: true });
const client = new pg.Client({ connectionString });
await client.connect();
console.log(`Origen : ${SQLITE_PATH}`);
console.log(`Destino: PostgreSQL ${client.host}:${client.port}/${client.database}\n`);

try {
  // 1) Esquema (todo dentro de la transacción; el bloqueo se libera solo al terminar)
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock($1)", [SCHEMA_LOCK_ID]);
  await client.query(SCHEMA_SQL);

  // 2) No pisar datos sin permiso
  const has = await client.query("SELECT COUNT(*)::int AS n FROM restaurants");
  if (has.rows[0].n > 0 && !REPLACE) {
    await client.query("ROLLBACK");
    die(
      "PostgreSQL ya tiene datos. Si quieres borrarlos y migrar de nuevo desde SQLite, ejecuta:\n" +
        "    npm run db:migrar -- --reemplazar",
    );
  }

  if (REPLACE) {
    await client.query(
      `TRUNCATE requests, reward_plays, prizes, board_games, table_sessions, staff, tables, files, app_secrets, restaurants
       RESTART IDENTITY CASCADE`,
    );
    console.log("• Datos previos de PostgreSQL borrados (--reemplazar)");
  }

  // 3) Tablas con id (mismo orden que sus dependencias)
  const counts: Record<string, number> = {};
  for (const table of ID_TABLES) {
    const pgCols = (
      await client.query<{ column_name: string }>(
        "SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1",
        [table],
      )
    ).rows.map((r) => r.column_name);
    const liteCols = (lite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
    const cols = liteCols.filter((c) => pgCols.includes(c));
    const rows = lite.prepare(`SELECT ${cols.join(", ")} FROM ${table} ORDER BY id`).all() as Record<string, unknown>[];

    const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
    const sql = `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`;
    for (const row of rows) {
      await client.query(sql, cols.map((c) => (c.endsWith("_at") ? toTimestamp(row[c]) : row[c])));
    }
    // Que los nuevos registros sigan numerándose después del último migrado.
    await client.query(
      `SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 0) + 1, false)`,
    );
    counts[table] = rows.length;
    console.log(`• ${table.padEnd(15)} ${rows.length} registros`);
  }

  // 4) Archivos subidos → tabla files
  const owners = new Map<string, number>();
  for (const r of lite.prepare("SELECT id, menu_file FROM restaurants").all() as { id: number; menu_file: string | null }[]) {
    if (r.menu_file) owners.set(r.menu_file, r.id);
  }
  for (const g of lite.prepare("SELECT restaurant_id, cover_file, back_file FROM board_games").all() as {
    restaurant_id: number; cover_file: string | null; back_file: string | null;
  }[]) {
    if (g.cover_file) owners.set(g.cover_file, g.restaurant_id);
    if (g.back_file) owners.set(g.back_file, g.restaurant_id);
  }
  let files = 0;
  const missing: string[] = [];
  const onDisk = fs.existsSync(UPLOADS_DIR) ? fs.readdirSync(UPLOADS_DIR).filter((n) => UPLOAD_NAME_RE.test(n)) : [];
  for (const name of onDisk) {
    const data = fs.readFileSync(path.join(UPLOADS_DIR, name));
    const ext = sniff(data);
    if (!ext) continue;
    await client.query(
      "INSERT INTO files (name, restaurant_id, mime, size, data) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (name) DO NOTHING",
      [name, owners.get(name) ?? null, MIME[ext], data.length, data],
    );
    files++;
  }
  for (const name of owners.keys()) if (!onDisk.includes(name)) missing.push(name);
  console.log(`• ${"archivos".padEnd(15)} ${files} copiados${missing.length ? ` (⚠ faltan en disco: ${missing.join(", ")})` : ""}`);

  // 5) Clave de cookies
  if (fs.existsSync(SECRET_FILE)) {
    await client.query(
      "INSERT INTO app_secrets (key, value) VALUES ('auth', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
      [fs.readFileSync(SECRET_FILE, "utf8").trim()],
    );
    console.log(`• ${"clave cookies".padEnd(15)} copiada (las sesiones abiertas siguen válidas)`);
  }

  await client.query("COMMIT");

  // 6) Verificación
  console.log("\nVerificando…");
  let okAll = true;
  for (const table of ID_TABLES) {
    const n = (await client.query(`SELECT COUNT(*)::int AS n FROM ${table}`)).rows[0].n;
    const same = n === counts[table];
    okAll &&= same;
    console.log(`  ${same ? "✓" : "✗"} ${table.padEnd(15)} SQLite ${counts[table]}  →  PostgreSQL ${n}`);
  }
  const liteStaff = lite.prepare("SELECT id, username, password_hash FROM staff").all() as {
    id: number; username: string; password_hash: string;
  }[];
  for (const s of liteStaff) {
    const r = await client.query("SELECT password_hash FROM staff WHERE id = $1 AND username = $2", [s.id, s.username]);
    const same = r.rows[0]?.password_hash === s.password_hash;
    okAll &&= same;
    console.log(`  ${same ? "✓" : "✗"} login de "${s.username}" conservado`);
  }
  const liteTokens = lite.prepare("SELECT token FROM tables ORDER BY id").all() as { token: string }[];
  const pgTokens = (await client.query("SELECT token FROM tables ORDER BY id")).rows as { token: string }[];
  const tokensOk = liteTokens.every((t, i) => pgTokens[i]?.token === t.token);
  okAll &&= tokensOk;
  console.log(`  ${tokensOk ? "✓" : "✗"} los ${liteTokens.length} QR impresos siguen funcionando (mismos tokens)`);

  console.log(okAll ? "\n✓ Migración completa. Ya puedes arrancar la app con PostgreSQL.\n" : "\n✗ La verificación encontró diferencias.\n");
  if (!okAll) process.exitCode = 1;
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("\n✗ Error durante la migración. PostgreSQL quedó sin cambios.\n");
  console.error(e);
  process.exitCode = 1;
} finally {
  await client.end();
  lite.close();
}
