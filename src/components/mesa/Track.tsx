"use client";

import { useEffect } from "react";

export type TrackType = "menu_view" | "review_click" | "ludoteca_view";

/** Envía un evento de estadísticas sin bloquear la navegación (keepalive sobrevive al cambio de página). */
export function track(type: TrackType) {
  fetch("/api/mesa/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type }),
    keepalive: true,
  }).catch(() => {});
}

/** Registra que el cliente abrió esta pantalla. */
export function TrackView({ type }: { type: TrackType }) {
  useEffect(() => {
    track(type);
  }, [type]);
  return null;
}
