import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Unit tests for the bundled silo.* extensions. jsdom + the Tauri boundary
// mocked per-test (mirrors the app's `unit` project). The git tests shell out
// to real git against throwaway temp repos (node: APIs, allowed in tests).
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
