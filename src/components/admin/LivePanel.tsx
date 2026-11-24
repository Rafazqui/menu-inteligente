"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BellRing, Check, Dices, Footprints, Gift, Smartphone, Volume2, VolumeX, X } from "lucide-react";
import type { OverviewRequest, OverviewTable } from "@/lib/admin";
import { timeAgo } from "@/components/mesa/RequestStatus";

interface Overview {
  tables: OverviewTable[];
  active: OverviewRequest[];
  recent: OverviewRequest[];
}

const TYPE: Record<OverviewRequest["type"], { label: string; icon: React.ReactNode; cls: string }> = {
  waiter: { label: "Llama al mesero", icon: <BellRing size={20} />, cls: "bg-brand text-brand-ink" },
  boardgame: { label: "Pide un juego", icon: <Dices size={20} />, cls: "bg-info/20 text-info" },
  prize: { label: "Ganó un premio", icon: <Gift size={20} />, cls: "bg-ok/20 text-ok" },
};

const SOUND_KEY = "hr-panel-sonido";

/** Pitido corto generado con WebAudio (no requiere archivos). */
function useBeep() {
  const ctx = useRef<AudioContext | null>(null);
  // El panel solo se dibuja en el navegador (antes muestra "Cargando…"), así que leer localStorage aquí es seguro.
  const [enabled, setEnabled] = useState(() => {
    try {
      return localStorage.getItem(SOUND_KEY) === "1";
    } catch {
      return false;
    }
  });

  const unlock = useCallback(() => {
    if (!ctx.current) ctx.current = new AudioContext();
    ctx.current.resume();
  }, []);

  const toggle = useCallback(() => {
    unlock();
    setEnabled((e) => {
      try {
        localStorage.setItem(SOUND_KEY, e ? "0" : "1");
      } catch {}
      return !e;
    });
  }, [unlock]);

  const beep = useCallback(() => {
    if (!enabled) return;
    if (!ctx.current) ctx.current = new AudioContext();
    const ac = ctx.current;
    if (ac.state === "suspended") ac.resume();
    [0, 0.18].forEach((delay, i) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = "sine";
      o.frequency.value = i === 0 ? 880 : 1320;
      g.gain.setValueAtTime(0.0001, ac.currentTime + delay);
      g.gain.exponentialRampToValueAtTime(0.35, ac.currentTime + delay + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + delay + 0.25);
      o.connect(g).connect(ac.destination);
      o.start(ac.currentTime + delay);
      o.stop(ac.currentTime + delay + 0.3);
    });
  }, [enabled]);

  return { enabled, toggle, beep, unlock };
}

async function fetchOverview(): Promise<Overview | "unauth" | null> {
  const res = await fetch("/api/admin/overview", { cache: "no-store" }).catch(() => null);
  if (res?.status === 401) return "unauth";
  return res?.ok ? ((await res.json()) as Overview) : null;
}

export function LivePanel() {
  const router = useRouter();
  const [data, setData] = useState<Overview | null>(null);
  const [connected, setConnected] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [, tick] = useState(0);
  const { enabled, toggle, beep, unlock } = useBeep();
  const beepRef = useRef(beep);
  useEffect(() => {
    beepRef.current = beep;
  }, [beep]);

  const apply = useCallback(
    (d: Overview | "unauth" | null) => {
      if (d === "unauth") router.replace("/admin/login");
      else if (d) setData(d);
    },
    [router],
  );
  const load = useCallback(() => fetchOverview().then(apply), [apply]);

  // Tiempo real: el servidor avisa y recargamos el resumen.
  useEffect(() => {
    fetchOverview().then(apply);
    const es = new EventSource("/api/admin/stream");
    let timer: ReturnType<typeof setTimeout> | null = null;
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (m) => {
      setConnected(true);
      const evt = JSON.parse(m.data);
      if (evt.alert) {
        beepRef.current();
        navigator.vibrate?.([120, 60, 120]);
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(load, 120);
    };
    // Respaldo por si la conexión en tiempo real se cae.
    const poll = setInterval(load, 20_000);
    const clock = setInterval(() => tick((t) => t + 1), 30_000);
    return () => {
      es.close();
      clearInterval(poll);
      clearInterval(clock);
      if (timer) clearTimeout(timer);
    };
  }, [load, apply]);

  const pendingTables = data?.tables.filter((t) => t.session?.status === "pending") ?? [];
  const alertCount = (data?.active.filter((r) => r.status === "pending").length ?? 0) + pendingTables.length;

  useEffect(() => {
    document.title = alertCount ? `(${alertCount}) Panel · HR` : "Panel · HR";
  }, [alertCount]);

  async function setRequest(id: number, status: string) {
    await fetch(`/api/admin/requests/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  }

  async function tableAction(id: number, action: string) {
    const res = await fetch(`/api/admin/tables/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) alert((await res.json().catch(() => null))?.error ?? "No se pudo completar.");
    setSelected(null);
    load();
  }

  if (!data) return <p className="text-muted">Cargando…</p>;

  const areas = Array.from(new Set(data.tables.map((t) => t.area || "Sin área")));
  const sel = data.tables.find((t) => t.id === selected) ?? null;
  const requestsByTable = new Map<number, number>();
  for (const r of data.active) requestsByTable.set(r.table_number, (requestsByTable.get(r.table_number) ?? 0) + 1);

  return (
    <div onPointerDown={unlock}>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">En vivo</h1>
        <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs ${connected ? "bg-ok/15 text-ok" : "bg-danger/15 text-danger"}`}>
          <span className={`size-2 rounded-full ${connected ? "bg-ok" : "bg-danger"}`} />
          {connected ? "Conectado" : "Reconectando…"}
        </span>
        <button
          onClick={toggle}
          className={`ml-auto inline-flex items-center gap-2 px-4 py-2 text-sm ${enabled ? "btn-ghost" : "btn-brand pulse-ring"}`}
        >
          {enabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
          {enabled ? "Sonido activado" : "Activar sonido"}
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        {/* ---------- Alertas ---------- */}
        <section>
          <h2 className="mb-3 flex items-center gap-2 font-semibold">
            Alertas
            {alertCount > 0 && <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-brand-ink">{alertCount}</span>}
          </h2>

          <div className="space-y-3">
            {pendingTables.map((t) => (
              <article key={`t${t.id}`} className="card pop-in flex flex-wrap items-center gap-4 border-brand/60 p-4">
                <TableBadge n={t.number} area={t.area} pulse />
                <div className="min-w-40 flex-1">
                  <p className="flex items-center gap-2 font-semibold">
                    <Smartphone size={18} className="text-brand" /> Quiere conectarse
                  </p>
                  <p className="text-sm text-muted">Confirma que hay clientes en la mesa · {timeAgo(t.session!.since)}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => tableAction(t.id, "reject")} className="btn-ghost px-4 py-2.5 text-sm">Rechazar</button>
                  <button onClick={() => tableAction(t.id, "approve")} className="btn-brand px-4 py-2.5 text-sm">Aprobar</button>
                </div>
              </article>
            ))}

            {data.active.map((r) => (
              <article
                key={r.id}
                className={`card pop-in flex flex-wrap items-center gap-4 p-4 ${r.status === "pending" ? "border-brand/50" : ""}`}
              >
                <TableBadge n={r.table_number} area={r.area} pulse={r.status === "pending"} />
                <div className="min-w-40 flex-1">
                  <p className="flex items-center gap-2 font-semibold">
                    <span className={`grid size-8 place-items-center rounded-lg ${TYPE[r.type].cls}`}>{TYPE[r.type].icon}</span>
                    {TYPE[r.type].label}
                  </p>
                  {(r.game_name || r.message) && (
                    <p className="mt-1 text-lg leading-snug">{r.type === "boardgame" ? r.game_name : r.message}</p>
                  )}
                  <p className="text-xs text-muted">
                    {timeAgo(r.created_at)}
                    {r.status === "attending" && ` · en camino${r.handled_by_name ? ` (${r.handled_by_name})` : ""}`}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setRequest(r.id, "cancelled")} className="btn-ghost grid size-11 place-items-center" aria-label="Descartar" title="Descartar">
                    <X size={18} />
                  </button>
                  {r.status === "pending" && r.type !== "prize" && (
                    <button onClick={() => setRequest(r.id, "attending")} className="btn-ghost inline-flex items-center gap-2 px-4 py-2.5 text-sm">
                      <Footprints size={16} /> Voy
                    </button>
                  )}
                  <button onClick={() => setRequest(r.id, "done")} className="btn-brand inline-flex items-center gap-2 px-4 py-2.5 text-sm">
                    <Check size={16} /> {r.type === "prize" ? "Entregado" : "Listo"}
                  </button>
                </div>
              </article>
            ))}

            {data.active.length === 0 && pendingTables.length === 0 && (
              <div className="card p-8 text-center text-muted">Todo tranquilo por ahora ☕</div>
            )}
          </div>

          {data.recent.length > 0 && (
            <details className="mt-6">
              <summary className="cursor-pointer text-sm text-muted">Atendidas recientemente ({data.recent.length})</summary>
              <ul className="mt-2 divide-y divide-line rounded-2xl border border-line">
                {data.recent.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span className="w-16 font-semibold">Mesa {r.table_number}</span>
                    <span className="flex-1 truncate text-muted">
                      {TYPE[r.type].label}
                      {r.game_name ? ` · ${r.game_name}` : r.message ? ` · ${r.message}` : ""}
                    </span>
                    <span className="text-xs text-muted">{r.status === "cancelled" ? "Descartada" : r.handled_by_name ?? ""}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>

        {/* ---------- Mesas ---------- */}
        <section>
          <h2 className="mb-3 font-semibold">Mesas</h2>
          <div className="mb-3 flex flex-wrap gap-3 text-xs text-muted">
            <Legend cls="bg-surface-2 border-line" label="Libre" />
            <Legend cls="bg-brand/15 border-brand" label="Activa" />
            <Legend cls="bg-brand border-brand" label="Solicita" />
          </div>
          <div className="space-y-5">
            {areas.map((area) => (
              <div key={area}>
                <p className="mb-2 text-sm text-muted">{area}</p>
                <div className="grid grid-cols-5 gap-2 sm:grid-cols-6 lg:grid-cols-5 xl:grid-cols-6">
                  {data.tables
                    .filter((t) => (t.area || "Sin área") === area)
                    .map((t) => {
                      const st = t.session?.status;
                      const count = requestsByTable.get(t.number) ?? 0;
                      return (
                        <button
                          key={t.id}
                          onClick={() => setSelected(t.id)}
                          className={`relative grid aspect-square place-items-center rounded-2xl border text-lg font-bold transition-transform active:scale-95 ${
                            st === "pending"
                              ? "pulse-ring border-brand bg-brand text-brand-ink"
                              : st === "open"
                                ? "border-brand bg-brand/15 text-brand"
                                : "border-line bg-surface-2 text-muted"
                          }`}
                        >
                          {t.number}
                          {count > 0 && (
                            <span className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-danger text-[11px] text-ink">
                              {count}
                            </span>
                          )}
                        </button>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {sel && (
        <div className="overlay-in fixed inset-0 z-50 grid place-items-end bg-black/60 p-4 sm:place-items-center" onClick={() => setSelected(null)}>
          <div className="card grow-in w-full max-w-sm space-y-3 p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <TableBadge n={sel.number} area={sel.area} />
              <p className="text-muted">
                {sel.session?.status === "open"
                  ? `Activa ${timeAgo(sel.session.since)}`
                  : sel.session?.status === "pending"
                    ? "Esperando aprobación"
                    : "Libre"}
              </p>
            </div>
            {!sel.session && (
              <button onClick={() => tableAction(sel.id, "open")} className="btn-brand w-full py-3">Abrir mesa</button>
            )}
            {sel.session?.status === "pending" && (
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => tableAction(sel.id, "reject")} className="btn-ghost py-3">Rechazar</button>
                <button onClick={() => tableAction(sel.id, "approve")} className="btn-brand py-3">Aprobar</button>
              </div>
            )}
            {sel.session?.status === "open" && (
              <>
                {sel.session.reward_used === 1 && (
                  <button onClick={() => tableAction(sel.id, "grant_reward")} className="btn-ghost flex w-full items-center justify-center gap-2 py-3">
                    <Gift size={18} /> Regalar otro intento de premio
                  </button>
                )}
                <button onClick={() => tableAction(sel.id, "close")} className="btn-brand w-full py-3">
                  Cerrar mesa (ya se fueron)
                </button>
                <p className="text-center text-xs text-muted">Al cerrarla, los celulares de esa mesa se desconectan.</p>
              </>
            )}
            <button onClick={() => setSelected(null)} className="w-full py-2 text-sm text-muted">Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}

function TableBadge({ n, area, pulse }: { n: number; area: string; pulse?: boolean }) {
  return (
    <div className={`grid size-16 shrink-0 place-items-center rounded-2xl bg-brand text-brand-ink ${pulse ? "pulse-ring" : ""}`}>
      <div className="text-center leading-none">
        <p className="text-[10px] font-bold uppercase">Mesa</p>
        <p className="text-2xl font-black">{n}</p>
        {area && <p className="mt-0.5 max-w-14 truncate text-[9px] font-semibold opacity-70">{area}</p>}
      </div>
    </div>
  );
}

function Legend({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`size-3 rounded border ${cls}`} /> {label}
    </span>
  );
}
