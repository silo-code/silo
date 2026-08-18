import type { Disposable } from "@silo-code/sdk";
import {
  sortBusyStatusForPopover,
  summarizeBusyStatus,
  type BusyStatusEntry,
  type BusyStatusEntryInput,
  type BusyStatusSummary,
} from "./busy-status-model";

/**
 * Host registry for StatusBar busy status (RFC 0026). Bundled first-party code
 * pushes entries via {@link getUiService}.busyStatus (unstable / @internal);
 * the StatusBar reads {@link getBusyStatusSnapshot} / {@link subscribeBusyStatus}.
 *
 * Snapshot identity is stable between mutations — required by
 * `useSyncExternalStore` (a fresh object every getSnapshot call would
 * infinite-loop re-renders).
 */

export interface BusyStatusSnapshot {
  entries: BusyStatusEntry[];
  summary: BusyStatusSummary;
  popoverEntries: BusyStatusEntry[];
}

const entries = new Map<string, BusyStatusEntry>();
const listeners = new Set<() => void>();

let cachedSnapshot: BusyStatusSnapshot = buildSnapshot();

function buildSnapshot(): BusyStatusSnapshot {
  const list = [...entries.values()];
  return {
    entries: list,
    summary: summarizeBusyStatus(list),
    popoverEntries: sortBusyStatusForPopover(list),
  };
}

function emit(): void {
  cachedSnapshot = buildSnapshot();
  for (const l of listeners) l();
}

/** @internal — subscribe to registry changes (StatusBar / tests). */
export function subscribeBusyStatus(listener: () => void): Disposable {
  listeners.add(listener);
  return {
    dispose() {
      listeners.delete(listener);
    },
  };
}

/** @internal — current entries + summary for the StatusBar slot. */
export function getBusyStatusSnapshot(): BusyStatusSnapshot {
  return cachedSnapshot;
}

/**
 * @internal — push or replace by id. Disposable clears this id (idempotent if
 * another writer already replaced it).
 */
export function setBusyStatus(input: BusyStatusEntryInput): Disposable {
  const id = input.id;
  entries.set(id, {
    id,
    label: input.label,
    detail: input.detail,
    urgency: input.urgency ?? "normal",
    updatedAt: Date.now(),
  });
  emit();
  return {
    dispose() {
      clearBusyStatus(id);
    },
  };
}

/** @internal — remove one entry by id. */
export function clearBusyStatus(id: string): void {
  if (!entries.delete(id)) return;
  emit();
}

/** @internal — tests only. */
export function resetBusyStatusForTests(): void {
  entries.clear();
  emit();
}
