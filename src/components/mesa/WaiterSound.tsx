"use client";

import { useEffect, useRef } from "react";
import { SOUNDS, useSound } from "@/hooks/useSound";
import { useMesa } from "./MesaProvider";

/**
 * Avisa con un sonido cuando el mesero ya va para la mesa.
 *
 * Vive en el layout de `/mesa`, no en una pantalla: así suena aunque el cliente
 * se haya ido al menú, a la ludoteca o a los minijuegos mientras espera.
 * No dibuja nada.
 *
 * Límite: si el celular tiene la pantalla apagada o el navegador en segundo
 * plano, no suena en ese momento (el navegador bloquea el audio y `MesaProvider`
 * deja de consultar). Suena en cuanto el cliente vuelve a la app. Para avisar
 * con la pantalla apagada harían falta notificaciones push del lado del cliente.
 */
export function WaiterSound() {
  const { state } = useMesa();
  const sonido = useSound(SOUNDS.meseroEnCamino);

  // Un solo toque en cualquier parte basta para que el navegador nos deje
  // reproducir audio después, cuando el aviso llegue solo desde el servidor.
  useEffect(() => {
    const unlock = () => sonido.unlock();
    document.addEventListener("pointerdown", unlock, { once: true });
    return () => document.removeEventListener("pointerdown", unlock);
  }, [sonido]);

  // "attending" = el mesero tomó la solicitud y va para la mesa.
  // Se siguen los ids, no un booleano: si hay varias solicitudes abiertas, cada
  // una suena cuando la atienden, no solo la primera.
  const attending = state.requests
    .filter((r) => (r.type === "waiter" || r.type === "bill") && r.status === "attending")
    .map((r) => r.id)
    .join(",");
  const seen = useRef<Set<number> | null>(null);

  useEffect(() => {
    const ids = attending ? attending.split(",").map(Number) : [];
    // Primera carga: no suena por lo que ya venía en camino desde antes.
    if (seen.current === null) {
      seen.current = new Set(ids);
      return;
    }
    if (ids.some((id) => !seen.current!.has(id))) sonido.play();
    seen.current = new Set(ids);
  }, [attending, sonido]);

  return null;
}
