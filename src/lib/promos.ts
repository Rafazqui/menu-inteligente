import "server-only";
import { q } from "./db";
import { promoPricing, uploadUrl, type PublicPromo } from "./types";

export interface PromoRow {
  id: number;
  restaurant_id: number;
  title: string;
  description: string;
  price_cents: number | null;
  discount_type: "none" | "percent" | "amount";
  discount_value: number;
  image_file: string | null;
  active: number;
  ends_at: string | null;
  sort: number;
  updated_at: string;
}

export function toPublicPromo(p: PromoRow): PublicPromo {
  const { finalCents, badge } = promoPricing(p.price_cents, p.discount_type, p.discount_value);
  return {
    id: p.id,
    title: p.title,
    description: p.description,
    priceCents: p.price_cents,
    finalCents,
    badge,
    imageUrl: uploadUrl(p.image_file),
    endsAt: p.ends_at,
  };
}

/** Recomendaciones visibles para los clientes: activas y no vencidas, en el orden elegido. */
export async function activePromos(restaurantId: number): Promise<PublicPromo[]> {
  const rows = await q<PromoRow>(
    `SELECT * FROM promotions
     WHERE restaurant_id = $1 AND active = 1 AND (ends_at IS NULL OR ends_at > now())
     ORDER BY sort, id`,
    [restaurantId],
  );
  return rows.map(toPublicPromo);
}
