"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ImagePlus, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import { formatMoney, promoPricing, uploadUrl } from "@/lib/types";
import { Field, send, Toggle, useFlash } from "./config/shared";

interface AdminPromo {
  id: number;
  title: string;
  description: string;
  price_cents: number | null;
  discount_type: "none" | "percent" | "amount";
  discount_value: number;
  image_file: string | null;
  active: number;
  ends_date: string | null;
  expired: boolean;
  requests_30d: number;
}

async function fetchPromos(): Promise<AdminPromo[] | null> {
  const res = await fetch("/api/admin/promos", { cache: "no-store" }).catch(() => null);
  return res?.ok ? ((await res.json()).promos as AdminPromo[]) : null;
}

function priceLine(p: { price_cents: number | null; discount_type: AdminPromo["discount_type"]; discount_value: number }) {
  const { finalCents, badge } = promoPricing(p.price_cents, p.discount_type, p.discount_value);
  if (p.price_cents === null) return badge ? `Descuento ${badge}` : "Sin precio";
  if (finalCents !== null) return `${formatMoney(p.price_cents)} → ${formatMoney(finalCents)} (${badge})`;
  return formatMoney(p.price_cents);
}

export function PromosAdmin() {
  const [promos, setPromos] = useState<AdminPromo[] | null>(null);
  const [editing, setEditing] = useState<Partial<AdminPromo> | null>(null);
  const flash = useFlash();

  const reload = useCallback(() => fetchPromos().then((p) => p && setPromos(p)), []);
  useEffect(() => {
    fetchPromos().then((p) => p && setPromos(p));
  }, []);

  async function act(p: AdminPromo, action: string, extra: Record<string, string> = {}) {
    const fd = new FormData();
    fd.set("action", action);
    fd.set("id", String(p.id));
    for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    const err = await send("/api/admin/promos", fd);
    if (err) flash(err);
    reload();
  }

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Recomendaciones</h1>
          <p className="text-sm text-muted">
            Lo que quieres que se venda más: un combo, una bebida, algo que hay que sacar. Aparecen rotando en el inicio de la
            app de cada mesa, y con “Lo quiero” le avisan al mesero.
          </p>
        </div>
        <button onClick={() => setEditing({ discount_type: "none", discount_value: 0, active: 1 })} className="btn-brand inline-flex items-center gap-2 px-4 py-2.5">
          <Plus size={18} /> Nueva
        </button>
      </div>

      {!promos ? (
        <p className="text-muted">Cargando…</p>
      ) : promos.length === 0 ? (
        <div className="card p-8 text-center">
          <Sparkles className="mx-auto text-brand" size={36} />
          <p className="mt-3 font-semibold">Todavía no hay recomendaciones</p>
          <p className="text-sm text-muted">Agrega la primera: por ejemplo “Frappé de temporada -20%”.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {promos.map((p, i) => {
            const status = p.expired ? "Vencida" : p.active ? "Visible" : "Pausada";
            return (
              <li key={p.id} className={`card flex flex-wrap items-center gap-3 p-3 ${p.active && !p.expired ? "" : "opacity-60"}`}>
                <div className="size-16 shrink-0 overflow-hidden rounded-xl bg-[linear-gradient(135deg,#ffc72c,#ff8a00)]">
                  {p.image_file && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={uploadUrl(p.image_file)!} alt="" className="size-full object-cover" />
                  )}
                </div>
                <div className="min-w-44 flex-1">
                  <p className="font-semibold leading-tight">{p.title}</p>
                  <p className="text-sm text-muted">{priceLine(p)}</p>
                  <p className="text-xs text-muted">
                    {status}
                    {p.ends_date ? ` · hasta el ${p.ends_date.split("-").reverse().join("/")}` : ""} · pedida{" "}
                    {p.requests_30d} {p.requests_30d === 1 ? "vez" : "veces"} en 30 días
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => act(p, "move", { dir: "up" })} disabled={i === 0} className="btn-ghost grid size-9 place-items-center" aria-label="Subir">
                    <ArrowUp size={16} />
                  </button>
                  <button onClick={() => act(p, "move", { dir: "down" })} disabled={i === promos.length - 1} className="btn-ghost grid size-9 place-items-center" aria-label="Bajar">
                    <ArrowDown size={16} />
                  </button>
                  <Toggle checked={Boolean(p.active)} onChange={() => act(p, "toggle")} label={p.active ? "Pausar" : "Mostrar"} />
                  <button onClick={() => setEditing(p)} className="btn-ghost grid size-9 place-items-center" aria-label="Editar">
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => confirm(`¿Eliminar "${p.title}"?`) && act(p, "delete")}
                    className="btn-ghost grid size-9 place-items-center"
                    aria-label="Eliminar"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-muted">El orden de la lista es el orden en que rotan. Las vencidas se ocultan solas.</p>

      {editing && (
        <PromoForm
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            flash(null);
            reload();
          }}
        />
      )}
      <div
        id="toast"
        className="pointer-events-none fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-ok px-5 py-2.5 font-semibold text-ink opacity-0 transition-opacity data-[show='1']:opacity-100"
      />
    </div>
  );
}

function PromoForm({ initial, onClose, onSaved }: { initial: Partial<AdminPromo>; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(initial.title ?? "");
  const [description, setDescription] = useState(initial.description ?? "");
  const [price, setPrice] = useState(initial.price_cents != null ? String(initial.price_cents / 100) : "");
  const [dtype, setDtype] = useState<AdminPromo["discount_type"]>(initial.discount_type ?? "none");
  const [dvalue, setDvalue] = useState(
    initial.discount_type === "amount" ? String((initial.discount_value ?? 0) / 100) : initial.discount_value ? String(initial.discount_value) : "",
  );
  const [ends, setEnds] = useState(initial.ends_date ?? "");
  const [active, setActive] = useState(initial.active !== 0);
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(uploadUrl(initial.image_file));
  const [removeImage, setRemoveImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const priceCents = price.trim() && Number.isFinite(Number(price)) ? Math.round(Number(price) * 100) : null;
  const valueNum = Number(dvalue);
  const previewPricing = promoPricing(
    priceCents,
    dtype,
    dtype === "amount" ? Math.round(valueNum * 100) : dtype === "percent" ? Math.round(valueNum) : 0,
  );

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const fd = new FormData();
    fd.set("action", "save");
    if (initial.id) fd.set("id", String(initial.id));
    fd.set("title", title);
    fd.set("description", description);
    fd.set("price", price);
    fd.set("discount_type", dtype);
    fd.set("discount_value", dvalue);
    fd.set("ends_date", ends);
    fd.set("active", active ? "1" : "0");
    if (image) fd.set("image", image);
    if (removeImage) fd.set("remove_image", "1");
    const err = await send("/api/admin/promos", fd);
    setSaving(false);
    if (err) setError(err);
    else onSaved();
  }

  return (
    <div className="overlay-in fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 p-4" onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="card grow-in my-8 w-full max-w-lg space-y-4 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{initial.id ? "Editar recomendación" : "Nueva recomendación"}</h2>
          <button type="button" onClick={onClose} className="btn-ghost grid size-9 place-items-center" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <Field label="¿Qué quieres recomendar?">
          <input className="input" required maxLength={60} placeholder="Ej. Combo frappé + croissant" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Descripción corta (opcional)" hint={`${description.length}/160`}>
          <textarea className="input min-h-16" maxLength={160} placeholder="Ej. Ideal para la tarde. Solo hoy." value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>

        <div className="space-y-1">
          <span className="text-sm text-muted">Foto (opcional)</span>
          <div className="flex items-center gap-3">
            <div className="size-20 shrink-0 overflow-hidden rounded-xl bg-[linear-gradient(135deg,#ffc72c,#ff8a00)]">
              {preview && !removeImage && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="" className="size-full object-cover" />
              )}
            </div>
            <label className="btn-ghost inline-flex cursor-pointer items-center gap-2 px-3 py-2 text-sm">
              <ImagePlus size={16} /> {preview && !removeImage ? "Cambiar" : "Subir foto"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setImage(f);
                  setRemoveImage(false);
                  if (f) setPreview(URL.createObjectURL(f));
                }}
              />
            </label>
            {preview && !removeImage && (
              <button type="button" onClick={() => { setRemoveImage(true); setImage(null); }} className="text-sm text-muted underline">
                Quitar
              </button>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Precio normal (opcional)">
            <input className="input" inputMode="decimal" placeholder="$ 85" value={price} onChange={(e) => setPrice(e.target.value)} />
          </Field>
          <Field label="Mostrar hasta (opcional)" hint="Se oculta sola después de ese día.">
            <input className="input" type="date" value={ends} onChange={(e) => setEnds(e.target.value)} />
          </Field>
        </div>

        <div className="space-y-2">
          <span className="text-sm text-muted">Descuento</span>
          <div className="flex gap-1 rounded-xl border border-line p-1" role="radiogroup" aria-label="Tipo de descuento">
            {([
              ["none", "Sin descuento"],
              ["percent", "Porcentaje %"],
              ["amount", "Pesos $"],
            ] as const).map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={dtype === k}
                onClick={() => setDtype(k)}
                className={`flex-1 rounded-lg px-2 py-1.5 text-sm font-medium ${dtype === k ? "bg-brand text-brand-ink" : "text-muted"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {dtype !== "none" && (
            <input
              className="input"
              inputMode="decimal"
              placeholder={dtype === "percent" ? "Ej. 20 (de 1 a 90)" : "Ej. 15 (pesos)"}
              value={dvalue}
              onChange={(e) => setDvalue(e.target.value)}
            />
          )}
        </div>

        <div className="rounded-2xl border border-dashed border-line p-3 text-sm">
          <p className="text-xs text-muted">Así se verá el precio:</p>
          {priceCents !== null && previewPricing.finalCents !== null ? (
            <p>
              <span className="mr-2 text-muted line-through">{formatMoney(priceCents)}</span>
              <span className="text-lg font-black text-brand">{formatMoney(previewPricing.finalCents)}</span>
              <span className="ml-2 rounded-full bg-danger px-2 py-0.5 text-xs font-black text-ink">{previewPricing.badge}</span>
            </p>
          ) : priceCents !== null ? (
            <p className="text-lg font-black text-brand">{formatMoney(priceCents)}</p>
          ) : previewPricing.badge ? (
            <p>Etiqueta <span className="rounded-full bg-danger px-2 py-0.5 text-xs font-black text-ink">{previewPricing.badge}</span> sin precio</p>
          ) : (
            <p className="text-muted">Sin precio ni descuento (solo recomendación)</p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Toggle checked={active} onChange={setActive} label="Visible" />
          <span className="text-sm">Mostrar a los clientes</span>
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
