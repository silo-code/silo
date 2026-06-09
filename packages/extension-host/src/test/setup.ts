// Global test setup — adds jest-dom matchers (toBeInTheDocument, etc.) and
// runs before every test file (see vitest.config.ts `setupFiles`).
import "@testing-library/jest-dom/vitest";

// Monaco's clipboard contribution probes `document.queryCommandSupported` at
// import time; jsdom doesn't implement it. Stub it so any test whose import
// graph reaches monaco (e.g. via createContext) can load.
if (
  typeof document !== "undefined" &&
  typeof document.queryCommandSupported !== "function"
) {
  (
    document as unknown as { queryCommandSupported: () => boolean }
  ).queryCommandSupported = () => false;
}
