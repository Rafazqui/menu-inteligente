"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, LayoutDashboard, LogOut, QrCode, Settings } from "lucide-react";

export function AdminNav({ name, role, restaurant }: { name: string; role: "owner" | "staff"; restaurant: string }) {
  const path = usePathname();
  const router = useRouter();

  const links = [
    { href: "/admin", label: "En vivo", icon: <LayoutDashboard size={18} /> },
    ...(role === "owner"
      ? [
          { href: "/admin/estadisticas", label: "Estadísticas", icon: <BarChart3 size={18} /> },
          { href: "/admin/config", label: "Configuración", icon: <Settings size={18} /> },
          { href: "/admin/qr", label: "QR de mesas", icon: <QrCode size={18} /> },
        ]
      : []),
  ];

  async function logout() {
    await fetch("/api/admin/login", { method: "DELETE" });
    router.replace("/admin/login");
    router.refresh();
  }

  return (
    <header className="no-print sticky top-0 z-40 border-b border-line bg-ink/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5">
        <Image src="/brand/logo.png" alt="" width={36} height={36} />
        <div className="mr-2 hidden min-w-0 sm:block">
          <p className="truncate text-sm font-semibold leading-tight">{restaurant}</p>
          <p className="truncate text-xs text-muted">
            {name} · {role === "owner" ? "Dueño" : "Personal"}
          </p>
        </div>
        <nav className="no-scrollbar flex flex-1 gap-1 overflow-x-auto">
          {links.map((l) => {
            const active = l.href === "/admin" ? path === "/admin" : path.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                  active ? "bg-brand text-brand-ink" : "text-muted hover:text-cream"
                }`}
              >
                {l.icon}
                {l.label}
              </Link>
            );
          })}
        </nav>
        <button onClick={logout} className="btn-ghost inline-flex items-center gap-2 px-3 py-2 text-sm" aria-label="Cerrar sesión">
          <LogOut size={16} />
          <span className="hidden sm:inline">Salir</span>
        </button>
      </div>
    </header>
  );
}
