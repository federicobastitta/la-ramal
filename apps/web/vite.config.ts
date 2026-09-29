/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// Dos pantallas en un mismo proyecto: la app del chofer (index.html) y el panel de la línea (panel.html).
export default defineConfig({
  plugins: [react()],
  build: {
    target: "es2022",
    sourcemap: true,
    rollupOptions: {
      input: { chofer: resolve(__dirname, "index.html"), panel: resolve(__dirname, "panel.html") },
    },
  },
  test: { environment: "node" },
});
