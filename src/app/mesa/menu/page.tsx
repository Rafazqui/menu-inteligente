import { BookOpen } from "lucide-react";
import { getTableContext } from "@/lib/auth";
import { uploadUrl } from "@/lib/types";
import { MesaHeader } from "@/components/mesa/MesaHeader";
import { PdfViewer } from "@/components/mesa/PdfViewer";

export default async function MenuPage() {
  const ctx = await getTableContext();
  const url = uploadUrl(ctx?.restaurant.menu_file);

  return (
    <>
      <MesaHeader title="Menú" />
      <div className="pt-2">
        {url ? (
          <PdfViewer url={url} />
        ) : (
          <div className="card p-8 text-center">
            <BookOpen className="mx-auto text-brand" size={36} />
            <p className="mt-3 font-semibold">El menú digital estará disponible muy pronto</p>
            <p className="text-sm text-muted mt-1">Pídele la carta a tu mesero mientras tanto.</p>
          </div>
        )}
      </div>
    </>
  );
}
