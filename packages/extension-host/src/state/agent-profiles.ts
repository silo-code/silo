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

/**
 * Replace the whole list **in place**, identity-preserving — the hydrate seam.
 *
 * `core.agents-settings` activates in `activateBuiltins()` (synchronous, before
 * the async `hydrate`) and calls {@link subscribeAgentProfiles} right then, so
 * the per-profile `core.newAgent.<id>` command sync is watching this exact
 * array before it holds any persisted data. Reassigning `store.agentProfiles`
 * would orphan that subscription; `splice` keeps the proxy identity and fires
 * the subscribers with the loaded profiles.
 */
export function replaceAgentProfiles(profiles: readonly AgentProfile[]): void {
  store.agentProfiles.splice(
    0,
    store.agentProfiles.length,
    ...profiles.map((p) => ({ ...p })),
  );
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

/**
 * Mark `id` as the default profile, clearing `default` from every other profile
 * in the **same mutation** so the "at most one default" invariant can never be
 * observed broken by a persistence tick. No-op if `id` doesn't exist.
 */
export function setDefaultAgentProfile(id: string): void {
  if (!store.agentProfiles.some((p) => p.id === id)) return;
  for (const p of store.agentProfiles) {
    if (p.id === id) p.default = true;
    else if (p.default) delete p.default;
  }
}

/** Clear the `default` flag from every profile. */
export function clearDefaultAgentProfile(): void {
  for (const p of store.agentProfiles) {
    if (p.default) delete p.default;
  }
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
