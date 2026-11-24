"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Disc3, Grid3x3, Lock, Ticket } from "lucide-react";
import { MesaHeader, PendingBanner } from "@/components/mesa/MesaHeader";
import { useMesa } from "@/components/mesa/MesaProvider";
import { Ruleta } from "@/components/premio/Ruleta";
import { Rasca } from "@/components/premio/Rasca";
import { Gato } from "@/components/premio/Gato";
import { RewardOutcome } from "@/components/premio/Result";
import type { RewardGame } from "@/lib/types";

const INFO: Record<RewardGame, { title: string; sub: string; icon: React.ReactNode }> = {
  ruleta: { title: "Girar la ruleta", sub: "Un giro, mucha suerte", icon: <Disc3 size={28} /> },
  rasca: { title: "Rasca y gana", sub: "Descubre tu boleto", icon: <Ticket size={28} /> },
  gato: { title: "Gato vs. la máquina", sub: "Gánale y llévate premio", icon: <Grid3x3 size={28} /> },
};

type GatoView = Parameters<typeof Gato>[0]["initial"];

export default function PremioPage() {
  const { state, refresh } = useMesa();
  const [active, setActive] = useState<RewardGame | null>(null);
  const [gatoResume, setGatoResume] = useState<GatoView>(null);
  const last = state.reward.last;

  // Si quedó una partida de gato a medias (p. ej. recargó la página), se retoma.
  const resumeGato = !active && last?.game === "gato" && last.status === "playing";
  useEffect(() => {
    if (!resumeGato) return;
    fetch("/api/mesa/gato")
      .then((r) => r.json())
      .then((d) => {
        setGatoResume(d.game);
        setActive("gato");
      })
      .catch(() => {});
  }, [resumeGato]);

  const title = active ? INFO[active].title : "Premio de la mesa";

  return (
    <>
      <MesaHeader title={title} />
      <div className="space-y-4 pt-2">
        {active === "ruleta" && <Ruleta onDone={refresh} />}
        {active === "rasca" && <Rasca onDone={refresh} />}
        {active === "gato" && <Gato initial={gatoResume} onDone={refresh} />}

        {!active && state.reward.available && (
          <>
            <p className="text-muted">
              Elige <b className="text-cream">un</b> juego. Tienes un intento por visita para toda la mesa, ¡escojan bien!
            </p>
            {state.reward.games.map((g, i) => (
              <button
                key={g}
                onClick={() => setActive(g)}
                className="card pop-in flex w-full items-center gap-4 p-4 text-left active:scale-[0.98] transition-transform"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-brand text-brand-ink">
                  {INFO[g].icon}
                </div>
                <div className="flex-1">
                  <p className="text-lg font-semibold">{INFO[g].title}</p>
                  <p className="text-sm text-muted">{INFO[g].sub}</p>
                </div>
                <ChevronRight className="text-muted" />
              </button>
            ))}
          </>
        )}

        {!active && !state.reward.available && !resumeGato && (
          <>
            {state.session.status === "pending" ? (
              <>
                <PendingBanner />
                <Locked text="El premio se desbloquea cuando tu mesero active la mesa." />
              </>
            ) : last && last.status !== "playing" ? (
              <>
                <p className="text-muted">El premio de esta visita ya se jugó:</p>
                <RewardOutcome won={last.status === "won"} prizeName={last.prizeName} code={last.code} />
              </>
            ) : (
              <Locked text="Por ahora no hay premios disponibles. ¡Vuelve pronto!" />
            )}
            <Link href="/mesa/juegos" className="btn-ghost block py-3.5 text-center">
              Jugar minijuegos mientras esperas
            </Link>
          </>
        )}
      </div>
    </>
  );
}

function Locked({ text }: { text: string }) {
  return (
    <div className="card p-6 text-center">
      <Lock className="mx-auto text-brand" size={36} />
      <p className="mt-3 text-muted">{text}</p>
    </div>
  );
}
