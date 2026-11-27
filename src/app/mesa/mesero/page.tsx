"use client";

import { useEffect, useState } from "react";
import { Banknote, BellRing, Check, CreditCard, Receipt } from "lucide-react";
import type { PaymentMethod } from "@/lib/types";
import { MesaHeader, PendingBanner } from "@/components/mesa/MesaHeader";
import { useMesa } from "@/components/mesa/MesaProvider";
import { describeRequest, StatusChip, timeAgo } from "@/components/mesa/RequestStatus";

const QUICK = ["Agua natural", "Servilletas", "Cubiertos", "Más hielo", "Otra ronda"];

/** Pedir la cuenta con el método de pago, para que el mesero llegue con la terminal o con cambio. */
function BillCard() {
  const { state, refresh } = useMesa();
  const [sending, setSending] = useState<PaymentMethod | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pending = state.requests.find((r) => r.type === "bill" && (r.status === "pending" || r.status === "attending"));
  const open = state.session.status === "open";

  async function ask(method: PaymentMethod) {
    setSending(method);
    setError(null);
    const res = await fetch("/api/mesa/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "bill", method }),
    }).catch(() => null);
    if (!res?.ok) setError((await res?.json().catch(() => null))?.error ?? "Sin conexión. Intenta de nuevo.");
    await refresh();
    setSending(null);
  }

  return (
    <section id="cuenta" className="card scroll-mt-24 space-y-3 p-4">
      <h2 className="flex items-center gap-2 font-semibold">
        <Receipt size={20} className="text-brand" /> Pedir la cuenta
      </h2>
      {pending ? (
        <p className="flex items-center gap-2 rounded-2xl bg-ok/15 px-4 py-3 text-sm font-medium text-ok">
          <Check size={18} /> Ya la pediste ({pending.payment_method}).{" "}
          {pending.status === "attending" ? "Tu mesero va en camino." : "En un momento te la traen."}
        </p>
      ) : (
        <>
          <p className="text-sm text-muted">¿Cómo vas a pagar? Así tu mesero llega con lo necesario.</p>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => ask("efectivo")} disabled={!open || sending !== null} className="btn-ghost flex flex-col items-center gap-1.5 py-4">
              <Banknote size={26} className="text-brand" />
              {sending === "efectivo" ? "Enviando…" : "Efectivo"}
            </button>
            <button onClick={() => ask("tarjeta")} disabled={!open || sending !== null} className="btn-ghost flex flex-col items-center gap-1.5 py-4">
              <CreditCard size={26} className="text-brand" />
              {sending === "tarjeta" ? "Enviando…" : "Tarjeta"}
            </button>
          </div>
        </>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
      {!open && <p className="text-xs text-muted">Disponible cuando tu mesa esté activa.</p>}
    </section>
  );
}

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

  const history = state.requests.filter((r) => r.type !== "prize" && r.type !== "bill");

  return (
    <>
      <MesaHeader title="Llamar a tu mesero" />
      <div className="space-y-5 pt-2">
        <PendingBanner />

        <div className="card p-4 space-y-3">
          <label htmlFor="msg" className="text-sm font-semibold">
            ¿Necesitas algo en específico? o que <span className="text-muted font-normal">(opcional)</span>
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
                className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${message === q ? "border-brand bg-brand/15 text-brand" : "border-line text-muted"
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
            className={`grid size-[max(13rem,min(17rem,56vw,32vh))] place-items-center rounded-full bg-brand text-brand-ink shadow-[0_0_60px_-10px_rgb(255_199_44/0.6)] transition-transform active:scale-95 disabled:opacity-40 ${!disabled ? "pulse-ring" : ""
              }`}
          >
            <span className="flex flex-col items-center gap-[max(0.25rem,min(0.5rem,1.2vh))]">
              {sent ? (
                <Check size={52} className="grow-in size-[max(2.5rem,min(4.25rem,15vw,8.5vh))]" />
              ) : (
                <BellRing size={52} className="size-[max(2.5rem,min(4.25rem,15vw,8.5vh))]" />
              )}
              <span className="px-[12%] text-center text-[max(1.05rem,min(1.4rem,5.5vw,2.9vh))] font-bold leading-tight">
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

        <BillCard />

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
