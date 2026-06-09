import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Unit tests for the bundled core extensions. jsdom + the Tauri boundary
// mocked per-test (mirrors the app's `unit` project).
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    name: "unit",
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    css: false,
  },
});
