"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { LogIn } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    }).catch(() => null);
    setLoading(false);
    if (res?.ok) {
      const data = await res.json().catch(() => null);
      // Si entró con una contraseña pública, lo llevamos directo a cambiarla.
      router.replace(data?.mustChangePassword ? "/admin/cuenta?cambiar=1" : "/admin");
      router.refresh();
    } else {
      const data = await res?.json().catch(() => null);
      setError(data?.error ?? "No se pudo conectar.");
    }
  }

  return (
    <main className="glow-top grid min-h-dvh place-items-center px-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-6 pop-in">
        <div className="flex flex-col items-center text-center">
          <Image src="/brand/logo.png" alt="" width={72} height={72} />
          <h1 className="mt-3 text-xl font-bold">Panel del personal</h1>
          <p className="text-sm text-muted">Dueño o mesero en turno</p>
        </div>
        <div className="space-y-1">
          <label htmlFor="u" className="text-sm text-muted">Usuario</label>
          <input id="u" className="input" autoComplete="username" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label htmlFor="p" className="text-sm text-muted">Contraseña</label>
          <input id="p" type="password" className="input" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button disabled={loading} className="btn-brand flex w-full items-center justify-center gap-2 py-3">
          <LogIn size={18} /> {loading ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
