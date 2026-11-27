"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

/**
 * Sonidos de la app. Los archivos van en `public/sonidos/`.
 *
 * Cada sonido lista sus formatos del más eficiente al más compatible: se usa el
 * primero que el navegador sepa reproducir. Si ninguno existe todavía, el hook
 * falla en silencio y la pantalla no se rompe.
 */
export const SOUNDS = {
  /** El mesero ya va en camino a la mesa. */
  meseroEnCamino: ["/sonidos/llamar-mesero.ogg", "/sonidos/llamar-mesero.mp3"],
} as const;

/** Tipo MIME por extensión, para preguntarle al navegador si puede reproducirlo. */
const MIME: Record<string, string> = {
  ".opus": 'audio/ogg; codecs="opus"',
  // Un `.ogg` puede traer Opus o Vorbis dentro. No se afirma el codec: así no se
  // descarta el archivo en un navegador que solo lee uno de los dos.
  ".ogg": "audio/ogg",
  ".webm": 'audio/webm; codecs="opus"',
  ".m4a": 'audio/mp4; codecs="mp4a.40.2"',
  ".aac": "audio/aac",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
};

/**
 * Por qué no se oyó nada. Solo en desarrollo: un aviso que no suena no debe
 * ensuciar la consola del cliente, pero sin esto no hay forma de diagnosticarlo.
 */
function aviso(msg: string, detalle?: unknown) {
  if (process.env.NODE_ENV !== "production") console.warn("[sonido] " + msg, detalle ?? "");
}

/** Primer formato de la lista que este navegador soporta. */
function pickSource(urls: string[]): string {
  if (urls.length <= 1) return urls[0] ?? "";
  const probe = document.createElement("audio");
  for (const url of urls) {
    const mime = MIME[url.slice(url.lastIndexOf(".")).toLowerCase()];
    // Extensión desconocida: que lo intente el navegador.
    if (!mime || probe.canPlayType(mime)) return url;
  }
  // Ninguno reconocido: el último de la lista es el más compatible (mp3).
  return urls[urls.length - 1];
}

export interface Sound {
  /**
   * Desbloquea el audio aprovechando un toque del usuario: iOS y Chrome solo
   * permiten reproducir sonido si antes hubo un gesto. Llámalo en el `onClick`
   * del botón (no se oye nada) para que `play()` ya tenga permiso más tarde,
   * cuando el aviso llegue solo desde el servidor.
   */
  unlock: () => void;
  /** Reproduce el sonido desde el inicio. */
  play: () => void;
}

/**
 * Reproduce un sonido corto de `public/`.
 *
 * Pensado para avisos que llegan *después* del gesto del usuario (polling, SSE):
 * toca el botón → `unlock()`, y cuando llega el evento → `play()`.
 *
 * ```tsx
 * const sonido = useSound(SOUNDS.meseroEnCamino);
 * <button onClick={() => { sonido.unlock(); enviar(); }} />
 * useEffect(() => { if (vaEnCamino) sonido.play(); }, [vaEnCamino, sonido]);
 * ```
 */
export function useSound(src: string | readonly string[], { volume = 0.7 }: { volume?: number } = {}): Sound {
  const audio = useRef<HTMLAudioElement | null>(null);
  const unlocked = useRef(false);
  // Una clave estable aunque llegue un arreglo nuevo en cada render.
  const key = typeof src === "string" ? src : src.join("|");

  // Se crea una sola vez por sonido y se precarga, para que suene sin retraso.
  useEffect(() => {
    const el = new Audio(pickSource(key.split("|")));
    el.preload = "auto";
    el.volume = volume;
    // Un 404 o un archivo que el navegador no entiende: sin esto, el aviso
    // simplemente no suena y no queda rastro de por qué.
    const onError = () => aviso(`no se pudo cargar ${el.currentSrc || el.src}`, el.error?.message);
    el.addEventListener("error", onError);
    audio.current = el;
    unlocked.current = false;
    return () => {
      el.removeEventListener("error", onError);
      el.pause();
      audio.current = null;
    };
  }, [key, volume]);

  const unlock = useCallback(() => {
    const el = audio.current;
    if (!el || unlocked.current) return;
    el.volume = 0;
    el.play()
      .then(() => {
        el.pause();
        el.currentTime = 0;
        el.volume = volume;
        unlocked.current = true;
      })
      .catch((err) => {
        el.volume = volume;
        aviso("no se pudo desbloquear el audio con este gesto", err);
      });
  }, [volume]);

  const play = useCallback(() => {
    const el = audio.current;
    if (!el) return;
    // Todavía sin metadatos: se reproduce desde donde esté en lugar de fallar.
    try {
      el.currentTime = 0;
    } catch {
      /* readyState = HAVE_NOTHING */
    }
    el.play().catch((err) => {
      aviso(
        unlocked.current
          ? "el navegador rechazó reproducir el aviso"
          : "audio bloqueado: en esta pestaña el cliente no ha tocado la pantalla todavía",
        err,
      );
    });
  }, []);

  // Identidad estable: `WaiterSound` lo usa como dependencia de sus efectos, y
  // un objeto nuevo en cada render los volvía a correr en cada consulta al servidor.
  return useMemo(() => ({ unlock, play }), [unlock, play]);
}
