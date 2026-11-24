"use client";

import { Coffee, PartyPopper } from "lucide-react";

const COLORS = ["#ffc72c", "#ffffff", "#ffb703", "#f7f4ec", "#7cc4ff", "#ff8f8f"];

/** Pseudoaleatorio determinista (mismo resultado en cada render). */
const r = (i: number, k: number) => {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

const PIECES = Array.from({ length: 48 }, (_, i) => ({
  left: r(i, 1) * 100,
  delay: r(i, 2) * 0.8,
  dur: 2.4 + r(i, 3) * 1.8,
  size: 6 + r(i, 4) * 8,
  color: COLORS[i % COLORS.length],
  round: r(i, 5) > 0.5,
}));

export function Confetti() {
  const pieces = PIECES;
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="absolute top-0"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.round ? p.size : p.size * 0.45,
            background: p.color,
            borderRadius: p.round ? "50%" : 2,
            animation: `confetti-fall ${p.dur}s ${p.delay}s cubic-bezier(0.3,0.6,0.5,1) forwards`,
          }}
        />
      ))}
    </div>
  );
}

export function RewardOutcome({ won, prizeName, code }: { won: boolean; prizeName: string | null; code: string | null }) {
  if (won) {
    return (
      <div className="grow-in">
        <Confetti />
        <div className="relative overflow-hidden rounded-3xl bg-brand p-6 text-center text-brand-ink">
          <div className="shimmer absolute inset-0" aria-hidden />
          <div className="relative">
            <PartyPopper className="mx-auto" size={44} />
            <p className="mt-2 text-sm font-bold uppercase tracking-widest opacity-70">¡Ganaste!</p>
            <p className="text-3xl font-black leading-tight">{prizeName}</p>
            <div className="mx-auto mt-5 w-fit rounded-2xl border-2 border-dashed border-brand-ink/40 bg-brand-ink/5 px-6 py-3">
              <p className="text-xs font-semibold opacity-70">Código</p>
              <p className="font-mono text-3xl font-black tracking-[0.3em]">{code}</p>
            </div>
            <p className="mt-4 text-sm opacity-80">
              Tu mesero ya fue avisado. Muéstrale este código cuando te lo traiga.
            </p>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="card grow-in p-6 text-center">
      <Coffee className="mx-auto text-brand" size={44} />
      <p className="mt-3 text-2xl font-bold">¡Casi!</p>
      <p className="mt-1 text-muted">Esta vez no tocó premio, pero gracias por jugar. ¡Te esperamos en tu próxima visita!</p>
    </div>
  );
}
