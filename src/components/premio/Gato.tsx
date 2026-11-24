"use client";

import { useState } from "react";
import { Bot, Circle, X as XIcon } from "lucide-react";
import { RewardOutcome } from "./Result";

type Cell = "" | "X" | "O";
interface GatoView {
  board: Cell[];
  status: "playing" | "won" | "lost";
  result: "X" | "O" | "draw" | null;
  line: number[] | null;
  prizeName: string | null;
  code: string | null;
}

export function Gato({ initial, onDone }: { initial: GatoView | null; onDone: () => void }) {
  const [game, setGame] = useState<GatoView | null>(initial);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(body: object): Promise<GatoView | null> {
    const res = await fetch("/api/mesa/gato", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (!res?.ok || !data?.game) {
      setError(data?.error ?? "Sin conexión. Intenta de nuevo.");
      return null;
    }
    return data.game as GatoView;
  }

  async function start() {
    setThinking(true);
    setError(null);
    const g = await post({ action: "start" });
    setThinking(false);
    if (g) {
      setGame(g);
      onDone();
    }
  }

  async function play(i: number) {
    if (!game || game.status !== "playing" || game.board[i] || thinking) return;
    setError(null);
    setThinking(true);
    const optimistic = [...game.board];
    optimistic[i] = "X";
    setGame({ ...game, board: optimistic });
    const [g] = await Promise.all([post({ action: "move", cell: i }), new Promise((r) => setTimeout(r, 450))]);
    setThinking(false);
    if (g) {
      setGame(g);
      if (g.status !== "playing") onDone();
    } else {
      setGame(game);
    }
  }

  if (!game) {
    return (
      <div className="space-y-4">
        <div className="card p-6 text-center">
          <Bot size={48} className="mx-auto text-brand" />
          <p className="mt-3 text-lg font-semibold">Reta a la máquina</p>
          <p className="mt-1 text-sm text-muted">
            Tú eres <b className="text-brand">X</b> y empiezas. Si le ganas, te llevas premio. ¿Podrás?
          </p>
        </div>
        <button onClick={start} disabled={thinking} className="btn-brand w-full py-4 text-lg">
          {thinking ? "Preparando…" : "Empezar partida"}
        </button>
        {error && <p className="text-center text-sm text-danger">{error}</p>}
      </div>
    );
  }

  const over = game.status !== "playing";
  const headline = !over
    ? thinking
      ? "La máquina está pensando…"
      : "Tu turno"
    : game.result === "X"
      ? "¡Le ganaste a la máquina!"
      : game.result === "draw"
        ? "¡Empate! La máquina es dura de vencer"
        : "Ganó la máquina esta vez";

  return (
    <div className="space-y-6">
      <p className="text-center text-lg font-semibold" aria-live="polite">
        {headline}
      </p>
      <div className="mx-auto grid w-[min(86vw,340px)] grid-cols-3 gap-2.5">
        {game.board.map((c, i) => {
          const inLine = game.line?.includes(i);
          return (
            <button
              key={i}
              onClick={() => play(i)}
              disabled={over || !!c || thinking}
              aria-label={`Casilla ${i + 1}${c ? `: ${c}` : ""}`}
              className={`grid aspect-square place-items-center rounded-2xl border transition-colors ${
                inLine
                  ? game.result === "X"
                    ? "border-brand bg-brand/20"
                    : "border-danger/60 bg-danger/10"
                  : "border-line bg-surface"
              } ${!c && !over && !thinking ? "active:bg-surface-2" : ""}`}
            >
              {c === "X" && <XIcon size={56} strokeWidth={3} className="grow-in text-brand" />}
              {c === "O" && <Circle size={46} strokeWidth={3} className="grow-in text-cream" />}
            </button>
          );
        })}
      </div>
      {error && <p className="text-center text-sm text-danger">{error}</p>}
      {over && <RewardOutcome won={game.status === "won"} prizeName={game.prizeName} code={game.code} />}
    </div>
  );
}
