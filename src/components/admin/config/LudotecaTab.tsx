"use client";

import { useState } from "react";
import { Dices, Pencil, Plus, Trash2 } from "lucide-react";
import { playersLabel, uploadUrl, type BoardGame } from "@/lib/types";
import { Field, Section, send, Toggle, useFlash, type ConfigData } from "./shared";

type Draft = Partial<BoardGame> & { coverPreview?: string | null; backPreview?: string | null };

export function LudotecaTab({ data, reload }: { data: ConfigData; reload: () => void }) {
  const [editing, setEditing] = useState<Draft | null>(null);
  const flash = useFlash();

  async function remove(g: BoardGame) {
    if (!confirm(`¿Eliminar "${g.name}" de la ludoteca?`)) return;
    const fd = new FormData();
    fd.set("action", "delete");
    fd.set("id", String(g.id));
    flash(await send("/api/admin/config/boardgames", fd), "Eliminado");
    reload();
  }

  async function toggleAvailable(g: BoardGame) {
    const fd = new FormData();
    for (const k of ["id", "name", "genre", "summary", "min_players", "max_players", "minutes"] as const) fd.set(k, String(g[k]));
    fd.set("available", g.available ? "0" : "1");
    flash(await send("/api/admin/config/boardgames", fd));
    reload();
  }

  return (
    <div className="space-y-6">
      <Section title="Ludoteca" desc="Sube una foto de la portada y de la contraportada de cada caja. Formato vertical (2:3) se ve mejor.">
        <button onClick={() => setEditing({ min_players: 2, max_players: 4, minutes: 30, available: 1 })} className="btn-brand inline-flex items-center gap-2 px-4 py-2.5">
          <Plus size={18} /> Agregar juego
        </button>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.boardGames.map((g) => (
            <li key={g.id} className="flex gap-3 rounded-2xl border border-line p-3">
              <div className="aspect-[2/3] w-16 shrink-0 overflow-hidden rounded-lg bg-surface-2">
                {g.cover_file ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={uploadUrl(g.cover_file)!} alt="" className="size-full object-cover" />
                ) : (
                  <div className="grid size-full place-items-center text-muted"><Dices size={20} /></div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{g.name}</p>
                <p className="truncate text-xs text-muted">{playersLabel(g.min_players, g.max_players)} · {g.genre || "Sin género"}</p>
                <div className="mt-2 flex items-center gap-2">
                  <Toggle checked={Boolean(g.available)} onChange={() => toggleAvailable(g)} label="Disponible" />
                  <span className="text-xs text-muted">{g.available ? "Disponible" : "No disponible"}</span>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <button onClick={() => setEditing({ ...g, coverPreview: uploadUrl(g.cover_file), backPreview: uploadUrl(g.back_file) })} className="btn-ghost grid size-9 place-items-center" aria-label="Editar"><Pencil size={16} /></button>
                <button onClick={() => remove(g)} className="btn-ghost grid size-9 place-items-center" aria-label="Eliminar"><Trash2 size={16} /></button>
              </div>
            </li>
          ))}
        </ul>
      </Section>
      {editing && <GameForm draft={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </div>
  );
}

function GameForm({ draft, onClose, onSaved }: { draft: Draft; onClose: () => void; onSaved: () => void }) {
  const [d, setD] = useState<Draft>(draft);
  const [cover, setCover] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const flash = useFlash();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData();
    if (d.id) fd.set("id", String(d.id));
    fd.set("name", d.name ?? "");
    fd.set("genre", d.genre ?? "");
    fd.set("summary", d.summary ?? "");
    fd.set("min_players", String(d.min_players ?? 2));
    fd.set("max_players", String(d.max_players ?? 4));
    fd.set("minutes", String(d.minutes ?? 30));
    fd.set("available", d.available ? "1" : "0");
    if (cover) fd.set("cover", cover);
    if (back) fd.set("back", back);
    const err = await send("/api/admin/config/boardgames", fd);
    setSaving(false);
    if (err) setError(err);
    else {
      flash(null);
      onSaved();
    }
  }

  const pick = (setter: (f: File | null) => void, key: "coverPreview" | "backPreview") => (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setter(f);
    setD((x) => ({ ...x, [key]: f ? URL.createObjectURL(f) : x[key] }));
  };

  return (
    <div className="overlay-in fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 p-4" onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="card grow-in my-8 w-full max-w-xl space-y-4 p-5">
        <h3 className="text-lg font-semibold">{d.id ? "Editar juego" : "Nuevo juego"}</h3>
        <div className="grid grid-cols-2 gap-4">
          <ImagePick label="Portada" preview={d.coverPreview} onChange={pick(setCover, "coverPreview")} />
          <ImagePick label="Contraportada" preview={d.backPreview} onChange={pick(setBack, "backPreview")} />
        </div>
        <Field label="Nombre">
          <input className="input" required maxLength={60} value={d.name ?? ""} onChange={(e) => setD({ ...d, name: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Género">
            <input className="input" maxLength={40} value={d.genre ?? ""} onChange={(e) => setD({ ...d, genre: e.target.value })} />
          </Field>
          <Field label="Mín. jugadores">
            <input className="input" type="number" min={1} max={30} value={d.min_players ?? 2} onChange={(e) => setD({ ...d, min_players: Number(e.target.value) })} />
          </Field>
          <Field label="Máx. jugadores">
            <input className="input" type="number" min={1} max={30} value={d.max_players ?? 4} onChange={(e) => setD({ ...d, max_players: Number(e.target.value) })} />
          </Field>
          <Field label="Minutos">
            <input className="input" type="number" min={1} max={600} value={d.minutes ?? 30} onChange={(e) => setD({ ...d, minutes: Number(e.target.value) })} />
          </Field>
        </div>
        <Field label="Mini resumen" hint={`${(d.summary ?? "").length}/400`}>
          <textarea className="input min-h-24" maxLength={400} value={d.summary ?? ""} onChange={(e) => setD({ ...d, summary: e.target.value })} />
        </Field>
        <div className="flex items-center gap-3">
          <Toggle checked={Boolean(d.available)} onChange={(v) => setD({ ...d, available: v ? 1 : 0 })} label="Disponible" />
          <span className="text-sm">Disponible para pedir</span>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost px-4 py-2.5">Cancelar</button>
          <button disabled={saving} className="btn-brand px-5 py-2.5">{saving ? "Guardando…" : "Guardar"}</button>
        </div>
      </form>
    </div>
  );
}

function ImagePick({ label, preview, onChange }: { label: string; preview?: string | null; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <label className="block cursor-pointer space-y-1">
      <span className="text-sm text-muted">{label}</span>
      <div className="grid aspect-[2/3] place-items-center overflow-hidden rounded-xl border border-dashed border-line bg-surface-2 hover:border-brand">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="size-full object-cover" />
        ) : (
          <span className="px-2 text-center text-xs text-muted">Toca para subir foto (JPG, PNG o WEBP)</span>
        )}
      </div>
      <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={onChange} />
    </label>
  );
}
