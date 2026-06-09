import { defineConfig, configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";

// Two test layers (see docs/AUTOMATION.md):
//   - unit:        jsdom, Tauri boundary mocked — fast, runs everywhere.
//   - integration: drives a live dev app (`npm run app:dev`) over the RPC. Real
//                  WKWebView/Monaco/dockview; the only layer that can observe
//                  native focus behavior. Files are named `*.it.test.ts` and
//                  skip themselves when no app is reachable.
//
// `npm test` runs unit only (deterministic, no app needed). `npm run test:it`
// runs the integration layer against a running app.
//
// Test config is intentionally separate from vite.config.ts (which carries
// Tauri-specific dev-server settings that don't apply under Vitest).
export default defineConfig({
  plugins: [react()],
  // Both `@silo-code/sdk` and `@silo-code/extension-host/internal` resolve as real
  // workspace packages now — no resolve aliases needed.
  test: {
    globals: true,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "jsdom",
          setupFiles: ["./src/test/setup.ts"],
          include: ["src/**/*.{test,spec}.{ts,tsx}"],
          exclude: [
            ...configDefaults.exclude,
            "src/**/*.it.{test,spec}.{ts,tsx}",
          ],
          css: false,
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          include: ["src/**/*.it.{test,spec}.{ts,tsx}"],
          // Integration tests all drive the SAME live app over the RPC, so they
          // must not run in parallel — concurrent files would step on each
          // other's workspaces and focus. One file at a time.
          fileParallelism: false,
        },
      },
    ],
  },
});
