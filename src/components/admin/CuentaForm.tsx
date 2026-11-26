"use client";

import { useState } from "react";
import Link from "next/link";
import { KeyRound, ShieldAlert } from "lucide-react";

export function CuentaForm({
  name,
  username,
  role,
  forced,
}: {
  name: string;
  username: string;
  role: "owner" | "staff";
  forced: boolean;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next !== repeat) return setError("Las contraseñas nuevas no coinciden.");
    setSaving(true);
    const res = await fetch("/api/admin/me/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current, next }),
    }).catch(() => null);
    setSaving(false);
    if (res?.ok) {
      setDone(true);
      setCurrent("");
      setNext("");
      setRepeat("");
    } else {
      setError((await res?.json().catch(() => null))?.error ?? "Sin conexión.");
    }
  }

  return (
    <div className="max-w-md space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Mi cuenta</h1>
        <p className="text-sm text-muted">
          {name} · @{username} · {role === "owner" ? "Dueño" : "Personal"}
        </p>
      </div>

      {forced && !done && (
        <div className="card flex gap-3 border-danger/50 p-4 text-sm">
          <ShieldAlert className="shrink-0 text-danger" size={22} />
          <p>
            <b>Cambia tu contraseña ahora.</b> La que usaste es una contraseña de ejemplo que ya es pública, así que
            cualquiera podría entrar a tu panel.
          </p>
        </div>
      )}

      {done ? (
        <div className="card space-y-3 p-5">
          <p className="font-semibold text-ok">✓ Contraseña cambiada</p>
          <p className="text-sm text-muted">Úsala la próxima vez que inicies sesión.</p>
          <Link href="/admin" className="btn-brand inline-block px-5 py-2.5">Ir al panel</Link>
        </div>
      ) : (
        <form onSubmit={save} className="card space-y-4 p-5">
          <h2 className="flex items-center gap-2 font-semibold">
            <KeyRound size={18} className="text-brand" /> Cambiar contraseña
          </h2>
          <label className="block space-y-1">
            <span className="text-sm text-muted">Contraseña actual</span>
            <input className="input" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-muted">Contraseña nueva</span>
            <input className="input" type="password" autoComplete="new-password" required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} />
            <span className="block text-xs text-muted">Mínimo 8 caracteres. Mejor una frase larga que solo tú recuerdes.</span>
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-muted">Repite la contraseña nueva</span>
            <input className="input" type="password" autoComplete="new-password" required value={repeat} onChange={(e) => setRepeat(e.target.value)} />
          </label>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button disabled={saving} className="btn-brand w-full py-3">
            {saving ? "Guardando…" : "Guardar contraseña"}
          </button>
        </form>
      )}
    </div>
  );
}
