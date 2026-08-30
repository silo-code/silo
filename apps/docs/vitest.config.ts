import { defineConfig } from "vitest/config";

// Docs-only checks with no runtime UI to render — the silo-demos.css <->
// components.css drift check (.vitepress/theme/silo-demos.sync.test.ts) and the
// repo-root governance-index drift checks (checks/).
export default defineConfig({
  test: {
    name: "docs",
    environment: "node",
    include: [
      ".vitepress/theme/**/*.{test,spec}.ts",
      "checks/**/*.{test,spec}.ts",
    ],
  },
});
