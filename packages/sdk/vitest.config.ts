import { defineConfig, configDefaults } from "vitest/config";

// Unit tests for the SDK's pure logic (e.g. useFocusGroup's index math). The SDK
// is a types-first leaf with one behavioral helper family; we test the pure
// pieces in a plain node env — no jsdom / React renderer needed (see the repo
// testing guide: extract pure logic and test that, not rendered React).
export default defineConfig({
  test: {
    name: "unit",
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: [...configDefaults.exclude],
  },
});
