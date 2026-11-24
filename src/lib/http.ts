import "server-only";

export function ok(data: unknown = { ok: true }, init?: ResponseInit) {
  return Response.json(data, init);
}

export function fail(status: number, error: string, extra?: Record<string, unknown>) {
  return Response.json({ error, ...extra }, { status });
}

/**
 * Rechaza peticiones que cambian datos si vienen de otro sitio (defensa CSRF
 * adicional a las cookies SameSite=Lax).
 */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // navegadores siempre lo mandan en POST cross-site
  try {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * URL absoluta usando el host con el que llegó el visitante.
 * (req.url puede traer 0.0.0.0 cuando el servidor escucha en todas las interfaces.)
 */
export function publicUrl(req: Request, path: string): URL {
  const fallback = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? fallback.host;
  const proto = req.headers.get("x-forwarded-proto") ?? fallback.protocol.replace(":", "");
  return new URL(path, `${proto}://${host}`);
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

export function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "local"
  );
}

// ---------- Límite de frecuencia en memoria ----------

declare global {
  var __mesaRate: Map<string, number[]> | undefined;
}
const hits: Map<string, number[]> = globalThis.__mesaRate ?? (globalThis.__mesaRate = new Map());

/** Devuelve true si se permite; false si se superó `max` intentos en `windowMs`. */
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) {
    hits.set(key, list);
    return false;
  }
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (v.every((t) => now - t > windowMs)) hits.delete(k);
  }
  return true;
}
