"use client";

import { useCallback, useEffect, useState } from "react";
import { BookOpen, Building2, Dices, Gift, LayoutGrid, Users } from "lucide-react";
import type { ConfigData } from "./shared";
import { GamesTab } from "./GamesTab";
import { LudotecaTab } from "./LudotecaTab";
import { MenuTab, MesasTab, NegocioTab, PersonalTab } from "./OtherTabs";

const TABS = [
  { key: "juegos", label: "Juegos y premios", icon: <Gift size={16} /> },
  { key: "ludoteca", label: "Ludoteca", icon: <Dices size={16} /> },
  { key: "menu", label: "Menú", icon: <BookOpen size={16} /> },
  { key: "mesas", label: "Mesas", icon: <LayoutGrid size={16} /> },
  { key: "negocio", label: "Negocio", icon: <Building2 size={16} /> },
  { key: "personal", label: "Personal", icon: <Users size={16} /> },
] as const;

type Tab = (typeof TABS)[number]["key"];

async function fetchConfig(): Promise<ConfigData | null> {
  const res = await fetch("/api/admin/config", { cache: "no-store" }).catch(() => null);
  return res?.ok ? ((await res.json()) as ConfigData) : null;
}

export function ConfigApp() {
  const [tab, setTab] = useState<Tab>("juegos");
  const [data, setData] = useState<ConfigData | null>(null);
  const [version, setVersion] = useState(0);

  const reload = useCallback(
    () =>
      fetchConfig().then((d) => {
        if (d) {
          setData(d);
          setVersion((v) => v + 1);
        }
      }),
    [],
  );

  useEffect(() => {
    fetchConfig().then((d) => d && setData(d));
  }, []);

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Configuración</h1>
      <div className="no-scrollbar -mx-4 mb-5 flex gap-2 overflow-x-auto px-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`inline-flex shrink-0 items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors ${
              tab === t.key ? "border-brand bg-brand text-brand-ink" : "border-line text-muted hover:text-cream"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {!data ? (
        <p className="text-muted">Cargando…</p>
      ) : (
        // `key` reinicia los formularios con los datos frescos después de guardar.
        <div key={`${tab}-${version}`} className="max-w-4xl">
          {tab === "juegos" && <GamesTab data={data} reload={reload} />}
          {tab === "ludoteca" && <LudotecaTab data={data} reload={reload} />}
          {tab === "menu" && <MenuTab data={data} reload={reload} />}
          {tab === "mesas" && <MesasTab data={data} reload={reload} />}
          {tab === "negocio" && <NegocioTab data={data} reload={reload} />}
          {tab === "personal" && <PersonalTab data={data} reload={reload} />}
        </div>
      )}

      <div
        id="toast"
        className="pointer-events-none fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-ok px-5 py-2.5 font-semibold text-ink opacity-0 transition-opacity data-[show='1']:opacity-100"
      />
    </div>
  );
}
