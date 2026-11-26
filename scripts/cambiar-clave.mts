// Genera una contraseña nueva y segura para un usuario del panel (por si se olvidó).
//
// Uso:  npm run usuario:clave -- admin
//
// Usa la base de .env.local. Para la de producción, define antes DATABASE_URL_DIRECT:
//   $env:DATABASE_URL_DIRECT="postgresql://..."; npm run usuario:clave -- admin

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import pg from "pg";

const username = (process.argv[2] ?? "").trim().toLowerCase();
if (!username) {
  console.error("\nUso: npm run usuario:clave -- <usuario>   (ej. npm run usuario:clave -- admin)\n");
  process.exit(1);
}
const connectionString =
  process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("\nFalta DATABASE_URL. Ponla en .env.local (o define DATABASE_URL_DIRECT).\n");
  process.exit(1);
}

// Mismo alfabeto que la app: sin caracteres que se confundan (0/O, 1/l/I).
const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const password = Array.from({ length: 14 }, () => alphabet[crypto.randomInt(alphabet.length)]).join("");

const client = new pg.Client({ connectionString });
await client.connect();
try {
  const r = await client.query("UPDATE staff SET password_hash = $1 WHERE username = $2 RETURNING name, active", [
    await bcrypt.hash(password, 10),
    username,
  ]);
  if (r.rowCount === 0) {
    const users = await client.query("SELECT username FROM staff ORDER BY username");
    console.error(`\n✗ No existe el usuario "${username}". Usuarios: ${users.rows.map((u) => u.username).join(", ")}\n`);
    process.exitCode = 1;
  } else {
    console.log(`\n✓ Nueva contraseña para "${username}" (${r.rows[0].name}):\n\n    ${password}\n`);
    if (!r.rows[0].active) console.log("  Ojo: este usuario está DESACTIVADO; actívalo en Configuración → Personal.\n");
    console.log("  Guárdala en un lugar seguro. Puedes cambiarla después en Configuración → Personal.\n");
  }
} finally {
  await client.end();
}
