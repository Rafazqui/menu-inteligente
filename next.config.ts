import type { NextConfig } from "next";

// Para probar desde celulares en la misma red Wi-Fi durante desarrollo,
// pon la IP de tu PC en DEV_ORIGINS (ej. "192.168.1.50").
const devOrigins = (process.env.DEV_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  allowedDevOrigins: devOrigins,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
