"use client";

import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import type { Kpis, Stats, StatsRange } from "@/lib/stats";
import type { RewardGame } from "@/lib/types";
import { ColumnChart, RankedBars, type Column } from "./charts";

const RANGES: { key: StatsRange; label: string; prev: string }[] = [
  { key: "hoy", label: "Hoy", prev: "ayer a esta hora" },
  { key: "7d", label: "7 días", prev: "los 7 días anteriores" },
  { key: "30d", label: "30 días", prev: "los 30 días anteriores" },
];

const GAME_NAMES: Record<RewardGame, string> = { ruleta: "Ruleta", rasca: "Rasca y gana", gato: "Gato" };
const fmt = new Intl.NumberFormat("es-MX");

function duration(sec: number | null): string {
  if (sec === null) return "—";
  const s = Math.round(sec);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${String(s % 60).padStart(2, "0")} s`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

function minutes(min: number | null): string {
  if (min === null) return "—";
  const m = Math.round(min);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

type Better = "up" | "down" | "neutral";

/** Cambio contra el periodo anterior. El color depende de si subir es bueno; siempre lleva flecha y signo. */
function Delta({ cur, prev, better, prevLabel }: { cur: number | null; prev: number | null; better: Better; prevLabel: string }) {
  if (cur === null || prev === null || (cur === 0 && prev === 0)) {
    return <p className="text-xs text-muted">Sin datos para comparar</p>;
  }
  if (prev === 0) return <p className="text-xs text-muted">Nuevo · antes 0 ({prevLabel})</p>;
  const pct = ((cur - prev) / prev) * 100;
  const rounded = Math.round(pct);
  if (rounded === 0) return <p className="text-xs text-muted">= igual que {prevLabel}</p>;
  const up = rounded > 0;
  const good = better === "neutral" ? null : (better === "up") === up;
  const color = good === null ? "text-muted" : good ? "text-ok" : "text-danger";
  return (
    <p className={`text-xs ${color}`}>
      <span aria-hidden>{up ? "▲" : "▼"}</span> {up ? "+" : "−"}
      {Math.abs(rounded)} % <span className="text-muted">vs {prevLabel}</span>
    </p>
  );
}

function Tile({
  label,
  value,
  sub,
  delta,
}: {
  label: string;
  value: string;
  sub?: string;
  delta: React.ReactNode;
}) {
  return (
    <div className="card p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-3xl font-semibold leading-tight">{value}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
      <div className="mt-2">{delta}</div>
    </div>
  );
}

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="card break-inside-avoid p-5">
      <h2 className="font-semibold">{title}</h2>
      {sub && <p className="mb-4 text-xs text-muted">{sub}</p>}
      {!sub && <div className="mb-4" />}
      {children}
    </section>
  );
}

async function fetchStats(range: StatsRange): Promise<Stats | null> {
  const res = await fetch(`/api/admin/stats?range=${range}`, { cache: "no-store" }).catch(() => null);
  return res?.ok ? ((await res.json()) as Stats) : null;
}

export function StatsDashboard({ businessName }: { businessName: string }) {
  const [range, setRange] = useState<StatsRange>("7d");
  const [data, setData] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetchStats(range).then((d) => {
      if (!alive) return;
      if (d) setData(d);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [range]);

  function choose(r: StatsRange) {
    if (r === range) return;
    setLoading(true); // se conserva la vista anterior atenuada mientras carga
    setRange(r);
  }

  const meta = RANGES.find((r) => r.key === range)!;
  const tz = data?.timezone ?? "America/Tijuana";
  const dateFmt = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", timeZone: tz });
  const period = data
    ? range === "hoy"
      ? `Hoy, ${dateFmt.format(new Date(data.end))}`
      : `Del ${dateFmt.format(new Date(data.start))} al ${dateFmt.format(new Date(data.end))}`
    : "";

  return (
    <div className="print-report">
      {/* Filtros: una sola fila arriba de todo */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="mr-2 text-2xl font-bold">Estadísticas</h1>
        <div className="no-print flex gap-1 rounded-xl border border-line p-1" role="tablist" aria-label="Periodo">
          {RANGES.map((r) => (
            <button
              key={r.key}
              role="tab"
              aria-selected={range === r.key}
              onClick={() => choose(r.key)}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
                range === r.key ? "bg-brand text-brand-ink" : "text-muted hover:text-cream"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <button onClick={() => window.print()} className="no-print btn-ghost ml-auto inline-flex items-center gap-2 px-4 py-2 text-sm">
          <Printer size={16} /> Imprimir reporte
        </button>
      </div>

      {!data ? (
        <p className="text-muted">{loading ? "Cargando…" : "No se pudieron cargar las estadísticas."}</p>
      ) : (
        <div className={`space-y-6 transition-opacity ${loading ? "opacity-50" : ""}`}>
          <div>
            <p className="hidden text-lg font-bold print:block">{businessName} · Reporte de uso</p>
            <p className="text-sm text-muted">
              {period} · comparado con {meta.prev}
            </p>
          </div>

          <KpiRow cur={data.current} prev={data.previous} prevLabel={meta.prev} />

          {range !== "hoy" && (
            <Card title="Mesas atendidas por día" sub="Mesas que se conectaron con el QR o NFC">
              <ColumnChart
                unit="mesas"
                labelEvery={range === "30d" ? 5 : 1}
                data={data.daily.map((d): Column => {
                  const date = new Date(`${d.day}T12:00:00Z`);
                  return {
                    key: d.day,
                    label: new Intl.DateTimeFormat("es-MX", {
                      ...(range === "30d" ? { day: "numeric", month: "short" } : { weekday: "short", day: "numeric" }),
                      timeZone: "UTC",
                    }).format(date),
                    fullLabel: new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(date),
                    value: d.visits,
                  };
                })}
              />
            </Card>
          )}

          <Card title="Horas pico" sub="Solicitudes al personal (llamadas, juegos, cuentas y recomendaciones) por hora del día (hora del café)">
            <HourChart hourly={data.hourly} />
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Juegos más pedidos">
              <RankedBars
                unit="pedidos"
                empty="Nadie ha pedido juegos en este periodo."
                rows={data.topGames.map((g) => ({ label: g.name, value: g.n }))}
              />
            </Card>
            <Card title="Mesas con más solicitudes">
              <RankedBars
                unit="solicitudes"
                empty="Sin solicitudes en este periodo."
                rows={data.topTables.map((t) => ({ label: `Mesa ${t.number}`, sub: t.area || undefined, value: t.n }))}
              />
            </Card>
            <Card title="Premios entregados">
              <RankedBars
                unit="entregados"
                empty="Nadie ha ganado premios en este periodo."
                rows={data.prizes.map((p) => ({ label: p.name, value: p.n }))}
              />
            </Card>
            <Card title="Recomendaciones más pedidas">
              <RankedBars
                unit="pedidas"
                empty="Nadie ha pedido recomendaciones en este periodo."
                rows={data.topPromos.map((p) => ({ label: p.name, value: p.n }))}
              />
            </Card>
          </div>

          <Card title="Juegos de premio" sub="Resultado real de cada juego en el periodo">
            {data.byGame.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted">Nadie ha jugado por el premio en este periodo.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted">
                    <tr>
                      <th className="py-2 font-medium">Juego</th>
                      <th className="py-2 text-right font-medium">Partidas</th>
                      <th className="py-2 text-right font-medium">Ganadas</th>
                      <th className="py-2 text-right font-medium">% real de premio</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {data.byGame.map((g) => (
                      <tr key={g.game}>
                        <td className="py-2">{GAME_NAMES[g.game]}</td>
                        <td className="py-2 text-right tabular-nums">{fmt.format(g.played)}</td>
                        <td className="py-2 text-right tabular-nums">{fmt.format(g.won)}</td>
                        <td className="py-2 text-right tabular-nums">{g.played ? Math.round((g.won / g.played) * 100) : 0} %</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-xs text-muted">
                  Con pocas partidas el % real puede variar bastante respecto al configurado; se acerca conforme juegan más mesas.
                </p>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

function KpiRow({ cur, prev, prevLabel }: { cur: Kpis; prev: Kpis; prevLabel: string }) {
  const winRate = cur.prizesPlayed ? Math.round((cur.prizesWon / cur.prizesPlayed) * 100) : null;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile
        label="Mesas atendidas"
        value={fmt.format(cur.visits)}
        delta={<Delta cur={cur.visits} prev={prev.visits} better="up" prevLabel={prevLabel} />}
      />
      <Tile
        label="Tiempo de respuesta típico"
        value={duration(cur.medianResponseSec)}
        sub={cur.avgResponseSec !== null ? `Promedio ${duration(cur.avgResponseSec)}` : "Desde que piden hasta que el mesero responde"}
        delta={<Delta cur={cur.medianResponseSec} prev={prev.medianResponseSec} better="down" prevLabel={prevLabel} />}
      />
      <Tile
        label="Llamadas al mesero"
        value={fmt.format(cur.waiterCalls)}
        delta={<Delta cur={cur.waiterCalls} prev={prev.waiterCalls} better="neutral" prevLabel={prevLabel} />}
      />
      <Tile
        label="Juegos de mesa pedidos"
        value={fmt.format(cur.gameRequests)}
        delta={<Delta cur={cur.gameRequests} prev={prev.gameRequests} better="up" prevLabel={prevLabel} />}
      />
      <Tile
        label="Clics para dejar reseña"
        value={fmt.format(cur.reviewClicks)}
        delta={<Delta cur={cur.reviewClicks} prev={prev.reviewClicks} better="up" prevLabel={prevLabel} />}
      />
      <Tile
        label="Vistas del menú"
        value={fmt.format(cur.menuViews)}
        delta={<Delta cur={cur.menuViews} prev={prev.menuViews} better="up" prevLabel={prevLabel} />}
      />
      <Tile
        label="Premios entregados"
        value={fmt.format(cur.prizesWon)}
        sub={winRate !== null ? `de ${fmt.format(cur.prizesPlayed)} partidas (${winRate} %)` : "Sin partidas"}
        delta={<Delta cur={cur.prizesWon} prev={prev.prizesWon} better="neutral" prevLabel={prevLabel} />}
      />
      <Tile
        label="Estancia promedio"
        value={minutes(cur.avgStayMin)}
        sub="De mesas ya cerradas"
        delta={<Delta cur={cur.avgStayMin} prev={prev.avgStayMin} better="neutral" prevLabel={prevLabel} />}
      />
    </div>
  );
}

/** Horas pico: de 6 h a 23 h, ampliando si hubo actividad en la madrugada. */
function HourChart({ hourly }: { hourly: Stats["hourly"] }) {
  const firstActive = hourly.find((h) => h.requests > 0)?.hour ?? 6;
  const from = Math.min(6, firstActive);
  const rows = hourly.filter((h) => h.hour >= from);
  const hourLabel = (h: number) => `${h}:00`;
  return (
    <>
      <ColumnChart
        unit="solicitudes"
        labelEvery={3}
        data={rows.map(
          (h): Column => ({
            key: String(h.hour),
            label: `${h.hour}h`,
            fullLabel: `${hourLabel(h.hour)} – ${hourLabel((h.hour + 1) % 24)}`,
            value: h.requests,
          }),
        )}
      />
      {rows.every((h) => h.requests === 0) && (
        <p className="mt-2 text-center text-xs text-muted">Sin solicitudes en este periodo.</p>
      )}
    </>
  );
}
