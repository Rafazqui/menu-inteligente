"use client";

import { useEffect, useState } from "react";
import { Check, Clock, Dices, Send, Tag, Users, X } from "lucide-react";
import { playersLabel, uploadUrl, type BoardGame } from "@/lib/types";
import { useMesa } from "./MesaProvider";

const GRADIENTS = [
  "linear-gradient(160deg,#ffc72c,#ff8a00)",
  "linear-gradient(160deg,#2f2f36,#0b0b0c)",
  "linear-gradient(160deg,#7cc4ff,#3047c9)",
  "linear-gradient(160deg,#ff8f8f,#b4235a)",
  "linear-gradient(160deg,#5be59a,#0f766e)",
  "linear-gradient(160deg,#c9a2ff,#5b21b6)",
];

function Cover({ game, big = false, bare = false }: { game: BoardGame; big?: boolean; bare?: boolean }) {
  const src = uploadUrl(game.cover_file);
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={game.name} className="size-full object-cover" draggable={false} />;
  }
  const bg = GRADIENTS[game.id % GRADIENTS.length];
  return (
    <div className="relative size-full p-3 flex flex-col justify-end" style={{ background: bg }}>
      <Dices className="absolute right-3 top-3 opacity-30" size={big ? 64 : 28} />
      {!bare && (
        <p className={`font-black uppercase leading-[0.95] tracking-tight drop-shadow ${big ? "text-4xl" : "text-base"}`}>
          {game.name}
        </p>
      )}
    </div>
  );
}

const FILTERS = [
  { label: "Todos", test: () => true },
  { label: "2 jugadores", test: (g: BoardGame) => g.min_players <= 2 && g.max_players >= 2 },
  { label: "3–4", test: (g: BoardGame) => g.min_players <= 4 && g.max_players >= 3 },
  { label: "5 o más", test: (g: BoardGame) => g.max_players >= 5 },
];

export function BoardGameGrid({ games }: { games: BoardGame[] }) {
  const [filter, setFilter] = useState(0);
  const [open, setOpen] = useState<BoardGame | null>(null);
  const list = games.filter(FILTERS[filter].test);

  return (
    <>
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-4">
        {FILTERS.map((f, i) => (
          <button
            key={f.label}
            onClick={() => setFilter(i)}
            className={`shrink-0 rounded-full border px-4 py-1.5 text-sm transition-colors ${
              i === filter ? "border-brand bg-brand text-brand-ink font-semibold" : "border-line text-muted"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <p className="card p-6 text-center text-muted">No hay juegos con ese filtro.</p>
      ) : (
        <ul className="grid grid-cols-3 gap-3">
          {list.map((g, i) => (
            <li key={g.id} className="pop-in" style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}>
              <button
                onClick={() => setOpen(g)}
                className={`group relative block w-full aspect-[2/3] overflow-hidden rounded-2xl border border-line shadow-lg transition-transform active:scale-95 ${
                  g.available ? "" : "opacity-45 grayscale"
                }`}
                aria-label={`Ver ${g.name}`}
              >
                <Cover game={g} />
                <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-md bg-ink/80 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand backdrop-blur">
                  {g.available ? (
                    <>
                      <Users size={11} />
                      {g.min_players === g.max_players ? g.min_players : `${g.min_players}–${g.max_players}`}
                    </>
                  ) : (
                    "En uso"
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && <GameDetail game={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function GameDetail({ game, onClose }: { game: BoardGame; onClose: () => void }) {
  const { state, refresh } = useMesa();
  const [flipped, setFlipped] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const back = uploadUrl(game.back_file);
  const alreadyAsked = state.requests.some(
    (r) => r.board_game_id === game.id && (r.status === "pending" || r.status === "attending"),
  );

  useEffect(() => {
    const t = setTimeout(() => setFlipped(true), 380);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  async function request() {
    setStatus("sending");
    setError(null);
    const res = await fetch("/api/mesa/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "boardgame", boardGameId: game.id }),
    }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    if (!res?.ok) {
      setError(data?.error ?? "Sin conexión. Intenta de nuevo.");
      setStatus("idle");
    } else {
      setStatus("sent");
      refresh();
    }
  }

  const canAsk = state.session.status === "open" && game.available && !alreadyAsked && status === "idle";

  return (
    <div
      className="overlay-in fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={game.name}
    >
      <button
        className="absolute right-4 top-[max(env(safe-area-inset-top),1rem)] grid size-11 place-items-center rounded-full bg-surface-2 border border-line"
        onClick={onClose}
        aria-label="Cerrar"
      >
        <X />
      </button>

      <div
        className="flip-scene grow-in"
        style={{ height: "min(76dvh, 600px)", width: "min(92vw, calc(min(76dvh, 600px) * 0.68))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`flip-card size-full ${flipped ? "flipped" : ""}`}>
          <div className="flip-face border border-line shadow-2xl">
            <Cover game={game} big />
          </div>

          <div className="flip-face flip-back flex flex-col border border-brand/40 bg-surface shadow-2xl">
            <div className="relative h-[42%] shrink-0 overflow-hidden">
              {back ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={back} alt={`Contraportada de ${game.name}`} className="size-full object-cover" />
              ) : (
                <div className="size-full opacity-60">
                  <Cover game={game} big bare />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/30 to-transparent" />
              <h2 className="absolute bottom-2 left-4 right-4 text-2xl font-bold leading-tight">{game.name}</h2>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-3 p-4 pt-2">
              <div className="flex flex-wrap gap-2 text-xs">
                <Chip icon={<Users size={14} />}>{playersLabel(game.min_players, game.max_players)}</Chip>
                {game.genre && <Chip icon={<Tag size={14} />}>{game.genre}</Chip>}
                <Chip icon={<Clock size={14} />}>~{game.minutes} min</Chip>
              </div>
              <p className="no-scrollbar min-h-0 flex-1 overflow-y-auto text-sm leading-relaxed text-cream/85">
                {game.summary || "Pregúntale a tu mesero cómo se juega."}
              </p>

              {status === "sent" || alreadyAsked ? (
                <div className="flex items-center justify-center gap-2 rounded-2xl bg-ok/15 py-3.5 font-semibold text-ok">
                  <Check size={20} /> ¡Pedido! Tu mesero te lo lleva
                </div>
              ) : (
                <button onClick={request} disabled={!canAsk} className="btn-brand flex items-center justify-center gap-2 py-3.5 text-base">
                  <Send size={18} />
                  {status === "sending" ? "Enviando…" : "Solicitar a tu mesero"}
                </button>
              )}
              {error && <p className="text-center text-xs text-danger">{error}</p>}
              {!game.available && <p className="text-center text-xs text-muted">Este juego está en uso ahora mismo.</p>}
              {game.available && state.session.status !== "open" && (
                <p className="text-center text-xs text-muted">Podrás pedirlo cuando tu mesa esté activa.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Chip({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/12 px-2.5 py-1 font-medium text-brand">
      {icon}
      {children}
    </span>
  );
}
