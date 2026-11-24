"use client";

import Link from "next/link";
import { BellRing, BookOpen, ChevronRight, Dices, Gamepad2, Gift, Star, Ticket } from "lucide-react";
import { MesaHeader, PendingBanner } from "@/components/mesa/MesaHeader";
import { useMesa } from "@/components/mesa/MesaProvider";

export default function MesaHome() {
  const { state } = useMesa();
  const onTheWay = state.requests.find((r) => r.status === "attending");
  const last = state.reward.last;

  return (
    <>
      <MesaHeader back={false} />

      <section className="pt-4 pb-5 pop-in">
        <h1 className="text-[2rem] font-bold leading-tight tracking-tight">
          ¿Qué se te <span className="text-brand">antoja</span> hoy?
        </h1>
        <p className="text-muted mt-1">
          {state.table.area ? `${state.table.area} · ` : ""}Todo desde tu celular, sin esperar.
        </p>
      </section>

      <div className="space-y-4">
        <PendingBanner />

        {onTheWay && (
          <div className="card border-ok/40 px-4 py-3 text-sm flex items-center gap-3 pop-in">
            <span className="size-2.5 rounded-full bg-ok pulse-ring" />
            <span>
              <b>Tu mesero va en camino</b>
              {onTheWay.game_name ? ` con ${onTheWay.game_name}` : ""}.
            </span>
          </div>
        )}

        {state.reward.available ? (
          <Link
            href="/mesa/premio"
            className="relative block overflow-hidden rounded-3xl bg-brand text-brand-ink p-5 pop-in active:scale-[0.98] transition-transform"
          >
            <div className="shimmer absolute inset-0" aria-hidden />
            <div className="relative flex items-center gap-4">
              <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-brand-ink text-brand">
                <Gift size={28} />
              </div>
              <div className="flex-1">
                <p className="text-xs font-bold uppercase tracking-widest opacity-70">Premio de la mesa</p>
                <p className="text-xl font-bold leading-tight">Juega y gana algo rico</p>
                <p className="text-sm opacity-75">Ruleta · Rasca y gana · Gato</p>
              </div>
              <ChevronRight className="shrink-0" />
            </div>
          </Link>
        ) : last?.status === "won" ? (
          <Link href="/mesa/premio" className="card flex items-center gap-4 p-4 pop-in">
            <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand/15 text-brand">
              <Ticket size={24} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted">Ganaste</p>
              <p className="font-semibold truncate">{last.prizeName}</p>
            </div>
            <span className="font-mono font-bold text-brand tracking-widest">{last.code}</span>
          </Link>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <Tile href="/mesa/mesero" icon={<BellRing size={26} />} title="Llamar mesero" sub="o pide algo rápido" accent />
          <Tile href="/mesa/menu" icon={<BookOpen size={26} />} title="Menú" sub="Bebidas y comida" />
          <Tile href="/mesa/ludoteca" icon={<Dices size={26} />} title="Ludoteca" sub="Juegos de mesa" />
          <Tile href="/mesa/juegos" icon={<Gamepad2 size={26} />} title="Jugar" sub="Mientras esperas" />
        </div>

        {state.restaurant.reviewUrl && (
          <a
            href={state.restaurant.reviewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="card flex items-center gap-4 p-4 active:scale-[0.98] transition-transform"
          >
            <div className="flex-1">
              <p className="font-semibold">¿Te gustó tu visita?</p>
              <p className="text-sm text-muted">Déjanos una reseña en Google, nos ayuda muchísimo.</p>
              <div className="mt-2 flex gap-0.5 text-brand" aria-hidden>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} size={18} fill="currentColor" />
                ))}
              </div>
            </div>
            <ChevronRight className="text-muted shrink-0" />
          </a>
        )}

        <p className="pt-4 text-center text-xs text-muted">
          {state.restaurant.name} · Mesa {state.table.number}
        </p>
      </div>
    </>
  );
}

function Tile({
  href,
  icon,
  title,
  sub,
  accent,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  sub: string;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`card flex min-h-36 flex-col justify-between p-4 active:scale-[0.97] transition-transform pop-in ${
        accent ? "border-brand/50" : ""
      }`}
    >
      <div
        className={`grid size-12 place-items-center rounded-2xl ${
          accent ? "bg-brand text-brand-ink" : "bg-brand/12 text-brand"
        }`}
      >
        {icon}
      </div>
      <div>
        <p className="font-semibold text-lg leading-tight">{title}</p>
        <p className="text-xs text-muted">{sub}</p>
      </div>
    </Link>
  );
}
