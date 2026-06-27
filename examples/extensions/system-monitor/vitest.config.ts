import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    name: "unit",
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
