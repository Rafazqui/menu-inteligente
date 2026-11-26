"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { formatMoney, type PublicPromo } from "@/lib/types";
import { useMesa } from "./MesaProvider";

const ROTATE_MS = 6000;
const PAUSE_AFTER_TOUCH_MS = 12000;

/** Recomendaciones del negocio que rotan solas; "Lo quiero" avisa al mesero. */
export function PromoCarousel({ promos }: { promos: PublicPromo[] }) {
  const [idx, setIdx] = useState(0);
  const lastTouch = useRef(0);
  const startX = useRef<number | null>(null);
  const n = promos.length;
  const i = n ? idx % n : 0;

  useEffect(() => {
    if (n < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastTouch.current < PAUSE_AFTER_TOUCH_MS) return;
      setIdx((v) => (v + 1) % n);
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, [n]);

  if (n === 0) return null;

  const go = (to: number) => {
    lastTouch.current = Date.now();
    setIdx(((to % n) + n) % n);
  };

  return (
    <section aria-roledescription="carrusel" aria-label="Recomendaciones de la casa" className="pop-in">
      <div
        className="overflow-hidden rounded-3xl"
        onPointerDown={(e) => {
          startX.current = e.clientX;
          lastTouch.current = Date.now();
        }}
        onPointerUp={(e) => {
          if (startX.current === null) return;
          const dx = e.clientX - startX.current;
          startX.current = null;
          if (Math.abs(dx) > 40) go(i + (dx < 0 ? 1 : -1));
        }}
      >
        <div
          className="flex transition-transform duration-500 ease-out"
          style={{ transform: `translateX(-${i * 100}%)` }}
        >
          {promos.map((p, k) => (
            <Slide key={p.id} promo={p} hidden={k !== i} label={`${k + 1} de ${n}`} />
          ))}
        </div>
      </div>
      {n > 1 && (
        <div className="mt-2 flex justify-center gap-1.5">
          {promos.map((p, k) => (
            <button
              key={p.id}
              onClick={() => go(k)}
              aria-label={`Ver recomendación ${k + 1}: ${p.title}`}
              aria-current={k === i}
              className="grid h-6 place-items-center px-0.5"
            >
              <span className={`block h-1.5 rounded-full transition-all ${k === i ? "w-5 bg-brand" : "w-1.5 bg-line"}`} />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function Slide({ promo: p, hidden, label }: { promo: PublicPromo; hidden: boolean; label: string }) {
  const { state, refresh } = useMesa();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const asked = state.requests.some((r) => r.promo_id === p.id && (r.status === "pending" || r.status === "attending"));
  const open = state.session.status === "open";
  const ends = p.endsAt
    ? new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" }).format(new Date(new Date(p.endsAt).getTime() - 1000))
    : null;

  async function want() {
    setSending(true);
    setError(null);
    const res = await fetch("/api/mesa/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "promo", promoId: p.id }),
    }).catch(() => null);
    if (!res?.ok) setError((await res?.json().catch(() => null))?.error ?? "Sin conexión.");
    await refresh();
    setSending(false);
  }

  return (
    <article
      className="card flex w-full shrink-0 flex-col overflow-hidden"
      aria-roledescription="recomendación"
      aria-label={label}
      aria-hidden={hidden}
      inert={hidden}
    >
      <div className="relative h-36 shrink-0 bg-[linear-gradient(135deg,#ffc72c,#ff8a00)]">
        {p.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.imageUrl} alt="" className="size-full object-cover" draggable={false} />
        ) : (
          <Sparkles className="absolute bottom-3 right-4 text-brand-ink/40" size={56} />
        )}
        <span className="absolute left-3 top-3 rounded-full bg-ink/80 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-brand backdrop-blur">
          Recomendado hoy
        </span>
        {p.badge && (
          <span className="absolute right-3 top-3 rounded-full bg-danger px-2.5 py-1 text-sm font-black text-ink shadow">
            {p.badge}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="text-xl font-bold leading-tight">{p.title}</h3>
        {p.description && <p className="line-clamp-2 text-sm text-muted">{p.description}</p>}
        <div className="mt-auto flex items-end justify-between gap-3 pt-1">
          <div>
            {p.priceCents !== null && p.finalCents !== null ? (
              <p className="leading-tight">
                <span className="mr-2 text-sm text-muted line-through">{formatMoney(p.priceCents)}</span>
                <span className="text-2xl font-black text-brand">{formatMoney(p.finalCents)}</span>
              </p>
            ) : p.priceCents !== null ? (
              <p className="text-2xl font-black text-brand">{formatMoney(p.priceCents)}</p>
            ) : null}
            {ends && <p className="text-xs text-muted">Válido hasta el {ends}</p>}
          </div>
          {asked ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-2xl bg-ok/15 px-4 py-2.5 text-sm font-semibold text-ok">
              <Check size={16} /> Pedido
            </span>
          ) : (
            <button onClick={want} disabled={!open || sending} className="btn-brand shrink-0 px-5 py-2.5">
              {sending ? "Enviando…" : "Lo quiero"}
            </button>
          )}
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
        {!open && <p className="text-xs text-muted">Podrás pedirlo cuando tu mesa esté activa.</p>}
      </div>
    </article>
  );
}
