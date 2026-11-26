"use client";

import { useEffect, useState } from "react";
import { BellOff, BellRing, Smartphone } from "lucide-react";

type State = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on";

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

async function detect(): Promise<State> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    // En iPhone, las notificaciones solo existen si el panel está instalado en la pantalla de inicio.
    return isIos() && !isStandalone() ? "ios-install" : "unsupported";
  }
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  return sub ? "on" : "off";
}

async function api(body: object) {
  const res = await fetch("/api/admin/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "No se pudo completar.");
}

/** Botón para que el celular del mesero reciba avisos aunque la pantalla esté bloqueada. */
export function PushToggle() {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    detect().then(setState).catch(() => setState("unsupported"));
  }, []);

  async function enable() {
    setBusy(true);
    setMsg(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw-admin.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const { publicKey } = await (await fetch("/api/admin/push")).json();
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ToBytes(publicKey) }));
      await api({ action: "subscribe", subscription: sub.toJSON() });
      await api({ action: "test" });
      setState("on");
      setMsg("Listo: te enviamos una notificación de prueba.");
    } catch (e) {
      setMsg((e as Error).message || "No se pudieron activar las notificaciones.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await api({ action: "unsubscribe", endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setMsg(null);
    try {
      await api({ action: "test" });
      setMsg("Notificación de prueba enviada.");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") return null;

  return (
    <div className="flex flex-col items-end gap-1">
      {state === "off" && (
        <button onClick={enable} disabled={busy} className="btn-ghost inline-flex items-center gap-2 px-4 py-2 text-sm">
          <Smartphone size={18} /> {busy ? "Activando…" : "Avisos en este celular"}
        </button>
      )}
      {state === "on" && (
        <div className="flex gap-2">
          <button onClick={test} disabled={busy} className="btn-ghost inline-flex items-center gap-2 px-3 py-2 text-sm">
            <BellRing size={16} className="text-ok" /> Probar
          </button>
          <button onClick={disable} disabled={busy} className="btn-ghost inline-flex items-center gap-2 px-3 py-2 text-sm" title="Desactivar avisos en este dispositivo">
            <BellOff size={16} /> Desactivar
          </button>
        </div>
      )}
      {state === "denied" && (
        <p className="max-w-64 text-right text-xs text-muted">
          Bloqueaste las notificaciones. Actívalas en los ajustes del navegador para este sitio.
        </p>
      )}
      {state === "ios-install" && (
        <p className="max-w-72 text-right text-xs text-muted">
          En iPhone: toca <b>Compartir → Agregar a inicio</b>, abre el panel desde ese ícono y aquí podrás activar los avisos.
        </p>
      )}
      {msg && <p className="text-xs text-muted">{msg}</p>}
    </div>
  );
}
