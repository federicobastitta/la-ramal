/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// Dos pantallas en un mismo proyecto: la app del chofer (index.html) y el panel de la línea (panel.html).
export default defineConfig({
  // En GitHub Pages se publica en /la-ramal/ (lo pasa el workflow con BASE_PATH).
  base: process.env.BASE_PATH ?? "/",
  plugins: [react()],
  build: {
    target: "es2022",
    sourcemap: true,
    rollupOptions: {
      input: { chofer: resolve(import.meta.dirname, "index.html"), panel: resolve(import.meta.dirname, "panel.html") },
    },
  },
  test: { environment: "node" },
});
