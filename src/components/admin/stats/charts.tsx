"use client";

import { useState } from "react";

/** Redondea hacia arriba a un número "limpio" para el eje (1, 2, 5, 10, 20, 50…). */
function niceMax(v: number): number {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

const fmt = new Intl.NumberFormat("es-MX");

export interface Column {
  key: string;
  /** Texto bajo la columna (puede omitirse en algunas para no amontonar). */
  label: string;
  /** Texto completo para el tooltip y la tabla. */
  fullLabel: string;
  value: number;
}

/**
 * Gráfica de columnas de una sola serie: columnas de máximo 24px, esquina redondeada arriba
 * y recta en la base, cuadrícula tenue, valor solo en la columna más alta y tooltip al pasar
 * el cursor o con el teclado. Debajo, "Ver tabla" con todos los valores.
 */
export function ColumnChart({
  data,
  labelEvery = 1,
  unit,
  height = 180,
}: {
  data: Column[];
  labelEvery?: number;
  unit: string;
  height?: number;
}) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(0, ...data.map((d) => d.value));
  const top = niceMax(max);
  const peak = data.findIndex((d) => d.value === max && max > 0);
  const ticks = [top, top / 2, 0];

  return (
    <div>
      <div className="flex gap-2">
        {/* Eje Y */}
        <div className="relative w-7 shrink-0 text-right text-[11px] tabular-nums text-muted" style={{ height }}>
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${(1 - t / top) * 100}%` }}>
              {fmt.format(t)}
            </span>
          ))}
        </div>

        <div className="relative min-w-0 flex-1">
          {/* Cuadrícula: líneas finas y discretas */}
          <div className="pointer-events-none absolute inset-x-0 top-0" style={{ height }} aria-hidden>
            {ticks.map((t) => (
              <div key={t} className="absolute inset-x-0 h-px bg-line" style={{ top: `${(1 - t / top) * 100}%` }} />
            ))}
          </div>

          <div className="relative flex items-end gap-0.5" style={{ height }} onMouseLeave={() => setActive(null)}>
            {data.map((d, i) => {
              const h = top ? (d.value / top) * 100 : 0;
              const isActive = active === i;
              return (
                <button
                  key={d.key}
                  type="button"
                  className="group relative flex h-full min-w-0 flex-1 items-end justify-center outline-none"
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  aria-label={`${d.fullLabel}: ${fmt.format(d.value)} ${unit}`}
                >
                  {d.value > 0 && (
                    <span
                      className={`bar block w-full max-w-6 rounded-t-[4px] transition-colors ${
                        isActive ? "bg-[#ffd866]" : "bg-brand"
                      } group-focus-visible:ring-2 group-focus-visible:ring-cream`}
                      style={{ height: `${h}%` }}
                    />
                  )}
                  {i === peak && !isActive && (
                    <span
                      className="absolute left-1/2 -translate-x-1/2 -translate-y-1 text-[11px] font-semibold text-cream"
                      style={{ bottom: `${h}%` }}
                    >
                      {fmt.format(d.value)}
                    </span>
                  )}
                  {isActive && (
                    <span
                      className={`pointer-events-none absolute z-10 mb-2 whitespace-nowrap rounded-lg border border-line bg-ink px-2.5 py-1.5 text-left shadow-lg ${
                        // en las orillas se alinea hacia adentro para no salirse de la gráfica
                        i < 2 ? "left-0" : i > data.length - 3 ? "right-0" : "left-1/2 -translate-x-1/2"
                      }`}
                      style={{ bottom: `${h}%` }}
                      role="tooltip"
                    >
                      <span className="block text-sm font-bold text-cream">
                        {fmt.format(d.value)} {unit}
                      </span>
                      <span className="block text-xs text-muted">{d.fullLabel}</span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Eje X */}
          <div className="mt-1.5 flex gap-0.5 text-[11px] text-muted">
            {data.map((d, i) => (
              // la etiqueta se centra bajo su columna y puede salir de su espacio (nunca se recorta);
              // labelEvery deja hueco suficiente entre etiquetas vecinas
              <span key={d.key} className="relative h-4 min-w-0 flex-1">
                {i % labelEvery === 0 && (
                  <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap">{d.label}</span>
                )}
              </span>
            ))}
          </div>
        </div>
      </div>

      <DataTable rows={data.map((d) => [d.fullLabel, fmt.format(d.value)])} headers={["", unit]} />
    </div>
  );
}

/** Barras horizontales ordenadas de mayor a menor (un solo color), valor al final de cada barra. */
export function RankedBars({ rows, unit, empty }: { rows: { label: string; sub?: string; value: number }[]; unit: string; empty: string }) {
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-muted">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.value));
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label + (r.sub ?? "")}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">
              {r.label}
              {r.sub && <span className="text-muted"> · {r.sub}</span>}
            </span>
            <span className="shrink-0 font-semibold tabular-nums" aria-label={`${r.value} ${unit}`}>
              {fmt.format(r.value)}
            </span>
          </div>
          <div className="h-2.5 w-full" aria-hidden>
            <div className="bar h-full rounded-r-[4px] bg-brand" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function DataTable({ rows, headers }: { rows: (string | number)[][]; headers: string[] }) {
  return (
    <details className="no-print mt-3">
      <summary className="cursor-pointer text-xs text-muted hover:text-cream">Ver tabla</summary>
      <div className="mt-2 max-h-64 overflow-auto rounded-xl border border-line">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-surface-2 text-left text-xs text-muted">
            <tr>
              {headers.map((h, i) => (
                <th key={i} className={`px-3 py-2 font-medium ${i > 0 ? "text-right" : ""}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j} className={`px-3 py-1.5 ${j > 0 ? "text-right tabular-nums" : ""}`}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
