import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

// Standalone preview for local homepage iteration.
// Production ships via apps/docs importing `@silo-code/website`.
// Vignette recording lives in `@silo-code/website-recorder`.
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(root, "index.html"),
      },
    },
  },
});
