import { defineConfig, configDefaults } from "vitest/config";

// Unit tests for this package's pure logic (NULL_GIT_REPO_STORE's shape).
// git-api is a types-first leaf, same posture as @silo-code/sdk — plain node
// env, no jsdom / React renderer.
export default defineConfig({
  test: {
    name: "unit",
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: [...configDefaults.exclude],
  },
});
