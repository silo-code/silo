// Global test setup — adds jest-dom matchers (toBeInTheDocument, etc.) and
// runs before every test file (see vitest.config.ts `setupFiles`).
import "@testing-library/jest-dom/vitest";

// Monaco's clipboard contribution probes `document.queryCommandSupported` at
// import time; jsdom doesn't implement it. Stub it so any test whose import
// graph reaches monaco (e.g. a value import from
// `@silo-code/extension-host/internal`) can load. Mirrors the same shim in
// `packages/extension-host/src/test/setup.ts` and `apps/desktop/src/test/setup.ts`.
if (
  typeof document !== "undefined" &&
  typeof document.queryCommandSupported !== "function"
) {
  (
    document as unknown as { queryCommandSupported: () => boolean }
  ).queryCommandSupported = () => false;
}
