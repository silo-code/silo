import type { Disposable } from "@silo-code/sdk";

/**
 * Host-only ephemeral StatusBar flash (RFC 0026) — brief non-busy messages
 * like "Silo is ready". Not multi-writer, not on `ctx.ui.busyStatus`, not a
 * public SDK surface.
 */

export interface StatusFlash {
  label: string;
}

export interface FlashStatusOptions {
  label: string;
  /** Auto-clear after this many ms. Default 3000. */
  dwellMs?: number;
}

const DEFAULT_DWELL_MS = 3_000;

let flash: StatusFlash | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

export function subscribeStatusFlash(listener: () => void): Disposable {
  listeners.add(listener);
  return {
    dispose() {
      listeners.delete(listener);
    },
  };
}

export function getStatusFlash(): StatusFlash | null {
  return flash;
}

/**
 * Show a short StatusBar phrase with no spinner, then clear. Replaces any
 * in-flight flash.
 */
export function flashStatus(opts: FlashStatusOptions): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  flash = { label: opts.label };
  emit();
  const dwell = opts.dwellMs ?? DEFAULT_DWELL_MS;
  timer = setTimeout(() => {
    timer = null;
    clearStatusFlash();
  }, dwell);
}

export function clearStatusFlash(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (!flash) return;
  flash = null;
  emit();
}

/** Test helper. */
export function resetStatusFlashForTests(): void {
  clearStatusFlash();
}
