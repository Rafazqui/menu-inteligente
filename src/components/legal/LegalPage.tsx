import Image from "next/image";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getTableContext } from "@/lib/auth";
import { q1 } from "@/lib/db";
import { getRestaurant, type RestaurantRow } from "@/lib/repo";

/** Negocio de la mesa del visitante; si no viene de una mesa, el primero registrado. */
export async function publicRestaurant(): Promise<{ restaurant: RestaurantRow; fromTable: boolean } | null> {
  const ctx = await getTableContext();
  if (ctx) return { restaurant: ctx.restaurant, fromTable: true };
  const first = await q1<{ id: number }>("SELECT id FROM restaurants ORDER BY id LIMIT 1");
  const restaurant = first ? await getRestaurant(first.id) : undefined;
  return restaurant ? { restaurant, fromTable: false } : null;
}

/** Valor legal configurado o un aviso visible de que falta llenarlo. */
export function Dato({ value, label }: { value: string; label: string }) {
  if (value) return <>{value}</>;
  return (
    <mark className="rounded bg-danger/20 px-1 text-danger">
      [{label} pendiente: configúralo en Configuración → Negocio]
    </mark>
  );
}

export function LegalPage({
  title,
  updated,
  backHref,
  logoUrl,
  children,
}: {
  title: string;
  updated: string;
  backHref: string;
  logoUrl: string;
  children: React.ReactNode;
}) {
  return (
    <main className="glow-top min-h-dvh">
      <div className="mx-auto max-w-2xl px-4 pb-16 pt-[max(env(safe-area-inset-top),1rem)]">
        <header className="flex items-center gap-3 py-3">
          <Link href={backHref} aria-label="Volver" className="btn-ghost grid size-10 shrink-0 place-items-center rounded-full">
            <ChevronLeft size={22} />
          </Link>
          <Image src={logoUrl || "/brand/logo.png"} alt="" width={40} height={40} />
        </header>
        <h1 className="mt-2 text-3xl font-bold leading-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted">Última actualización: {updated}</p>
        <article className="legal mt-6 space-y-5 leading-relaxed text-cream/90">{children}</article>
      </div>
    </main>
  );
}
