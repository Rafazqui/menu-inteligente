"use client";

import { useEffect, useRef, useState } from "react";
import { Bomb, Flag, Pickaxe, RotateCcw, Timer } from "lucide-react";

const COLS = 8;
const ROWS = 10;
const MINES = 12;

interface Cell {
  mine: boolean;
  open: boolean;
  flag: boolean;
  n: number;
}

const NUM_COLORS = ["", "#7cc4ff", "#5be59a", "#ff8f8f", "#c9a2ff", "#ffb703", "#5eead4", "#f7f4ec", "#a5a5ad"];

function neighbors(i: number): number[] {
  const r = Math.floor(i / COLS);
  const c = i % COLS;
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const rr = r + dr;
      const cc = c + dc;
      if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS) out.push(rr * COLS + cc);
    }
  return out;
}

const empty = (): Cell[] => Array.from({ length: COLS * ROWS }, () => ({ mine: false, open: false, flag: false, n: 0 }));

/** Las minas se colocan después del primer toque, así nunca pierdes al inicio. */
function plant(first: number): Cell[] {
  const safe = new Set([first, ...neighbors(first)]);
  const b = empty();
  let placed = 0;
  while (placed < MINES) {
    const i = Math.floor(Math.random() * b.length);
    if (safe.has(i) || b[i].mine) continue;
    b[i].mine = true;
    placed++;
  }
  b.forEach((c, i) => (c.n = neighbors(i).filter((j) => b[j].mine).length));
  return b;
}

export function Buscaminas() {
  const [cells, setCells] = useState<Cell[]>(empty);
  const [started, setStarted] = useState(false);
  const [state, setState] = useState<"playing" | "won" | "lost">("playing");
  const [flagMode, setFlagMode] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const press = useRef<{ t: ReturnType<typeof setTimeout> | null; long: boolean }>({ t: null, long: false });

  useEffect(() => {
    if (!started || state !== "playing") return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [started, state]);

  function reset() {
    setCells(empty());
    setStarted(false);
    setState("playing");
    setSeconds(0);
  }

  function reveal(i: number) {
    if (state !== "playing") return;
    let b = cells.map((c) => ({ ...c }));
    if (!started) {
      b = plant(i);
      setStarted(true);
    }
    if (b[i].flag || b[i].open) return;
    if (b[i].mine) {
      b.forEach((c) => c.mine && (c.open = true));
      setCells(b);
      setState("lost");
      navigator.vibrate?.(200);
      return;
    }
    const stack = [i];
    while (stack.length) {
      const k = stack.pop()!;
      if (b[k].open || b[k].flag) continue;
      b[k].open = true;
      if (b[k].n === 0) stack.push(...neighbors(k).filter((j) => !b[j].open));
    }
    setCells(b);
    if (b.every((c) => c.mine || c.open)) setState("won");
  }

  function toggleFlag(i: number) {
    if (state !== "playing" || cells[i].open) return;
    const b = cells.map((c) => ({ ...c }));
    b[i].flag = !b[i].flag;
    setCells(b);
    navigator.vibrate?.(15);
  }

  const flags = cells.filter((c) => c.flag).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-sm">
          <Bomb size={16} className="text-brand" /> {MINES - flags}
        </span>
        <span className="text-sm font-semibold">
          {state === "won" ? "¡Ganaste! 🎉" : state === "lost" ? "¡Boom! 💥" : "Encuentra las minas"}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-sm tabular-nums">
          <Timer size={16} className="text-brand" /> {seconds}s
        </span>
      </div>

      <div
        className="grid gap-1 rounded-2xl border border-line bg-surface p-2 select-none"
        style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {cells.map((c, i) => (
          <button
            key={i}
            className={`grid aspect-square place-items-center rounded-md text-base font-bold transition-colors ${
              c.open
                ? c.mine
                  ? "bg-danger/30"
                  : "bg-ink"
                : "bg-surface-2 active:bg-line border-b-2 border-black/40"
            }`}
            style={{ color: c.open ? NUM_COLORS[c.n] : undefined }}
            onPointerDown={() => {
              press.current.long = false;
              press.current.t = setTimeout(() => {
                press.current.long = true;
                toggleFlag(i);
              }, 420);
            }}
            onPointerUp={() => {
              if (press.current.t) clearTimeout(press.current.t);
              if (press.current.long) return;
              if (flagMode) toggleFlag(i);
              else reveal(i);
            }}
            onPointerLeave={() => press.current.t && clearTimeout(press.current.t)}
            aria-label={`Casilla ${i + 1}`}
          >
            {c.open ? (c.mine ? <Bomb size={18} className="text-danger" /> : c.n || "") : c.flag ? <Flag size={16} className="text-brand" /> : ""}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => setFlagMode((f) => !f)}
          className={`flex items-center justify-center gap-2 py-3 ${flagMode ? "btn-brand" : "btn-ghost"}`}
        >
          {flagMode ? <Flag size={18} /> : <Pickaxe size={18} />}
          {flagMode ? "Modo bandera" : "Modo excavar"}
        </button>
        <button onClick={reset} className="btn-ghost flex items-center justify-center gap-2 py-3">
          <RotateCcw size={18} /> Nueva partida
        </button>
      </div>
      <p className="text-center text-xs text-muted">Tip: mantén presionada una casilla para poner bandera.</p>
    </div>
  );
}
