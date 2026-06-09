import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Unit tests for the host runtime. jsdom + the Tauri boundary mocked per-test;
// deterministic and app-free (mirrors the app's `unit` project). Integration
// tests that drive a live dev app live in `apps/desktop` (the automation
// bridge), not here.
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
