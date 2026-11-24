import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "HR Coffee & Deli",
  description: "Tu mesa conectada: menú, ludoteca, llama a tu mesero y gana premios.",
  icons: { icon: "/brand/icon-192.png", apple: "/brand/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#0b0b0c",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${outfit.variable} antialiased`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
