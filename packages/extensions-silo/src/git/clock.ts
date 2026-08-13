// The one injected port in the repo-tracker design (ADR 0037 §"One injected
// port"): nothing else in this codebase injects window.setTimeout, so this is
// the one dependency of the tracker that isn't already substitutable via an
// existing ctx service. Real/fake pair only — see repo-tracker.test.ts for
// the fake (a virtual-time queue with an `advance(ms)` helper).
export interface ClockPort {
  setTimeout(fn: () => void, ms: number): number;
  clearTimeout(id: number): void;
  setInterval(fn: () => void, ms: number): number;
  clearInterval(id: number): void;
}

export const realClock: ClockPort = {
  setTimeout: (fn, ms) => window.setTimeout(fn, ms),
  clearTimeout: (id) => window.clearTimeout(id),
  setInterval: (fn, ms) => window.setInterval(fn, ms),
  clearInterval: (id) => window.clearInterval(id),
};
