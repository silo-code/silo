import { subscribe } from "valtio";
import { store } from "./store";
import type { AgentProfile } from "./types";

/**
 * The single read/write seam for Agent Profiles (RFC 0033), mirroring
 * `terminal-settings.ts`. `core.agents-settings` reaches these through
 * `@silo-code/extension-host/internal`; the `+` menu (host chrome) reads
 * `store.agentProfiles` directly.
 *
 * Profile ids are a foreign key in `TerminalRecord.profileId`. Renaming an id
 * (`updateAgentProfile`) and deleting a profile (`removeAgentProfile`) both run
 * the reference sweep in the **same mutation**, so a persistence tick can never
 * observe a dangling reference.
 */

/** Current profiles, in menu order. */
export function getAgentProfiles(): readonly AgentProfile[] {
  return store.agentProfiles;
}

/** Subscribe to any change to the profile list. Returns a disposer. */
export function subscribeAgentProfiles(listener: () => void): () => void {
  return subscribe(store.agentProfiles, listener);
}

/** Append a profile. The caller is responsible for a valid, unique id. */
export function addAgentProfile(profile: AgentProfile): void {
  store.agentProfiles.push({ ...profile });
}

/**
 * Patch a profile by its current id. When `patch.id` differs from `id`, every
 * `TerminalRecord.profileId === id` across every workspace is rewritten to the
 * new id in the same mutation.
 */
export function updateAgentProfile(
  id: string,
  patch: Partial<AgentProfile>,
): void {
  const idx = store.agentProfiles.findIndex((p) => p.id === id);
  if (idx === -1) return;
  const next = { ...store.agentProfiles[idx], ...patch };
  store.agentProfiles[idx] = next;
  if (patch.id !== undefined && patch.id !== id) {
    sweepProfileReferences(id, patch.id);
  }
}

/**
 * Remove a profile and clear `profileId` on every terminal that referenced it.
 * The terminals themselves are untouched and keep running.
 */
export function removeAgentProfile(id: string): void {
  const idx = store.agentProfiles.findIndex((p) => p.id === id);
  if (idx === -1) return;
  store.agentProfiles.splice(idx, 1);
  sweepProfileReferences(id, undefined);
}

/** Move a profile one slot up (`-1`) or down (`+1`). No-op at the ends. */
export function moveAgentProfile(id: string, delta: -1 | 1): void {
  const list = store.agentProfiles;
  const idx = list.findIndex((p) => p.id === id);
  if (idx === -1) return;
  const target = idx + delta;
  if (target < 0 || target >= list.length) return;
  const [rec] = list.splice(idx, 1);
  list.splice(target, 0, rec);
}

/**
 * Rewrite (`to` set) or clear (`to` undefined) every `TerminalRecord.profileId`
 * that equals `from`, across every workspace. Runs inside the caller's mutation.
 */
export function sweepProfileReferences(
  from: string,
  to: string | undefined,
): void {
  for (const ws of Object.values(store.workspaces)) {
    for (const t of ws.terminals) {
      if (t.profileId !== from) continue;
      if (to === undefined) delete t.profileId;
      else t.profileId = to;
    }
  }
}
