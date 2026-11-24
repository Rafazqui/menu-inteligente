// Copia el worker de pdf.js a /public para que el visor del menú pueda cargarlo.
import fs from "node:fs";
import path from "node:path";

const src = path.join("node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs");
const dir = path.join("public", "pdfjs");
fs.mkdirSync(dir, { recursive: true });
fs.copyFileSync(src, path.join(dir, "pdf.worker.min.mjs"));
console.log("pdf.js worker copiado a public/pdfjs");
