import { defineConfig } from "vitest/config";

// Docs-only checks with no runtime UI to render — currently the
// silo-demos.css <-> components.css drift check (see
// .vitepress/theme/silo-demos.sync.test.ts).
export default defineConfig({
  test: {
    name: "docs",
    environment: "node",
    include: [".vitepress/theme/**/*.{test,spec}.ts"],
  },
});
