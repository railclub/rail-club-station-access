import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The React app lives here; everything in ../site (station data, photos, the admin and privacy
// pages, the visitor-report script) is copied as-is next to it in ../dist.
export default defineConfig({
  plugins: [react()],
  // Preact runs the same React components in a fraction of the size, so the site loads fast on
  // slow mobile connections.
  resolve: {
    alias: {
      react: "preact/compat",
      "react-dom/client": "preact/compat/client",
      "react-dom": "preact/compat",
      "react/jsx-runtime": "preact/jsx-runtime",
      "react/jsx-dev-runtime": "preact/jsx-dev-runtime",
    },
  },
  base: "./",
  publicDir: "../site",
  build: { outDir: "../dist", emptyOutDir: true, target: "es2022" },
  server: { port: 8000 },
});
