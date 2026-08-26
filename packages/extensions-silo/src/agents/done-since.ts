import type { AgentInfo, ExtensionStorage } from "@silo-code/sdk";
import { updateDoneSince } from "./agents-panel-view";

// "How long has this row been done" — the one piece of state the host doesn't
// expose a timestamp for (unlike ready/working), so the extension tracks it
// itself. It lives here, at extension scope, rather than inside a panel
// component: both agent views read the same timestamps, and tracking must keep
// running whichever view (if any) the user currently has open.
//
// Persisted so the stamps survive an extension reload or app restart —
// without that, every reload would re-stamp every currently-done row as "just
// now" (see the caveat on `AgentRow.since`). A plain object, not a Map:
// storage values round-trip through JSON.
const STORAGE_KEY = "agentsDoneSince";

let storage: ExtensionStorage | null = null;
let doneSince: ReadonlyMap<string, string> = new Map();

/** Seed from persisted storage. Re-reads on every storage change (hydrate /
 * id migration) so a value saved under a retired extension id is picked up
 * once the host rewrites the bag. Call once from `activate()`. */
export function initDoneSince(s: ExtensionStorage): { dispose(): void } {
  storage = s;
  function read() {
    doneSince = new Map(
      Object.entries(s.get<Record<string, string>>(STORAGE_KEY, {})),
    );
  }
  read();
  const sub = s.subscribe(read);
  return { dispose: () => sub.dispose() };
}

function sameContents(
  a: ReadonlyMap<string, string>,
  b: ReadonlyMap<string, string>,
): boolean {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) if (b.get(k) !== v) return false;
  return true;
}

/**
 * Fold a fresh agents snapshot in. An id already present keeps its original
 * stamp, so this only ever adds a new one or drops a row that's no longer
 * done — it never overwrites. Writes to storage only when the contents
 * actually changed, so the steady state costs nothing.
 */
export function recordDoneSince(agents: readonly AgentInfo[]): void {
  const next = updateDoneSince(doneSince, agents, new Date().toISOString());
  if (sameContents(next, doneSince)) return;
  doneSince = next;
  storage?.set(STORAGE_KEY, Object.fromEntries(next));
}

/** The current stamps, for building rows. */
export function getDoneSince(): ReadonlyMap<string, string> {
  return doneSince;
}

/** Drop all state — tests only, so one case can't leak into the next. */
export function resetDoneSince(): void {
  storage = null;
  doneSince = new Map();
}
