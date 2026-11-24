"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useMesa } from "./MesaProvider";

export function MesaHeader({ title, back = true }: { title?: string; back?: boolean }) {
  const { state } = useMesa();
  return (
    <header className="sticky top-0 z-30 -mx-4 px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-3 bg-ink/80 backdrop-blur-xl">
      <div className="flex items-center gap-3">
        {back ? (
          <Link
            href="/mesa"
            aria-label="Volver al inicio"
            className="btn-ghost grid place-items-center size-10 shrink-0 rounded-full"
          >
            <ChevronLeft size={22} />
          </Link>
        ) : (
          <Image src={state.restaurant.logoUrl || "/brand/logo.png"} alt="" width={42} height={42} className="shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold leading-tight">{title ?? state.restaurant.name}</p>
          {!title && state.restaurant.tagline && (
            <p className="truncate text-xs text-muted">{state.restaurant.tagline}</p>
          )}
        </div>
        <div className="shrink-0 rounded-full bg-brand text-brand-ink px-3 py-1.5 text-sm font-bold leading-none">
          Mesa {state.table.number}
        </div>
      </div>
    </header>
  );
}

export function PendingBanner() {
  const { state } = useMesa();
  if (state.session.status !== "pending") return null;
  return (
    <div className="card border-brand/40 p-4 flex items-center gap-3 pop-in">
      <div className="flex gap-1 shrink-0" aria-hidden>
        <span className="dot size-2 rounded-full bg-brand" />
        <span className="dot size-2 rounded-full bg-brand [animation-delay:0.15s]" />
        <span className="dot size-2 rounded-full bg-brand [animation-delay:0.3s]" />
      </div>
      <p className="text-sm">
        <span className="font-semibold">Conectando tu mesa…</span>{" "}
        <span className="text-muted">Tu mesero la activará en un momento. Mientras, puedes ver el menú, la ludoteca y jugar.</span>
      </p>
    </div>
  );
}
