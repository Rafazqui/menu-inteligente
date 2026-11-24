"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button onClick={() => window.print()} className="btn-brand inline-flex items-center gap-2 px-4 py-2.5">
      <Printer size={18} /> Imprimir
    </button>
  );
}
