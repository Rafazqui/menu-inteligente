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
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export type SessionStatus = "pending" | "open" | "closed";
export type RequestType = "waiter" | "boardgame" | "prize";
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
}

export interface MesaRequest {
  id: number;
  type: RequestType;
  status: RequestStatus;
  message: string | null;
  board_game_id: number | null;
  game_name: string | null;
  created_at: string;
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
}

export function uploadUrl(file: string | null | undefined): string | null {
  return file ? `/api/uploads/${file}` : null;
}

export function playersLabel(min: number, max: number): string {
  if (min === max) return `${min} jugador${min === 1 ? "" : "es"}`;
  return `${min}–${max} jugadores`;
}
