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
    // Vitest's 5s default is a poor fit for a full-workspace run: turbo starts
    // every package's suite at once and each spins up its own worker pool, so
    // a test that takes milliseconds on an idle machine can sit for seconds
    // waiting on CPU. Tests here do ~90s of real work across ~2500 of them, so
    // nothing legitimately approaches this cap — it only stops a loaded
    // machine from failing a test that was never broken.
    testTimeout: 15_000,
  },
});
