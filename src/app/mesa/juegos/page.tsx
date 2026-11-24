"use client";

import { useState } from "react";
import { Bomb, ChevronRight, Layers } from "lucide-react";
import { MesaHeader } from "@/components/mesa/MesaHeader";
import { Buscaminas } from "@/components/juegos/Buscaminas";
import { TorreHotCakes } from "@/components/juegos/TorreHotCakes";

const GAMES = {
  torre: { title: "Torre de Hot Cakes", sub: "Apila lo más alto que puedas", icon: <Layers size={28} /> },
  minas: { title: "Buscaminas", sub: "Clásico, rápido y adictivo", icon: <Bomb size={28} /> },
} as const;

type Key = keyof typeof GAMES;

export default function JuegosPage() {
  const [active, setActive] = useState<Key | null>(null);

  return (
    <>
      <MesaHeader title={active ? GAMES[active].title : "Juegos"} />
      <div className="space-y-3 pt-2">
        {active === "torre" && <TorreHotCakes />}
        {active === "minas" && <Buscaminas />}
        {active && (
          <button onClick={() => setActive(null)} className="btn-ghost w-full py-3 text-sm">
            Elegir otro juego
          </button>
        )}
        {!active && (
          <>
            <p className="text-muted">Para que la espera se pase volando.</p>
            {(Object.keys(GAMES) as Key[]).map((k, i) => (
              <button
                key={k}
                onClick={() => setActive(k)}
                className="card pop-in flex w-full items-center gap-4 p-4 text-left active:scale-[0.98] transition-transform"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-brand/12 text-brand">
                  {GAMES[k].icon}
                </div>
                <div className="flex-1">
                  <p className="text-lg font-semibold">{GAMES[k].title}</p>
                  <p className="text-sm text-muted">{GAMES[k].sub}</p>
                </div>
                <ChevronRight className="text-muted" />
              </button>
            ))}
          </>
        )}
      </div>
    </>
  );
}
