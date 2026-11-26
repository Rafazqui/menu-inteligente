// Tipos y valores compartidos entre servidor y cliente (sin dependencias de Node).

export type RewardGame = "ruleta" | "rasca" | "gato";

export interface GameSetting {
  enabled: boolean;
  /** Probabilidad de ganar, 0–100. En el gato es la probabilidad de que la IA "se deje ganar". */
  winChance: number;
}

export interface RestaurantSettings {
  games: Record<RewardGame, GameSetting>;
  /** Si es true, el mesero debe aprobar la mesa antes de que pueda llamar, pedir juegos o jugar el premio. */
  requireApproval: boolean;
  /** Segundos mínimos entre llamadas al mesero desde la misma mesa. */
  waiterCooldownSec: number;
  /** Horas tras las cuales una mesa abierta se cierra sola. */
  sessionMaxHours: number;
  /** Datos del responsable para los términos de la promoción y el aviso de privacidad. */
  legal: LegalInfo;
}

export interface LegalInfo {
  /** Nombre de la persona o razón social responsable del negocio. */
  owner: string;
  address: string;
  email: string;
}

export const DEFAULT_SETTINGS: RestaurantSettings = {
  games: {
    ruleta: { enabled: true, winChance: 35 },
    rasca: { enabled: true, winChance: 30 },
    gato: { enabled: true, winChance: 15 },
  },
  requireApproval: true,
  waiterCooldownSec: 60,
  sessionMaxHours: 6,
  legal: { owner: "", address: "", email: "" },
};

export function parseSettings(raw: string | null | undefined): RestaurantSettings {
  try {
    const s = JSON.parse(raw || "{}");
    return {
      ...DEFAULT_SETTINGS,
      ...s,
      games: {
        ruleta: { ...DEFAULT_SETTINGS.games.ruleta, ...s.games?.ruleta },
        rasca: { ...DEFAULT_SETTINGS.games.rasca, ...s.games?.rasca },
        gato: { ...DEFAULT_SETTINGS.games.gato, ...s.games?.gato },
      },
      legal: { ...DEFAULT_SETTINGS.legal, ...s.legal },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export type SessionStatus = "pending" | "open" | "closed";
export type RequestType = "waiter" | "boardgame" | "prize" | "bill" | "promo";
export type PaymentMethod = "efectivo" | "tarjeta";

export const PAYMENT_LABEL: Record<PaymentMethod, string> = { efectivo: "efectivo", tarjeta: "tarjeta" };
export type RequestStatus = "pending" | "attending" | "done" | "cancelled";

export interface BoardGame {
  id: number;
  name: string;
  genre: string;
  min_players: number;
  max_players: number;
  minutes: number;
  summary: string;
  cover_file: string | null;
  back_file: string | null;
  available: number;
  /** 1 si alguna mesa lo tiene prestado ahora mismo. */
  in_use?: number;
  /** 1 si lo tiene prestado la mesa que está viendo la ludoteca. */
  mine?: number;
}

export interface MesaRequest {
  id: number;
  type: RequestType;
  status: RequestStatus;
  message: string | null;
  board_game_id: number | null;
  game_name: string | null;
  payment_method: PaymentMethod | null;
  promo_id: number | null;
  created_at: string;
}

/** Recomendación tal como la ve el cliente (sin datos internos). */
export interface PublicPromo {
  id: number;
  title: string;
  description: string;
  /** Precio normal en centavos (null = sin precio). */
  priceCents: number | null;
  /** Precio con descuento en centavos (null si no hay precio o descuento). */
  finalCents: number | null;
  /** Texto de la etiqueta: "-20%" o "-$15", o null sin descuento. */
  badge: string | null;
  imageUrl: string | null;
  endsAt: string | null;
}

export function formatMoney(cents: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: cents % 100 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/** Calcula precio final y etiqueta de descuento de una recomendación. */
export function promoPricing(
  priceCents: number | null,
  type: "none" | "percent" | "amount",
  value: number,
): { finalCents: number | null; badge: string | null } {
  if (type === "percent" && value > 0) {
    return {
      finalCents: priceCents === null ? null : Math.round((priceCents * (100 - value)) / 100),
      badge: `-${value}%`,
    };
  }
  if (type === "amount" && value > 0) {
    return {
      finalCents: priceCents === null ? null : Math.max(0, priceCents - value),
      badge: `-${formatMoney(value)}`,
    };
  }
  return { finalCents: null, badge: null };
}

export interface RewardResult {
  game: RewardGame;
  status: "playing" | "won" | "lost";
  prizeName: string | null;
  code: string | null;
}

/** Estado que la app de la mesa consulta periódicamente. */
export interface MesaState {
  restaurant: { name: string; tagline: string; logoUrl: string; reviewUrl: string; hasMenu: boolean };
  table: { number: number; area: string };
  session: { status: SessionStatus };
  reward: {
    available: boolean;
    games: RewardGame[];
    last: RewardResult | null;
  };
  requests: MesaRequest[];
  waiterCooldownSec: number;
  promos: PublicPromo[];
}

export function uploadUrl(file: string | null | undefined): string | null {
  return file ? `/api/uploads/${file}` : null;
}

export function playersLabel(min: number, max: number): string {
  if (min === max) return `${min} jugador${min === 1 ? "" : "es"}`;
  return `${min}–${max} jugadores`;
}
