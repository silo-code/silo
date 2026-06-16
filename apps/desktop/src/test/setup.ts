// Global test setup — adds jest-dom matchers (toBeInTheDocument, etc.) and
// runs before every test file (see vitest.config.ts `setupFiles`).
import "@testing-library/jest-dom/vitest";

// jsdom omits `document.queryCommandSupported`, which Monaco's clipboard contrib
// probes at import time. Any unit test that imports the `@silo-code/extension-host`
// barrel pulls Monaco in transitively, so stub it to keep the import from throwing.
if (typeof document !== "undefined" && !document.queryCommandSupported) {
  document.queryCommandSupported = () => false;
}
