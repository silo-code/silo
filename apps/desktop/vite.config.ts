import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  // Both extension surfaces resolve as real workspace packages (pnpm symlinks):
  // the public `@silo-code/sdk` and the privileged
  // `@silo-code/extension-host/internal` subpath export. No resolve aliases needed.

  optimizeDeps: {
    // Pre-bundle monaco-editor and its workers so dev-mode imports of the
    // ?worker variants resolve instantly instead of stalling the first paint.
    include: ["monaco-editor"],
  },

  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // Keep Monaco out of the main bundle so the app shell paints first.
        manualChunks(id) {
          if (id.includes("monaco-editor")) return "monaco";
          if (id.includes("dockview")) return "dockview";
        },
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
