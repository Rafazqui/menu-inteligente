// PostgreSQL local para desarrollo, sin instalar nada en Windows ni crear cuentas.
//
// Uso:  npm run db:local     (deja esta terminal abierta; Ctrl + C para apagarlo)
//
// - Guarda los datos en data/postgres (no se sube a git).
// - Escucha solo en tu computadora (localhost:5433).
// - Si no existe .env.local, lo crea apuntando a esta base.
// Para producción usa una base en la nube (Neon, Railway…) cambiando DATABASE_URL.

import fs from "node:fs";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const PORT = Number(process.env.DB_LOCAL_PORT) || 5433;
const USER = "postgres";
const PASSWORD = "local_dev";
const DATABASE = "menu_inteligente";
const DIR = path.join(process.cwd(), "data", "postgres");
const URL = `postgresql://${USER}:${PASSWORD}@localhost:${PORT}/${DATABASE}`;
const ENV_FILE = path.join(process.cwd(), ".env.local");

const pg = new EmbeddedPostgres({
  databaseDir: DIR,
  user: USER,
  password: PASSWORD,
  port: PORT,
  persistent: true,
  onLog: () => {},
  onError: (e) => console.error(String(e).trim()),
});

const firstTime = !fs.existsSync(path.join(DIR, "PG_VERSION"));
if (firstTime) {
  fs.mkdirSync(path.dirname(DIR), { recursive: true });
  console.log("Creando la base local por primera vez (puede tardar unos segundos)…");
  await pg.initialise();
}
await pg.start();
try {
  await pg.createDatabase(DATABASE);
} catch {
  // ya existía
}

if (!fs.existsSync(ENV_FILE)) {
  fs.writeFileSync(ENV_FILE, `# Base PostgreSQL local (npm run db:local)\nDATABASE_URL=${URL}\n`);
  console.log("Se creó .env.local apuntando a la base local.");
} else if (!fs.readFileSync(ENV_FILE, "utf8").includes("DATABASE_URL")) {
  fs.appendFileSync(ENV_FILE, `\n# Base PostgreSQL local (npm run db:local)\nDATABASE_URL=${URL}\n`);
  console.log("Se agregó DATABASE_URL a tu .env.local.");
}

console.log(`\n✓ PostgreSQL local listo en ${URL}`);
console.log("  Deja esta terminal abierta y en otra ejecuta:  npm run dev");
console.log("  (Para apagarlo: Ctrl + C)\n");

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  console.log("\nApagando PostgreSQL local…");
  await pg.stop().catch(() => {});
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 1 << 30);
