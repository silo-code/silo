// Global test setup — adds jest-dom matchers (toBeInTheDocument, etc.) and
// runs before every test file (see vitest.config.ts `setupFiles`).
import "@testing-library/jest-dom/vitest";

// Node 26 added a built-in `localStorage` global. It is an accessor that
// returns `undefined` unless the process was started with
// `--localstorage-file`, and it takes precedence over the one jsdom installs —
// `globalThis === window` under this environment, so there is no second copy to
// reach for. Anything touching Web Storage (`state/column-widths.ts`,
// `state/store.ts`, `extension-host/registry-client.ts`, …) then reads
// `undefined` and throws, which is purely an artifact of the host Node version:
// in the real app `localStorage` is the webview's.
//
// CI pins `node-version: lts/*`, which does not resolve to 26 yet, so this
// surfaced only on a developer machine ahead of LTS — and would have broken CI
// the moment 26 is promoted. Install a spec-shaped in-memory Storage when the
// global is unusable, which also keeps each test file isolated (setup runs per
// file). The descriptor is `configurable: true`, so redefining it is legal.
if (!isUsableStorage((globalThis as { localStorage?: unknown }).localStorage)) {
  Object.defineProperty(globalThis, "localStorage", {
    value: createMemoryStorage(),
    configurable: true,
    writable: true,
  });
}

function isUsableStorage(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Storage).getItem === "function"
  );
}

/** The parts of the Web Storage API the host actually uses, backed by a Map. */
function createMemoryStorage(): Storage {
  const entries = new Map<string, string>();
  return {
    get length() {
      return entries.size;
    },
    key: (index: number) => [...entries.keys()][index] ?? null,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, String(value));
    },
    removeItem: (key: string) => {
      entries.delete(key);
    },
    clear: () => entries.clear(),
  } satisfies Storage;
}

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
