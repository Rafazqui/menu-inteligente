import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { UPLOADS_DIR } from "./db";

export const UPLOAD_NAME_RE = /^[a-f0-9]{32}\.(pdf|png|jpg|webp)$/;

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
};

export function mimeFor(name: string): string {
  return MIME[name.split(".").pop() ?? ""] ?? "application/octet-stream";
}

/** Detecta el tipo real del archivo por sus primeros bytes (no confiamos en la extensión). */
function sniff(buf: Buffer): keyof typeof MIME | null {
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  return null;
}

export class UploadError extends Error {}

export async function saveUpload(file: File, kind: "pdf" | "image"): Promise<string> {
  const maxMb = kind === "pdf" ? 20 : 6;
  if (file.size === 0) throw new UploadError("El archivo está vacío.");
  if (file.size > maxMb * 1024 * 1024) throw new UploadError(`El archivo supera ${maxMb} MB.`);
  const buf = Buffer.from(await file.arrayBuffer());
  const ext = sniff(buf);
  if (!ext || (kind === "pdf" ? ext !== "pdf" : ext === "pdf")) {
    throw new UploadError(kind === "pdf" ? "Sube un archivo PDF." : "Sube una imagen JPG, PNG o WEBP.");
  }
  const name = `${crypto.randomBytes(16).toString("hex")}.${ext}`;
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  await fs.writeFile(path.join(UPLOADS_DIR, name), buf);
  return name;
}

export async function deleteUpload(name: string | null | undefined) {
  if (!name || !UPLOAD_NAME_RE.test(name)) return;
  await fs.rm(path.join(UPLOADS_DIR, name), { force: true });
}
