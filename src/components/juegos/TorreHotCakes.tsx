"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCcw, Trophy } from "lucide-react";

/**
 * Torre de Hot Cakes (juego original de HR):
 * un hot cake se desliza de lado a lado; toca para soltarlo. Lo que sobresalga
 * de la pila se corta. Si cae perfecto, ¡combo! y la pila crece un poquito.
 */

const LAYER_H = 18;
const BEST_KEY = "hr-torre-best";

interface Layer { x: number; w: number }
interface Falling { x: number; w: number; y: number; vy: number; rot: number; vr: number }

function readBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function TorreHotCakes() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [score, setScore] = useState(0);
  // Este componente solo se monta tras tocar "jugar", nunca en el servidor.
  const [best, setBest] = useState(readBest);
  const [phase, setPhase] = useState<"ready" | "playing" | "over">("ready");
  const [flash, setFlash] = useState<string | null>(null);

  const g = useRef({
    W: 320,
    H: 480,
    layers: [] as Layer[],
    cur: { x: 0, w: 0, dir: 1 },
    falling: [] as Falling[],
    cam: 0,
    combo: 0,
    running: false,
    phase: "ready" as "ready" | "playing" | "over",
  });

  const setup = useCallback(() => {
    const s = g.current;
    const baseW = Math.round(s.W * 0.56);
    s.layers = [{ x: (s.W - baseW) / 2, w: baseW }];
    s.cur = { x: 0, w: baseW, dir: 1 };
    s.falling = [];
    s.cam = 0;
    s.combo = 0;
    setScore(0);
  }, []);

  // Dibujo + física
  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const ctx = canvas.getContext("2d")!;
    const s = g.current;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      s.W = wrap.clientWidth;
      s.H = Math.min(Math.round(window.innerHeight * 0.62), 560);
      canvas.width = s.W * dpr;
      canvas.height = s.H * dpr;
      canvas.style.height = `${s.H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (s.phase !== "playing") setup();
    };
    resize();
    window.addEventListener("resize", resize);

    const floorY = () => s.H - 46;
    const layerY = (i: number) => floorY() - (i + 1) * LAYER_H + s.cam;

    const drawCake = (x: number, y: number, w: number, top = false) => {
      const r = Math.min(9, w / 2);
      const grd = ctx.createLinearGradient(0, y, 0, y + LAYER_H);
      grd.addColorStop(0, "#f6c46a");
      grd.addColorStop(0.55, "#dc9a3e");
      grd.addColorStop(1, "#a9662a");
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.roundRect(x, y + 1, w, LAYER_H - 2, r);
      ctx.fill();
      ctx.fillStyle = "rgba(255,240,200,0.35)";
      ctx.fillRect(x + r, y + 3, Math.max(0, w - 2 * r), 2);
      if (top && w > 30) {
        // mantequilla + miel en el hot cake de arriba
        ctx.fillStyle = "#fff1a8";
        ctx.fillRect(x + w / 2 - 9, y - 6, 18, 8);
        ctx.fillStyle = "rgba(180,90,10,0.55)";
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + 2, Math.min(w * 0.35, 40), 3, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    let last = performance.now();
    let raf = 0;
    const loop = (t: number) => {
      const dt = Math.min(0.033, (t - last) / 1000);
      last = t;
      const n = s.layers.length;

      if (s.phase === "playing") {
        const speed = Math.min(150 + n * 9, 430);
        s.cur.x += s.cur.dir * speed * dt;
        if (s.cur.x + s.cur.w > s.W) { s.cur.x = s.W - s.cur.w; s.cur.dir = -1; }
        if (s.cur.x < 0) { s.cur.x = 0; s.cur.dir = 1; }
      }
      for (const f of s.falling) {
        f.vy += 1400 * dt;
        f.y += f.vy * dt;
        f.rot += f.vr * dt;
      }
      s.falling = s.falling.filter((f) => f.y < s.H + 200);
      const targetCam = Math.max(0, n * LAYER_H - s.H * 0.5);
      s.cam += (targetCam - s.cam) * Math.min(1, dt * 6);

      // fondo
      ctx.clearRect(0, 0, s.W, s.H);
      const bg = ctx.createRadialGradient(s.W / 2, s.H * 0.2, 10, s.W / 2, s.H * 0.4, s.H);
      bg.addColorStop(0, "#2a2210");
      bg.addColorStop(1, "#0f0f11");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, s.W, s.H);

      // plato
      const py = floorY() + s.cam;
      ctx.fillStyle = "#e9e6df";
      ctx.beginPath();
      ctx.ellipse(s.W / 2, py + 6, s.W * 0.4, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#c9c5bc";
      ctx.beginPath();
      ctx.ellipse(s.W / 2, py + 4, s.W * 0.3, 6, 0, 0, Math.PI * 2);
      ctx.fill();

      s.layers.forEach((l, i) => drawCake(l.x, layerY(i), l.w, i === n - 1 && s.phase !== "playing"));
      if (s.phase === "playing") drawCake(s.cur.x, layerY(n), s.cur.w, true);

      for (const f of s.falling) {
        ctx.save();
        ctx.translate(f.x + f.w / 2, f.y + LAYER_H / 2);
        ctx.rotate(f.rot);
        drawCake(-f.w / 2, -LAYER_H / 2, f.w);
        ctx.restore();
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [setup]);

  const drop = useCallback(() => {
    const s = g.current;
    if (s.phase === "ready" || s.phase === "over") {
      setup();
      s.phase = "playing";
      setPhase("playing");
      return;
    }
    const prev = s.layers[s.layers.length - 1];
    const cur = s.cur;
    const n = s.layers.length;
    const y = s.H - 46 - (n + 1) * LAYER_H + s.cam;
    const left = Math.max(cur.x, prev.x);
    const right = Math.min(cur.x + cur.w, prev.x + prev.w);
    const overlap = right - left;

    if (overlap <= 0) {
      s.falling.push({ x: cur.x, w: cur.w, y, vy: 0, rot: 0, vr: cur.dir * 3 });
      s.phase = "over";
      setPhase("over");
      navigator.vibrate?.(120);
      const sc = n - 1;
      if (sc > readBest()) {
        try { localStorage.setItem(BEST_KEY, String(sc)); } catch {}
        setBest(sc);
      }
      return;
    }

    let placed: Layer;
    if (Math.abs(cur.x - prev.x) <= 4) {
      s.combo++;
      const grow = s.combo >= 3 ? Math.min(8, s.W * 0.56 - prev.w) : 0;
      placed = { x: prev.x - grow / 2, w: prev.w + grow };
      setFlash(s.combo >= 3 ? `¡Combo x${s.combo}!` : "¡Perfecto!");
      navigator.vibrate?.(25);
    } else {
      s.combo = 0;
      placed = { x: left, w: overlap };
      const cutX = cur.x < prev.x ? cur.x : right;
      s.falling.push({ x: cutX, w: cur.w - overlap, y, vy: 0, rot: 0, vr: cur.x < prev.x ? -2.5 : 2.5 });
    }
    s.layers.push(placed);
    const fromLeft = s.layers.length % 2 === 0;
    s.cur = { x: fromLeft ? 0 : s.W - placed.w, w: placed.w, dir: fromLeft ? 1 : -1 };
    setScore(s.layers.length - 1);
  }, [setup]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 700);
    return () => clearTimeout(t);
  }, [flash]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        drop();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drop]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold">
          Altura: <span className="text-brand text-lg tabular-nums">{score}</span>
        </span>
        <span className="inline-flex items-center gap-1.5 text-muted">
          <Trophy size={16} className="text-brand" /> Récord: {best}
        </span>
      </div>
      <div ref={wrapRef} className="relative overflow-hidden rounded-3xl border border-line">
        <canvas
          ref={canvasRef}
          className="block w-full touch-none select-none"
          onPointerDown={(e) => {
            e.preventDefault();
            drop();
          }}
        />
        {flash && (
          <p className="grow-in pointer-events-none absolute inset-x-0 top-6 text-center text-2xl font-black text-brand drop-shadow">
            {flash}
          </p>
        )}
        {phase !== "playing" && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/40">
            <div className="text-center">
              {phase === "over" ? (
                <>
                  <p className="text-3xl font-black">¡Se cayó! 🥞</p>
                  <p className="mt-1 text-muted">Apilaste {score} hot cake{score === 1 ? "" : "s"}</p>
                  <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 font-bold text-brand-ink">
                    <RotateCcw size={18} /> Toca para jugar otra vez
                  </p>
                </>
              ) : (
                <>
                  <p className="text-3xl font-black">Torre de Hot Cakes</p>
                  <p className="mx-auto mt-2 max-w-60 text-sm text-muted">
                    Toca para soltar cada hot cake. Lo que sobresalga se corta. ¡Apila lo más alto que puedas!
                  </p>
                  <p className="mt-4 inline-flex rounded-full bg-brand px-5 py-2.5 font-bold text-brand-ink">Toca para empezar</p>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
