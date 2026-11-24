"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";

/**
 * Dibuja cada página del PDF en un <canvas>. En Android, Chrome descarga los PDF en vez de
 * mostrarlos, así que los renderizamos nosotros. Si algo falla, se ofrece abrir el PDF directo.
 */
export function PdfViewer({ url }: { url: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [pages, setPages] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const el = container.current;
    if (!el) return;

    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
        const doc = await pdfjs.getDocument({ url }).promise;
        if (cancelled) return;
        setPages(doc.numPages);
        el.innerHTML = "";
        const width = el.clientWidth;
        const dpr = Math.min(window.devicePixelRatio || 1, 2.5);

        for (let i = 1; i <= doc.numPages; i++) {
          if (cancelled) return;
          const page = await doc.getPage(i);
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: (width / base.width) * dpr });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = "100%";
          canvas.style.height = "auto";
          canvas.className = "rounded-2xl bg-white shadow-lg";
          canvas.setAttribute("aria-label", `Página ${i} del menú`);
          el.appendChild(canvas);
          await page.render({ canvas, viewport }).promise;
          if (i === 1) setStatus("ready");
        }
        setStatus("ready");
      } catch (e) {
        console.error("No se pudo mostrar el PDF", e);
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <div>
      {status === "loading" && (
        <div className="space-y-3" aria-label="Cargando menú">
          <div className="aspect-[3/4] rounded-2xl bg-surface-2 animate-pulse" />
        </div>
      )}
      {status === "error" && (
        <div className="card p-5 text-center space-y-3">
          <p>No pudimos mostrar el menú aquí.</p>
          <a href={url} target="_blank" rel="noopener" className="btn-brand inline-flex items-center gap-2 px-5 py-3">
            Abrir menú <ExternalLink size={18} />
          </a>
        </div>
      )}
      <div ref={container} className="space-y-3" />
      {status === "ready" && (
        <div className="mt-4 flex items-center justify-between text-xs text-muted">
          <span>{pages} página{pages === 1 ? "" : "s"} · pellizca para hacer zoom</span>
          <a href={url} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-brand">
            Abrir PDF <ExternalLink size={14} />
          </a>
        </div>
      )}
    </div>
  );
}
