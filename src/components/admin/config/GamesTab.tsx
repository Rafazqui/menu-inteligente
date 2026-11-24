"use client";

import { useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import type { RestaurantSettings, RewardGame } from "@/lib/types";
import { Section, send, Toggle, useFlash, type ConfigData } from "./shared";

const GAME_INFO: Record<RewardGame, { name: string; chanceLabel: string }> = {
  ruleta: { name: "Ruleta", chanceLabel: "Probabilidad de ganar" },
  rasca: { name: "Rasca y gana", chanceLabel: "Probabilidad de ganar" },
  gato: { name: "Gato vs. la máquina", chanceLabel: "Probabilidad de que la máquina se deje ganar" },
};

export function GamesTab({ data, reload }: { data: ConfigData; reload: () => void }) {
  const flash = useFlash();
  const [settings, setSettings] = useState<RestaurantSettings>(data.business.settings);
  const [prizes, setPrizes] = useState(data.prizes.map((p) => ({ ...p, stock: p.stock as number | null | "" })));
  const totalWeight = prizes.filter((p) => p.active && p.weight > 0 && (p.stock === null || p.stock === "" || Number(p.stock) > 0)).reduce((s, p) => s + Number(p.weight), 0);

  function setGame(g: RewardGame, patch: Partial<RestaurantSettings["games"][RewardGame]>) {
    setSettings((s) => ({ ...s, games: { ...s.games, [g]: { ...s.games[g], ...patch } } }));
  }

  async function saveGames() {
    flash(await send("/api/admin/config", { settings: { games: settings.games } }));
    reload();
  }

  async function savePrize(i: number) {
    const p = prizes[i];
    flash(
      await send("/api/admin/config/prizes", {
        action: "save",
        id: p.id || undefined,
        name: p.name,
        weight: Number(p.weight),
        stock: p.stock === "" ? null : p.stock,
        active: Boolean(p.active),
      }),
    );
    reload();
  }

  async function deletePrize(i: number) {
    const p = prizes[i];
    if (!p.id) return setPrizes((ps) => ps.filter((_, j) => j !== i));
    if (!confirm(`¿Eliminar "${p.name}"?`)) return;
    flash(await send("/api/admin/config/prizes", { action: "delete", id: p.id }), "Eliminado");
    reload();
  }

  return (
    <div className="space-y-6">
      <Section
        title="Juegos de premio"
        desc="Cada mesa tiene un intento por visita. El resultado se decide en el servidor con estas probabilidades."
      >
        <div className="space-y-5">
          {(Object.keys(GAME_INFO) as RewardGame[]).map((g) => (
            <div key={g} className="rounded-2xl border border-line p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold">{GAME_INFO[g].name}</p>
                <Toggle checked={settings.games[g].enabled} onChange={(v) => setGame(g, { enabled: v })} label={`Activar ${GAME_INFO[g].name}`} />
              </div>
              <div className={`mt-3 ${settings.games[g].enabled ? "" : "opacity-40"}`}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-muted">{GAME_INFO[g].chanceLabel}</span>
                  <span className="text-2xl font-bold text-brand tabular-nums">{settings.games[g].winChance}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={settings.games[g].winChance}
                  onChange={(e) => setGame(g, { winChance: Number(e.target.value) })}
                  className="mt-2 w-full accent-[#ffc72c]"
                  disabled={!settings.games[g].enabled}
                />
                <p className="text-xs text-muted">
                  {g === "gato" ? (
                    <>
                      En aprox. <b className="text-cream">{settings.games[g].winChance}</b> de cada 100 partidas la máquina se equivoca a propósito; el
                      cliente aún debe completar su línea para ganar. En el resto es imposible vencerla.
                    </>
                  ) : (
                    <>
                      De cada 100 mesas que jueguen, aprox. <b className="text-cream">{settings.games[g].winChance}</b> se llevan premio.
                    </>
                  )}
                </p>
              </div>
            </div>
          ))}
        </div>
        <button onClick={saveGames} className="btn-brand inline-flex items-center gap-2 px-5 py-2.5">
          <Save size={18} /> Guardar probabilidades
        </button>
      </Section>

      <Section
        title="Premios"
        desc="Cuando alguien gana, se elige uno de estos premios según su peso. Deja las existencias vacías para ilimitado."
      >
        <div className="space-y-3">
          {prizes.map((p, i) => {
            const share = p.active && totalWeight ? Math.round((Number(p.weight) / totalWeight) * 100) : 0;
            return (
              <div key={p.id || `new${i}`} className="grid grid-cols-2 items-end gap-3 rounded-2xl border border-line p-3 sm:grid-cols-[2fr_1fr_1fr_auto_auto]">
                <label className="col-span-2 space-y-1 sm:col-span-1">
                  <span className="text-xs text-muted">Premio</span>
                  <input className="input" value={p.name} maxLength={50} onChange={(e) => setPrizes((ps) => ps.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-muted">Peso ({share}% de los premios)</span>
                  <input className="input" type="number" min={0} value={p.weight} onChange={(e) => setPrizes((ps) => ps.map((x, j) => (j === i ? { ...x, weight: Number(e.target.value) } : x)))} />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-muted">Existencias</span>
                  <input className="input" type="number" min={0} placeholder="∞" value={p.stock ?? ""} onChange={(e) => setPrizes((ps) => ps.map((x, j) => (j === i ? { ...x, stock: e.target.value === "" ? "" : Number(e.target.value) } : x)))} />
                </label>
                <div className="flex items-center gap-2 pb-2">
                  <Toggle checked={Boolean(p.active)} onChange={(v) => setPrizes((ps) => ps.map((x, j) => (j === i ? { ...x, active: v ? 1 : 0 } : x)))} label="Activo" />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => savePrize(i)} className="btn-brand grid size-11 place-items-center" aria-label="Guardar premio"><Save size={18} /></button>
                  <button onClick={() => deletePrize(i)} className="btn-ghost grid size-11 place-items-center" aria-label="Eliminar premio"><Trash2 size={18} /></button>
                </div>
              </div>
            );
          })}
        </div>
        <button
          onClick={() => setPrizes((ps) => [...ps, { id: 0, name: "", weight: 1, stock: "", active: 1 }])}
          className="btn-ghost inline-flex items-center gap-2 px-4 py-2.5"
        >
          <Plus size={18} /> Agregar premio
        </button>
      </Section>
    </div>
  );
}
