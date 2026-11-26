import Image from "next/image";
import Link from "next/link";
import { QrCode, Nfc } from "lucide-react";

const AVISOS: Record<string, string> = {
  mesa: "Ese código no corresponde a ninguna mesa activa. Pide ayuda a tu mesero.",
  espera: "Ya avisamos a tu mesero. Espera un momento a que active tu mesa.",
  fin: "Tu visita terminó. ¡Gracias por venir! Escanea de nuevo cuando regreses.",
};

export default async function Home(props: PageProps<"/">) {
  const sp = await props.searchParams;
  const aviso = typeof sp.aviso === "string" ? AVISOS[sp.aviso] : undefined;

  return (
    <main className="glow-top min-h-dvh flex flex-col items-center justify-center px-6 text-center">
      <Image src="/brand/logo.png" alt="HR Coffee & Deli" width={132} height={132} priority className="pop-in" />
      <h1 className="mt-6 text-3xl font-bold tracking-tight">Bienvenido a HR</h1>
      <p className="mt-2 text-muted max-w-xs">
        Escanea el código QR de tu mesa o acerca tu celular a la tablilla para empezar.
      </p>
      {aviso && <p className="mt-6 card px-4 py-3 text-sm max-w-sm pop-in">{aviso}</p>}
      <div className="mt-10 flex gap-6 text-muted">
        <span className="flex items-center gap-2 text-sm"><QrCode size={20} className="text-brand" /> Código QR</span>
        <span className="flex items-center gap-2 text-sm"><Nfc size={20} className="text-brand" /> NFC</span>
      </div>
      <p className="mt-10 text-xs text-muted">
        <Link href="/terminos" className="underline underline-offset-2">Términos de la promoción</Link>
        {" · "}
        <Link href="/privacidad" className="underline underline-offset-2">Aviso de privacidad</Link>
      </p>
    </main>
  );
}
