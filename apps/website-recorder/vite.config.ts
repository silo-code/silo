import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

/** Standalone vignette recorder — depends on `@silo-code/website` demo engine. */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
  },
  build: {
    rollupOptions: {
      input: {
        recorder: path.resolve(root, "recorder.html"),
      },
    },
  },
});
