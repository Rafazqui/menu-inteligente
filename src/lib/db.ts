import "server-only";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { DEFAULT_SETTINGS } from "./types";

export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
export const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

declare global {
  var __mesaDb: Database.Database | undefined;
}

export function db(): Database.Database {
  if (!globalThis.__mesaDb) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    const d = new Database(path.join(DATA_DIR, "app.db"));
    d.pragma("journal_mode = WAL");
    d.pragma("foreign_keys = ON");
    d.pragma("busy_timeout = 5000");
    migrate(d);
    seed(d);
    globalThis.__mesaDb = d;
  }
  return globalThis.__mesaDb;
}

/** Token aleatorio para las URLs de los QR (no adivinable, a diferencia del número de mesa). */
export function randomToken(len = 12): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[crypto.randomInt(alphabet.length)];
  return out;
}

function migrate(d: Database.Database) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS restaurants (
      id INTEGER PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      tagline TEXT NOT NULL DEFAULT '',
      logo_url TEXT NOT NULL DEFAULT '',
      google_review_url TEXT NOT NULL DEFAULT '',
      menu_file TEXT,
      settings TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tables (
      id INTEGER PRIMARY KEY,
      restaurant_id INTEGER NOT NULL REFERENCES restaurants(id),
      number INTEGER NOT NULL,
      area TEXT NOT NULL DEFAULT '',
      token TEXT UNIQUE NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      UNIQUE (restaurant_id, number)
    );

    CREATE TABLE IF NOT EXISTS table_sessions (
      id INTEGER PRIMARY KEY,
      restaurant_id INTEGER NOT NULL REFERENCES restaurants(id),
      table_id INTEGER NOT NULL REFERENCES tables(id),
      status TEXT NOT NULL CHECK (status IN ('pending','open','closed')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      opened_at TEXT,
      closed_at TEXT,
      reward_used INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_table ON table_sessions(table_id, status);

    CREATE TABLE IF NOT EXISTS staff (
      id INTEGER PRIMARY KEY,
      restaurant_id INTEGER NOT NULL REFERENCES restaurants(id),
      username TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('owner','staff')),
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS board_games (
      id INTEGER PRIMARY KEY,
      restaurant_id INTEGER NOT NULL REFERENCES restaurants(id),
      name TEXT NOT NULL,
      genre TEXT NOT NULL DEFAULT '',
      min_players INTEGER NOT NULL DEFAULT 2,
      max_players INTEGER NOT NULL DEFAULT 4,
      minutes INTEGER NOT NULL DEFAULT 30,
      summary TEXT NOT NULL DEFAULT '',
      cover_file TEXT,
      back_file TEXT,
      available INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS prizes (
      id INTEGER PRIMARY KEY,
      restaurant_id INTEGER NOT NULL REFERENCES restaurants(id),
      name TEXT NOT NULL,
      weight INTEGER NOT NULL DEFAULT 1,
      stock INTEGER,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS reward_plays (
      id INTEGER PRIMARY KEY,
      restaurant_id INTEGER NOT NULL REFERENCES restaurants(id),
      session_id INTEGER NOT NULL REFERENCES table_sessions(id),
      table_id INTEGER NOT NULL REFERENCES tables(id),
      game TEXT NOT NULL CHECK (game IN ('ruleta','rasca','gato')),
      status TEXT NOT NULL CHECK (status IN ('playing','won','lost')),
      state TEXT,
      prize_id INTEGER,
      prize_name TEXT,
      code TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      finished_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_plays_session ON reward_plays(session_id);

    CREATE TABLE IF NOT EXISTS requests (
      id INTEGER PRIMARY KEY,
      restaurant_id INTEGER NOT NULL REFERENCES restaurants(id),
      table_id INTEGER NOT NULL REFERENCES tables(id),
      session_id INTEGER NOT NULL REFERENCES table_sessions(id),
      type TEXT NOT NULL CHECK (type IN ('waiter','boardgame','prize')),
      message TEXT,
      board_game_id INTEGER,
      reward_play_id INTEGER,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','attending','done','cancelled')),
      handled_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_requests_rest ON requests(restaurant_id, status);
  `);
}

function seed(d: Database.Database) {
  const exists = d.prepare("SELECT id FROM restaurants LIMIT 1").get();
  if (exists) return;

  const tx = d.transaction(() => {
    const r = d
      .prepare(
        `INSERT INTO restaurants (slug, name, tagline, logo_url, google_review_url, settings)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "hr-coffee",
        "HR Coffee & Deli",
        "Tu pausa sabe mejor en HR",
        "/brand/logo.png",
        // Reemplazar desde el panel por el enlace directo de reseña del perfil de Google.
        "https://www.google.com/maps/search/?api=1&query=HR+Coffee+%26+Deli+Tijuana",
        JSON.stringify(DEFAULT_SETTINGS),
      );
    const rid = Number(r.lastInsertRowid);

    const insTable = d.prepare(
      "INSERT INTO tables (restaurant_id, number, area, token) VALUES (?, ?, ?, ?)",
    );
    for (let n = 1; n <= 20; n++) {
      insTable.run(rid, n, n <= 10 ? "Planta baja" : "Rooftop", randomToken());
    }

    const insStaff = d.prepare(
      "INSERT INTO staff (restaurant_id, username, name, password_hash, role) VALUES (?, ?, ?, ?, ?)",
    );
    insStaff.run(
      rid,
      "admin",
      "Administrador",
      bcrypt.hashSync(process.env.SEED_OWNER_PASSWORD || "hrcoffee2026", 10),
      "owner",
    );
    insStaff.run(
      rid,
      "mesero",
      "Mesero en turno",
      bcrypt.hashSync(process.env.SEED_STAFF_PASSWORD || "mesero2026", 10),
      "staff",
    );

    const insPrize = d.prepare(
      "INSERT INTO prizes (restaurant_id, name, weight, stock) VALUES (?, ?, ?, ?)",
    );
    insPrize.run(rid, "Galleta de la casa", 5, null);
    insPrize.run(rid, "Topping extra gratis", 4, null);
    insPrize.run(rid, "10% de descuento", 3, null);
    insPrize.run(rid, "Café americano gratis", 1, 10);

    const insGame = d.prepare(
      `INSERT INTO board_games (restaurant_id, name, genre, min_players, max_players, minutes, summary)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
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
    for (const g of games) insGame.run(rid, ...g);
  });
  tx();
}
