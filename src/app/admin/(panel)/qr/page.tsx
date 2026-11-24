import { headers } from "next/headers";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { getStaff } from "@/lib/auth";
import { q } from "@/lib/db";
import { getRestaurant } from "@/lib/repo";
import { PrintButton } from "@/components/admin/PrintButton";

/** Base pública de las URLs de los QR. En producción define PUBLIC_BASE_URL (ej. https://mesa.hrcoffee.mx). */
async function baseUrl(): Promise<string> {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export default async function QrPage() {
  const user = await getStaff();
  if (user?.role !== "owner") redirect("/admin");
  const restaurant = (await getRestaurant(user.restaurant_id))!;
  const base = await baseUrl();
  const tables = await q<{ id: number; number: number; area: string; token: string }>(
    "SELECT id, number, area, token FROM tables WHERE restaurant_id = $1 AND active = 1 ORDER BY number",
    [user.restaurant_id],
  );

  const cards = await Promise.all(
    tables.map(async (t) => {
      const url = `${base}/m/${t.token}`;
      const qr = await QRCode.toDataURL(url, {
        errorCorrectionLevel: "H", // permite poner el logo encima sin romper la lectura
        margin: 1,
        width: 520,
        color: { dark: "#0b0b0c", light: "#ffffff" },
      });
      return { ...t, url, qr };
    }),
  );

  const isLocal = /localhost|127\.0\.0\.1/.test(base);

  return (
    <div>
      <div className="no-print mb-6 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">Tablillas QR</h1>
          <PrintButton />
        </div>
        <p className="max-w-2xl text-sm text-muted">
          Imprime y recorta cada tablilla. Para el sticker NFC, graba en él la misma URL que aparece bajo cada QR
          (con una app gratuita como “NFC Tools”: Escribir → Agregar registro → URL).
        </p>
        {isLocal && (
          <p className="card max-w-2xl border-danger/50 p-3 text-sm text-danger">
            Los QR apuntan a <b>{base}</b>, que solo funciona en esta computadora. Antes de imprimir, publica la app y
            define <code>PUBLIC_BASE_URL</code> con tu dominio.
          </p>
        )}
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-2 print:gap-4">
        {cards.map((c) => (
          <article
            key={c.id}
            className="break-inside-avoid overflow-hidden rounded-3xl border-2 border-[#0b0b0c] bg-white text-[#0b0b0c]"
          >
            <div className="flex items-center gap-3 bg-[#0b0b0c] px-5 py-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/logo.png" alt="" className="size-11" />
              <div className="leading-tight text-white">
                <p className="text-sm font-bold">{restaurant.name}</p>
                <p className="text-[11px] text-[#ffc72c]">{c.area}</p>
              </div>
              <div className="ml-auto rounded-xl bg-[#ffc72c] px-3 py-1 text-center leading-none text-[#1a1400]">
                <p className="text-[10px] font-bold uppercase">Mesa</p>
                <p className="text-3xl font-black">{c.number}</p>
              </div>
            </div>
            <div className="flex flex-col items-center px-6 pb-5 pt-4">
              <div className="relative w-full max-w-60">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.qr} alt={`QR mesa ${c.number}`} className="w-full" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/brand/logo.png"
                  alt=""
                  className="absolute left-1/2 top-1/2 w-[21%] -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white"
                />
              </div>
              <p className="mt-3 text-center text-lg font-bold leading-tight">Escanea o acerca tu celular</p>
              <p className="text-center text-xs text-[#555]">Menú · Ludoteca · Llama a tu mesero · Premios</p>
              <p className="mt-2 break-all text-center font-mono text-[9px] text-[#999]">{c.url}</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
