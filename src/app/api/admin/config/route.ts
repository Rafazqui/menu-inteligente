import { requireStaff } from "@/lib/admin";
import { db } from "@/lib/db";
import { emit } from "@/lib/events";
import { fail, ok, readJson } from "@/lib/http";
import { getRestaurant } from "@/lib/repo";
import { parseSettings, type RestaurantSettings, type RewardGame } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Todo lo configurable del negocio, para la pantalla de configuración. */
export async function GET() {
  const user = await requireStaff(null, "owner");
  if (user instanceof Response) return user;
  const d = db();
  const rid = user.restaurant_id;
  const r = getRestaurant(rid)!;
  return ok({
    me: { id: user.id },
    business: {
      name: r.name,
      tagline: r.tagline,
      googleReviewUrl: r.google_review_url,
      menuFile: r.menu_file,
      settings: parseSettings(r.settings),
    },
    prizes: d.prepare("SELECT id, name, weight, stock, active FROM prizes WHERE restaurant_id = ? ORDER BY id").all(rid),
    boardGames: d.prepare("SELECT * FROM board_games WHERE restaurant_id = ? ORDER BY name COLLATE NOCASE").all(rid),
    tables: d.prepare("SELECT id, number, area, token, active FROM tables WHERE restaurant_id = ? ORDER BY number").all(rid),
    staff: d.prepare("SELECT id, username, name, role, active FROM staff WHERE restaurant_id = ? ORDER BY role, name").all(rid),
  });
}

const clamp = (v: unknown, min: number, max: number, def: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};

/** Guarda datos del negocio y la configuración de juegos/probabilidades. */
export async function POST(req: Request) {
  const user = await requireStaff(req, "owner");
  if (user instanceof Response) return user;
  const body = await readJson<{
    name?: string;
    tagline?: string;
    googleReviewUrl?: string;
    settings?: Partial<RestaurantSettings>;
  }>(req);
  if (!body) return fail(400, "Solicitud inválida.");

  const current = getRestaurant(user.restaurant_id)!;
  const prev = parseSettings(current.settings);

  const name = (body.name ?? current.name).toString().trim().slice(0, 60);
  if (!name) return fail(400, "El nombre no puede ir vacío.");
  const tagline = (body.tagline ?? current.tagline).toString().trim().slice(0, 80);

  const review = (body.googleReviewUrl ?? current.google_review_url).toString().trim();
  if (review) {
    try {
      if (new URL(review).protocol !== "https:") throw new Error();
    } catch {
      return fail(400, "El enlace de reseñas debe empezar con https://");
    }
  }

  const s = body.settings ?? {};
  const games = { ...prev.games };
  for (const g of ["ruleta", "rasca", "gato"] as RewardGame[]) {
    const incoming = s.games?.[g];
    if (incoming) {
      games[g] = {
        enabled: Boolean(incoming.enabled),
        winChance: clamp(incoming.winChance, 0, 100, prev.games[g].winChance),
      };
    }
  }
  const settings: RestaurantSettings = {
    games,
    requireApproval: s.requireApproval === undefined ? prev.requireApproval : Boolean(s.requireApproval),
    waiterCooldownSec: clamp(s.waiterCooldownSec, 15, 600, prev.waiterCooldownSec),
    sessionMaxHours: clamp(s.sessionMaxHours, 1, 24, prev.sessionMaxHours),
  };

  db()
    .prepare("UPDATE restaurants SET name = ?, tagline = ?, google_review_url = ?, settings = ? WHERE id = ?")
    .run(name, tagline, review, JSON.stringify(settings), user.restaurant_id);
  emit(user.restaurant_id, "config");
  return ok();
}
