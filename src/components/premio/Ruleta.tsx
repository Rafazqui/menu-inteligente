"use client";

import { useEffect, useMemo, useState } from "react";
import { RewardOutcome } from "./Result";

interface Segment {
  label: string;
  prizeId: number | null;
}

const LOSE_LABEL = "Suerte la próxima";

function buildSegments(prizes: { id: number; name: string }[]): Segment[] {
  // Se intercalan premios con casillas vacías para que la rueda se vea pareja.
  const segs: Segment[] = [];
  const base = prizes.length ? prizes : [];
  const total = Math.max(8, base.length * 2);
  for (let i = 0; i < total; i++) {
    if (i % 2 === 0 && base.length) {
      const p = base[(i / 2) % base.length];
      segs.push({ label: p.name, prizeId: p.id });
    } else {
      segs.push({ label: LOSE_LABEL, prizeId: null });
    }
  }
  return segs;
}

/** Parte el texto en máximo 2 renglones para que quepa en la rebanada. */
function wrap(s: string, max = 14): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const w of s.split(/\s+/)) {
    if (!cur) cur = w;
    else if ((cur + " " + w).length <= max) cur += " " + w;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  const out = lines.slice(0, 2);
  if (lines.length > 2) out[1] = out[1] + "…";
  return out.map((l) => (l.length > max + 2 ? l.slice(0, max) + "…" : l));
}

export function Ruleta({ onDone }: { onDone: () => void }) {
  const [prizes, setPrizes] = useState<{ id: number; name: string }[] | null>(null);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<null | { won: boolean; prizeName: string | null; code: string | null }>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/mesa/rewards")
      .then((r) => r.json())
      .then((d) => setPrizes(d.prizes ?? []))
      .catch(() => setPrizes([]));
  }, []);

  const segments = useMemo(() => buildSegments(prizes ?? []), [prizes]);
  const n = segments.length;
  const angle = 360 / n;

  async function spin() {
    setSpinning(true);
    setError(null);
    const res = await fetch("/api/mesa/rewards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game: "ruleta" }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (!res?.ok || !data) {
      setError(data?.error ?? "Sin conexión. Intenta de nuevo.");
      setSpinning(false);
      return;
    }
    // Buscar la casilla donde debe caer según lo que decidió el servidor.
    const candidates = segments
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => (data.won ? s.prizeId === data.prizeId : s.prizeId === null));
    const target = candidates[Math.floor(Math.random() * candidates.length)]?.i ?? 0;
    const jitter = (Math.random() - 0.5) * angle * 0.6;
    const final = 360 * 7 + (360 - (target * angle + angle / 2)) + jitter;
    setRotation(final);
    setTimeout(() => {
      setResult({ won: data.won, prizeName: data.prizeName, code: data.code });
      setSpinning(false);
      onDone();
    }, 5600);
  }

  const R = 150;
  const C = 160;

  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        {/* Indicador */}
        <div className="absolute left-1/2 -top-2 z-10 -translate-x-1/2">
          <div className="h-0 w-0 border-x-[14px] border-t-[26px] border-x-transparent border-t-brand drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]" />
        </div>
        <svg
          viewBox="0 0 320 320"
          className="size-[min(84vw,340px)] drop-shadow-[0_0_40px_rgba(255,199,44,0.25)]"
          style={{
            transform: `rotate(${rotation}deg)`,
            transition: rotation ? "transform 5.4s cubic-bezier(0.12, 0.75, 0.15, 1)" : undefined,
          }}
          role="img"
          aria-label="Ruleta de premios"
        >
          <circle cx={C} cy={C} r={R + 8} fill="#1e1e21" stroke="#ffc72c" strokeWidth={3} />
          {segments.map((s, i) => {
            const a0 = ((i * angle - 90) * Math.PI) / 180;
            const a1 = (((i + 1) * angle - 90) * Math.PI) / 180;
            const x0 = C + R * Math.cos(a0);
            const y0 = C + R * Math.sin(a0);
            const x1 = C + R * Math.cos(a1);
            const y1 = C + R * Math.sin(a1);
            const prize = s.prizeId !== null;
            const mid = i * angle + angle / 2;
            return (
              <g key={i}>
                <path
                  d={`M${C},${C} L${x0},${y0} A${R},${R} 0 0 1 ${x1},${y1} Z`}
                  fill={prize ? (i % 4 === 0 ? "#ffc72c" : "#ffb703") : i % 4 === 1 ? "#151517" : "#232327"}
                  stroke="#0b0b0c"
                  strokeWidth={1.5}
                />
                <text
                  y={C}
                  transform={`rotate(${mid - 90} ${C} ${C})`}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontSize={prize ? 11 : 9.5}
                  fontWeight={prize ? 800 : 500}
                  fill={prize ? "#1a1400" : "#a5a5ad"}
                >
                  {wrap(s.label).map((line, k, arr) => (
                    <tspan key={k} x={C + R - 14} dy={k === 0 ? (arr.length > 1 ? "-0.55em" : 0) : "1.15em"}>
                      {line}
                    </tspan>
                  ))}
                </text>
              </g>
            );
          })}
          {Array.from({ length: n }).map((_, i) => {
            const a = ((i * angle - 90) * Math.PI) / 180;
            return <circle key={i} cx={C + (R + 4) * Math.cos(a)} cy={C + (R + 4) * Math.sin(a)} r={2.5} fill="#ffc72c" />;
          })}
        </svg>
        <div className="absolute left-1/2 top-1/2 grid size-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-4 border-ink bg-brand text-xs font-black text-brand-ink shadow-xl">
          HR
        </div>
      </div>

      <div className="mt-8 w-full">
        {result ? (
          <RewardOutcome {...result} />
        ) : (
          <>
            <button
              onClick={spin}
              disabled={spinning || prizes === null}
              className="btn-brand w-full py-4 text-lg"
            >
              {spinning ? "Girando…" : "¡Girar la ruleta!"}
            </button>
            {error && <p className="mt-3 text-center text-sm text-danger">{error}</p>}
          </>
        )}
      </div>
    </div>
  );
}
