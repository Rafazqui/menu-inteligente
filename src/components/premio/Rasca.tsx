"use client";

import { useEffect, useRef, useState } from "react";
import { Coffee, Gift } from "lucide-react";
import { RewardOutcome } from "./Result";

type Result = { won: boolean; prizeName: string | null; code: string | null };

export function Rasca({ onDone }: { onDone: () => void }) {
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const moves = useRef(0);

  async function play() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/mesa/rewards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game: "rasca" }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setLoading(false);
    if (!res?.ok || !data) {
      setError(data?.error ?? "Sin conexión. Intenta de nuevo.");
      return;
    }
    setResult({ won: data.won, prizeName: data.prizeName, code: data.code });
    onDone();
  }

  // Pinta la capa plateada para rascar.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !result) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    const g = ctx.createLinearGradient(0, 0, rect.width, rect.height);
    g.addColorStop(0, "#cfcfd4");
    g.addColorStop(0.5, "#9a9aa2");
    g.addColorStop(1, "#d9d9de");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, rect.width, rect.height);
    // textura
    for (let i = 0; i < 500; i++) {
      ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.15})`;
      ctx.fillRect(Math.random() * rect.width, Math.random() * rect.height, 2, 2);
    }
    const family = getComputedStyle(document.body).fontFamily;
    ctx.fillStyle = "#3a3a40";
    ctx.font = `800 22px ${family}`;
    ctx.textAlign = "center";
    ctx.fillText("RASCA AQUÍ", rect.width / 2, rect.height / 2 + 8);
    ctx.font = `600 12px ${family}`;
    ctx.fillText("con tu dedo", rect.width / 2, rect.height / 2 + 30);
  }, [result]);

  function scratch(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || revealed) return;
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext("2d")!;
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(e.clientX - rect.left, e.clientY - rect.top, 24, 0, Math.PI * 2);
    ctx.fill();
    if (++moves.current % 12 === 0) checkCleared();
  }

  function checkCleared() {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let clear = 0;
    let total = 0;
    for (let i = 3; i < data.length; i += 4 * 16) {
      total++;
      if (data[i] < 40) clear++;
    }
    if (clear / total > 0.5) setRevealed(true);
  }

  if (!result) {
    return (
      <div className="space-y-4">
        <div className="card grid aspect-[4/3] place-items-center bg-[linear-gradient(135deg,#1e1e21,#151517)]">
          <div className="text-center">
            <Gift size={56} className="mx-auto text-brand" />
            <p className="mt-3 text-lg font-semibold">Tu boleto te espera</p>
          </div>
        </div>
        <button onClick={play} disabled={loading} className="btn-brand w-full py-4 text-lg">
          {loading ? "Preparando boleto…" : "Obtener mi boleto"}
        </button>
        {error && <p className="text-center text-sm text-danger">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border-2 border-dashed border-brand/50 bg-surface">
        <div className="absolute inset-0 grid place-items-center p-6 text-center">
          {result.won ? (
            <div>
              <Gift size={48} className="mx-auto text-brand" />
              <p className="mt-2 text-sm uppercase tracking-widest text-muted">Ganaste</p>
              <p className="text-2xl font-black text-brand">{result.prizeName}</p>
            </div>
          ) : (
            <div>
              <Coffee size={48} className="mx-auto text-muted" />
              <p className="mt-2 text-xl font-bold">Sigue participando</p>
            </div>
          )}
        </div>
        <canvas
          ref={canvasRef}
          className={`absolute inset-0 size-full touch-none transition-opacity duration-700 ${revealed ? "pointer-events-none opacity-0" : ""}`}
          onPointerDown={(e) => {
            drawing.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            scratch(e);
          }}
          onPointerMove={scratch}
          onPointerUp={() => {
            drawing.current = false;
            checkCleared();
          }}
          onPointerCancel={() => (drawing.current = false)}
        />
      </div>
      {revealed ? (
        <RewardOutcome {...result} />
      ) : (
        <button onClick={() => setRevealed(true)} className="w-full text-center text-sm text-muted underline">
          Revelar todo
        </button>
      )}
    </div>
  );
}
