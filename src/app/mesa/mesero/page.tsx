"use client";

import { useEffect, useState } from "react";
import { BellRing, Check } from "lucide-react";
import { MesaHeader, PendingBanner } from "@/components/mesa/MesaHeader";
import { useMesa } from "@/components/mesa/MesaProvider";
import { describeRequest, StatusChip, timeAgo } from "@/components/mesa/RequestStatus";

const QUICK = ["Agua natural", "La cuenta, por favor", "Servilletas", "Cubiertos", "Más hielo", "Otra ronda"];

export default function MeseroPage() {
  const { state, refresh } = useMesa();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  const disabled = state.session.status !== "open" || sending || wait > 0;

  async function call() {
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/mesa/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "waiter", message }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "No se pudo enviar. Intenta de nuevo.");
        if (data.wait) setWait(data.wait);
      } else {
        setSent(true);
        setMessage("");
        setWait(state.waiterCooldownSec);
        setTimeout(() => setSent(false), 3500);
        refresh();
      }
    } catch {
      setError("Sin conexión. Revisa tu internet.");
    } finally {
      setSending(false);
    }
  }

  const history = state.requests.filter((r) => r.type !== "prize");

  return (
    <>
      <MesaHeader title="Llamar a tu mesero" />
      <div className="space-y-5 pt-2">
        <PendingBanner />

        <div className="card p-4 space-y-3">
          <label htmlFor="msg" className="text-sm font-semibold">
            ¿Necesitas algo en específico? <span className="text-muted font-normal">(opcional)</span>
          </label>
          <textarea
            id="msg"
            className="input min-h-20 resize-none"
            maxLength={140}
            placeholder="Ej. Una jarra de agua y dos vasos"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            {QUICK.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setMessage(q)}
                className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  message === q ? "border-brand bg-brand/15 text-brand" : "border-line text-muted"
                }`}
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-center py-2">
          <button
            type="button"
            onClick={call}
            disabled={disabled}
            className={`grid size-44 place-items-center rounded-full bg-brand text-brand-ink shadow-[0_0_60px_-10px_rgb(255_199_44/0.6)] transition-transform active:scale-95 disabled:opacity-40 ${
              !disabled ? "pulse-ring" : ""
            }`}
          >
            <span className="flex flex-col items-center gap-2">
              {sent ? <Check size={52} className="grow-in" /> : <BellRing size={52} />}
              <span className="font-bold text-lg leading-tight text-center px-6">
                {sent ? "¡Avisado!" : message ? "Enviar" : "Llamar"}
              </span>
            </span>
          </button>
          <p className="mt-4 h-5 text-sm text-muted" aria-live="polite">
            {error ? (
              <span className="text-danger">{error}</span>
            ) : wait > 0 ? (
              `Podrás llamar de nuevo en ${wait} s`
            ) : state.session.status !== "open" ? (
              "Disponible cuando tu mesa esté activa"
            ) : (
              "Le llegará al instante a tu mesero"
            )}
          </p>
        </div>

        {history.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-semibold text-muted">Tus solicitudes</h2>
            <ul className="space-y-2">
              {history.map((r) => (
                <li key={r.id} className="card flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{describeRequest(r)}</p>
                    <p className="text-xs text-muted">{timeAgo(r.created_at)}</p>
                  </div>
                  <StatusChip status={r.status} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
