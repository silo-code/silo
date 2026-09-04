import { store } from "@silo-code/extension-host";
import { ok, type ControlResult } from "./types";

/**
 * `ws.live` — the half of `silo ws list` that disk cannot answer (RFC 0034 R10).
 *
 * ADR 0047 designates workspace enumeration as **Disk-read**: the client reads
 * the workspace files itself and that listing *is* the answer, with or without a
 * running app. This op only annotates it with what is true right now — whether
 * each workspace is open or soft-closed, and which one is active — because those
 * are live facts the on-disk record lags behind (the frontend persists on a
 * debounce, and `activeWorkspaceId` lives in the index blob, not the workspace
 * file).
 *
 * Keyed by workspace id so the client can join without caring about ordering,
 * and so a workspace present on disk but unknown to the running instance simply
 * finds no entry rather than shifting the rows.
 */

/** One workspace's live state. */
export interface WsLiveEntry {
  /** `false` for a soft-closed workspace — still on disk, hidden from the list. */
  open: boolean;
  /** Whether this is the workspace the window is currently showing. */
  active: boolean;
}

/** The `ws.live` payload. */
export interface WsLiveData {
  workspaces: Record<string, WsLiveEntry>;
}

/**
 * Snapshot every workspace the running instance knows about.
 *
 * Never fails: an instance with no workspaces answers an empty map, which the
 * client renders as a disk listing with every row annotated "not open" — the
 * true answer, and distinct from the client's no-overlay case.
 */
export function applyWsLive(): ControlResult {
  const workspaces: Record<string, WsLiveEntry> = {};
  for (const [id, ws] of Object.entries(store.workspaces)) {
    workspaces[id] = {
      // `closedAt` is the soft-close marker (null/undefined means open).
      open: !ws.closedAt,
      active: id === store.activeWorkspaceId,
    };
  }
  return ok({ workspaces } satisfies WsLiveData);
}
