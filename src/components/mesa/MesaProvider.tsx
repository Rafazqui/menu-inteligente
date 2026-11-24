"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { MesaState } from "@/lib/types";

interface Ctx {
  state: MesaState;
  refresh: () => Promise<void>;
}

const MesaContext = createContext<Ctx | null>(null);

export function useMesa(): Ctx {
  const c = useContext(MesaContext);
  if (!c) throw new Error("useMesa fuera de MesaProvider");
  return c;
}

/** Mantiene el estado de la mesa sincronizado consultando al servidor cada pocos segundos. */
export function MesaProvider({ initial, children }: { initial: MesaState; children: React.ReactNode }) {
  const [state, setState] = useState(initial);
  const router = useRouter();
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const res = await fetch("/api/mesa/state", { cache: "no-store" });
      if (res.status === 401) {
        router.replace("/?aviso=fin");
        return;
      }
      if (res.ok) setState(await res.json());
    } catch {
      // sin conexión momentánea: se reintenta en el siguiente ciclo
    } finally {
      busy.current = false;
    }
  }, [router]);

  useEffect(() => {
    // Más rápido mientras la mesa espera aprobación o hay algo en camino.
    const waiting =
      state.session.status === "pending" ||
      state.requests.some((r) => r.status === "pending" || r.status === "attending");
    const ms = waiting ? 3000 : 8000;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, ms);
    const onVis = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh, state.session.status, state.requests]);

  return <MesaContext.Provider value={{ state, refresh }}>{children}</MesaContext.Provider>;
}
