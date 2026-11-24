import type { MesaRequest, RequestStatus } from "@/lib/types";

const LABEL: Record<RequestStatus, string> = {
  pending: "Enviado",
  attending: "Va en camino",
  done: "Atendido",
  cancelled: "Cancelado",
};

const STYLE: Record<RequestStatus, string> = {
  pending: "bg-brand/15 text-brand",
  attending: "bg-ok/15 text-ok",
  done: "bg-surface-2 text-muted",
  cancelled: "bg-surface-2 text-muted line-through",
};

export function StatusChip({ status }: { status: RequestStatus }) {
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${STYLE[status]}`}>
      {LABEL[status]}
    </span>
  );
}

/** "hace 3 min" a partir de una fecha ISO (PostgreSQL) o "YYYY-MM-DD HH:MM:SS" UTC. */
export function timeAgo(when: string): string {
  const t = new Date(when.includes("T") ? when : when.replace(" ", "T") + "Z").getTime();
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return "justo ahora";
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  return `hace ${Math.round(m / 60)} h`;
}

export function describeRequest(r: MesaRequest): string {
  if (r.type === "boardgame") return `Juego: ${r.game_name ?? "juego de mesa"}`;
  if (r.type === "prize") return `Premio: ${r.message ?? ""}`;
  return r.message ? `“${r.message}”` : "Llamada al mesero";
}
