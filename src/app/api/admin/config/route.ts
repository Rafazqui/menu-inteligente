import { requireStaff } from "@/lib/admin";
import { exec, q } from "@/lib/db";
import { emit } from "@/lib/events";
import { fail, ok, readJson } from "@/lib/http";
import { getRestaurant } from "@/lib/repo";
import { parseSettings, type RestaurantSettings, type RewardGame } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Todo lo configurable del negocio, para la pantalla de configuración. */
export async function GET() {
  const user = await requireStaff(null, "owner");
  if (user instanceof Response) return user;
  const rid = user.restaurant_id;
  const [r, prizes, boardGames, tables, staff] = await Promise.all([
    getRestaurant(rid),
    q("SELECT id, name, weight, stock, active FROM prizes WHERE restaurant_id = $1 ORDER BY id", [rid]),
    q("SELECT * FROM board_games WHERE restaurant_id = $1 ORDER BY lower(name)", [rid]),
    q("SELECT id, number, area, token, active FROM tables WHERE restaurant_id = $1 ORDER BY number", [rid]),
    q("SELECT id, username, name, role, active FROM staff WHERE restaurant_id = $1 ORDER BY role, name", [rid]),
  ]);
  return ok({
    me: { id: user.id },
    business: {
      name: r!.name,
      tagline: r!.tagline,
      googleReviewUrl: r!.google_review_url,
      menuFile: r!.menu_file,
      settings: parseSettings(r!.settings),
    },
    prizes,
    boardGames,
    tables,
    staff,
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

  const current = (await getRestaurant(user.restaurant_id))!;
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
  const legalIn = s.legal ?? prev.legal;
  const legal = {
    owner: String(legalIn.owner ?? "").trim().slice(0, 120),
    address: String(legalIn.address ?? "").trim().slice(0, 200),
    email: String(legalIn.email ?? "").trim().slice(0, 120),
  };
  if (legal.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(legal.email)) {
    return fail(400, "El correo de contacto no parece válido.");
  }

  const settings: RestaurantSettings = {
    games,
    requireApproval: s.requireApproval === undefined ? prev.requireApproval : Boolean(s.requireApproval),
    waiterCooldownSec: clamp(s.waiterCooldownSec, 15, 600, prev.waiterCooldownSec),
    sessionMaxHours: clamp(s.sessionMaxHours, 1, 24, prev.sessionMaxHours),
    legal,
  };

  await exec(
    "UPDATE restaurants SET name = $1, tagline = $2, google_review_url = $3, settings = $4 WHERE id = $5",
    [name, tagline, review, JSON.stringify(settings), user.restaurant_id],
  );
  emit(user.restaurant_id, "config");
  return ok();
}
