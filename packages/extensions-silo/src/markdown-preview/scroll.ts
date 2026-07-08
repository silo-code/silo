// Pure logic for persisting preview scroll position via ctx.storage.workspace —
// kept out of React so it's unit-testable.

export function scrollStorageKey(editorId: string): string {
  return `scrollTop:${editorId}`;
}

/** Guards against corrupt/missing storage values before applying them as a scrollTop. */
export function isValidScrollTop(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
