import type { Metadata } from "next";

// El panel se puede instalar como app (pantalla de inicio). En iPhone es requisito para las notificaciones.
export const metadata: Metadata = {
  title: "Panel · HR Coffee & Deli",
  manifest: "/admin.webmanifest",
  appleWebApp: { capable: true, title: "Panel HR", statusBarStyle: "black-translucent" },
};

export default function AdminRootLayout({ children }: LayoutProps<"/admin">) {
  return children;
}
