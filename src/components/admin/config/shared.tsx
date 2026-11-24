"use client";

import type { BoardGame, RestaurantSettings } from "@/lib/types";

export interface ConfigData {
  me: { id: number };
  business: {
    name: string;
    tagline: string;
    googleReviewUrl: string;
    menuFile: string | null;
    settings: RestaurantSettings;
  };
  prizes: { id: number; name: string; weight: number; stock: number | null; active: number }[];
  boardGames: BoardGame[];
  tables: { id: number; number: number; area: string; token: string; active: number }[];
  staff: { id: number; username: string; name: string; role: "owner" | "staff"; active: number }[];
}

/** POST JSON o FormData; devuelve el mensaje de error o null si salió bien. */
export async function send(url: string, body: object | FormData): Promise<string | null> {
  const isForm = body instanceof FormData;
  const res = await fetch(url, {
    method: "POST",
    headers: isForm ? undefined : { "Content-Type": "application/json" },
    body: isForm ? body : JSON.stringify(body),
  }).catch(() => null);
  if (!res) return "Sin conexión.";
  if (res.ok) return null;
  // El hosting rechaza archivos grandes antes de llegar a la app (Vercel: 4.5 MB).
  if (res.status === 413) return "El archivo es demasiado grande. Usa uno de máximo 4 MB (comprime el PDF o la imagen).";
  const data = await res.json().catch(() => null);
  return data?.error ?? "No se pudo guardar.";
}

export function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="card space-y-4 p-5">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {desc && <p className="text-sm text-muted">{desc}</p>}
      </div>
      {children}
    </section>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? "bg-brand" : "bg-line"}`}
    >
      <span className={`absolute top-1 size-5 rounded-full bg-white shadow transition-all ${checked ? "left-6" : "left-1"}`} />
    </button>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm text-muted">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted/80">{hint}</span>}
    </label>
  );
}

export function useFlash() {
  return (msg: string | null, ok = "Guardado ✓") => {
    if (msg) alert(msg);
    else {
      const el = document.getElementById("toast");
      if (el) {
        el.textContent = ok;
        el.dataset.show = "1";
        setTimeout(() => (el.dataset.show = ""), 1800);
      }
    }
  };
}
