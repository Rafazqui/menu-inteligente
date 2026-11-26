"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, FileUp, KeyRound, Plus, Printer, RefreshCw, Save, Trash2 } from "lucide-react";
import { uploadUrl } from "@/lib/types";
import { Field, Section, send, Toggle, useFlash, type ConfigData } from "./shared";

// ---------------- Menú ----------------
export function MenuTab({ data, reload }: { data: ConfigData; reload: () => void }) {
  const [uploading, setUploading] = useState(false);
  const flash = useFlash();
  const url = uploadUrl(data.business.menuFile);

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    const fd = new FormData();
    fd.set("file", f);
    flash(await send("/api/admin/config/menu", fd), "Menú actualizado ✓");
    setUploading(false);
    e.target.value = "";
    reload();
  }

  return (
    <Section title="Menú" desc="Sube el menú en PDF tal cual lo tienes. Los clientes lo verán página por página en su celular.">
      <p className="text-sm">
        Estado:{" "}
        {url ? (
          <a href={url} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-brand underline">
            Menú cargado, ver PDF <ExternalLink size={14} />
          </a>
        ) : (
          <span className="text-muted">sin menú todavía</span>
        )}
      </p>
      <label className="btn-brand inline-flex cursor-pointer items-center gap-2 px-5 py-2.5">
        <FileUp size={18} /> {uploading ? "Subiendo…" : url ? "Reemplazar PDF" : "Subir PDF"}
        <input type="file" accept="application/pdf" className="sr-only" onChange={upload} disabled={uploading} />
      </label>
      <p className="text-xs text-muted">
        Máximo 4 MB. Consejo: exporta el PDF optimizado para web (o comprímelo en ilovepdf.com) para que cargue rápido en
        los celulares.
      </p>
    </Section>
  );
}

// ---------------- Mesas ----------------
export function MesasTab({ data, reload }: { data: ConfigData; reload: () => void }) {
  const flash = useFlash();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [area, setArea] = useState("");
  const active = data.tables.filter((t) => t.active);

  async function act(body: object, ok?: string) {
    flash(await send("/api/admin/config/tables", body), ok);
    reload();
  }

  return (
    <div className="space-y-6">
      <Section title="Agregar mesas" desc="Crea una o varias mesas a la vez (ej. de la 21 a la 30 en Terraza).">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_1fr_2fr_auto] sm:items-end">
          <Field label="Desde #"><input className="input" type="number" min={1} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="Hasta #"><input className="input" type="number" min={1} value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          <Field label="Área"><input className="input" placeholder="Rooftop, Planta baja…" value={area} onChange={(e) => setArea(e.target.value)} /></Field>
          <button
            onClick={() => act({ action: "add", from: Number(from), to: Number(to || from), area }, "Mesas agregadas ✓")}
            className="btn-brand inline-flex items-center justify-center gap-2 px-4 py-3"
          >
            <Plus size={18} /> Agregar
          </button>
        </div>
      </Section>

      <Section title={`Mesas (${active.length})`} desc="Cada mesa tiene un código único. Si una tablilla se pierde o alguien abusa del QR, genera uno nuevo.">
        <Link href="/admin/qr" className="btn-ghost inline-flex items-center gap-2 px-4 py-2.5">
          <Printer size={18} /> Ver e imprimir tablillas QR
        </Link>
        <ul className="divide-y divide-line rounded-2xl border border-line">
          {active.map((t) => (
            <TableRow key={t.id} t={t} onAct={act} />
          ))}
        </ul>
      </Section>
    </div>
  );
}

function TableRow({ t, onAct }: { t: ConfigData["tables"][number]; onAct: (b: object, ok?: string) => void }) {
  const [area, setArea] = useState(t.area);
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <span className="w-20 font-semibold">Mesa {t.number}</span>
      <input className="input max-w-48 py-2" value={area} onChange={(e) => setArea(e.target.value)} aria-label="Área" />
      {area !== t.area && (
        <button onClick={() => onAct({ action: "update", id: t.id, area })} className="btn-brand grid size-10 place-items-center" aria-label="Guardar área">
          <Save size={16} />
        </button>
      )}
      <code className="hidden text-xs text-muted md:inline">/m/{t.token}</code>
      <div className="ml-auto flex gap-2">
        <button
          onClick={() => confirm(`¿Generar un QR nuevo para la mesa ${t.number}? El QR impreso actual dejará de funcionar.`) && onAct({ action: "regen", id: t.id }, "QR regenerado ✓")}
          className="btn-ghost inline-flex items-center gap-1.5 px-3 py-2 text-sm"
        >
          <RefreshCw size={14} /> Nuevo QR
        </button>
        <button
          onClick={() => confirm(`¿Quitar la mesa ${t.number}?`) && onAct({ action: "remove", id: t.id }, "Mesa quitada")}
          className="btn-ghost grid size-9 place-items-center"
          aria-label="Quitar mesa"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </li>
  );
}

// ---------------- Negocio ----------------
export function NegocioTab({ data, reload }: { data: ConfigData; reload: () => void }) {
  const flash = useFlash();
  const b = data.business;
  const [name, setName] = useState(b.name);
  const [tagline, setTagline] = useState(b.tagline);
  const [review, setReview] = useState(b.googleReviewUrl);
  const [requireApproval, setRequireApproval] = useState(b.settings.requireApproval);
  const [cooldown, setCooldown] = useState(b.settings.waiterCooldownSec);
  const [hours, setHours] = useState(b.settings.sessionMaxHours);
  const [legal, setLegal] = useState(b.settings.legal);

  async function save() {
    flash(
      await send("/api/admin/config", {
        name,
        tagline,
        googleReviewUrl: review,
        settings: { requireApproval, waiterCooldownSec: cooldown, sessionMaxHours: hours, legal },
      }),
    );
    reload();
  }

  return (
    <div className="space-y-6">
      <Section title="Datos del negocio">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre"><input className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Frase"><input className="input" value={tagline} maxLength={80} onChange={(e) => setTagline(e.target.value)} /></Field>
        </div>
        <Field
          label="Enlace para dejar reseña en Google"
          hint="En tu Perfil de Negocio de Google → “Pedir reseñas” → copia el enlace (g.page/r/…). Se muestra como invitación, sin premio a cambio."
        >
          <input className="input" type="url" placeholder="https://g.page/r/…" value={review} onChange={(e) => setReview(e.target.value)} />
        </Field>
      </Section>

      <Section
        title="Datos legales"
        desc="Aparecen en los Términos de la promoción y en el Aviso de privacidad que ven los clientes. Haz que un abogado revise esos textos antes de usarlos con clientes reales."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Responsable (nombre o razón social)">
            <input className="input" maxLength={120} value={legal.owner} onChange={(e) => setLegal({ ...legal, owner: e.target.value })} />
          </Field>
          <Field label="Correo de contacto">
            <input className="input" type="email" maxLength={120} value={legal.email} onChange={(e) => setLegal({ ...legal, email: e.target.value })} />
          </Field>
        </div>
        <Field label="Domicilio">
          <input className="input" maxLength={200} value={legal.address} onChange={(e) => setLegal({ ...legal, address: e.target.value })} />
        </Field>
        <p className="flex flex-wrap gap-4 text-sm">
          <a href="/terminos" target="_blank" className="text-brand underline">Ver Términos de la promoción</a>
          <a href="/privacidad" target="_blank" className="text-brand underline">Ver Aviso de privacidad</a>
        </p>
      </Section>

      <Section title="Seguridad de las mesas">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-medium">El mesero aprueba cada mesa</p>
            <p className="text-sm text-muted">
              Recomendado. Evita que alguien con una foto del QR llame al mesero o juegue desde fuera del local.
            </p>
          </div>
          <Toggle checked={requireApproval} onChange={setRequireApproval} label="Aprobar mesas" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Segundos entre llamadas al mesero" hint="Evita llamadas repetidas desde la misma mesa.">
            <input className="input" type="number" min={15} max={600} value={cooldown} onChange={(e) => setCooldown(Number(e.target.value))} />
          </Field>
          <Field label="Cerrar mesas automáticamente tras (horas)" hint="Por si alguien olvida cerrar la mesa en el panel.">
            <input className="input" type="number" min={1} max={24} value={hours} onChange={(e) => setHours(Number(e.target.value))} />
          </Field>
        </div>
      </Section>

      <button onClick={save} className="btn-brand inline-flex items-center gap-2 px-5 py-2.5">
        <Save size={18} /> Guardar cambios
      </button>
    </div>
  );
}

// ---------------- Personal ----------------
export function PersonalTab({ data, reload }: { data: ConfigData; reload: () => void }) {
  const flash = useFlash();
  const [form, setForm] = useState({ username: "", name: "", password: "", role: "staff" });

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const err = await send("/api/admin/config/staff", { action: "create", ...form });
    flash(err, "Usuario creado ✓");
    if (!err) setForm({ username: "", name: "", password: "", role: "staff" });
    reload();
  }

  async function changePassword(id: number, name: string) {
    const password = prompt(`Nueva contraseña para ${name} (mínimo 8 caracteres):`);
    if (!password) return;
    flash(await send("/api/admin/config/staff", { action: "password", id, password }), "Contraseña cambiada ✓");
  }

  async function toggle(id: number) {
    flash(await send("/api/admin/config/staff", { action: "toggle", id }));
    reload();
  }

  return (
    <div className="space-y-6">
      <Section title="Personal" desc="El dueño ve todo. El personal solo ve el panel en vivo (alertas y mesas).">
        <ul className="divide-y divide-line rounded-2xl border border-line">
          {data.staff.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-40 flex-1">
                <p className="font-semibold">{s.name}</p>
                <p className="text-xs text-muted">@{s.username} · {s.role === "owner" ? "Dueño" : "Personal"}</p>
              </div>
              <button onClick={() => changePassword(s.id, s.name)} className="btn-ghost inline-flex items-center gap-1.5 px-3 py-2 text-sm">
                <KeyRound size={14} /> Contraseña
              </button>
              {s.id !== data.me.id && (
                <div className="flex items-center gap-2">
                  <Toggle checked={Boolean(s.active)} onChange={() => toggle(s.id)} label="Activo" />
                  <span className="w-16 text-xs text-muted">{s.active ? "Activo" : "Inactivo"}</span>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Nuevo usuario">
        <form onSubmit={create} className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre"><input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Usuario" hint="minúsculas, sin espacios"><input className="input" required autoCapitalize="none" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })} /></Field>
          <Field label="Contraseña" hint="mínimo 8 caracteres"><input className="input" type="password" required minLength={8} autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
          <Field label="Rol">
            <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="staff">Personal (mesero)</option>
              <option value="owner">Dueño (acceso total)</option>
            </select>
          </Field>
          <div className="sm:col-span-2">
            <button className="btn-brand inline-flex items-center gap-2 px-5 py-2.5"><Plus size={18} /> Crear usuario</button>
          </div>
        </form>
      </Section>
    </div>
  );
}
