/**
 * Which **Agent Profile** the Chat panel binds to (RFC 0038 phase 3).
 *
 * The panel drives `ctx.agents.sessions.connect(profileId)`, which takes a
 * user-authored profile id and nothing else — so the panel's first job is
 * turning "whatever the user has defined" plus "whatever this tab remembered"
 * into one profile. Pure, so the resolution order is tested rather than
 * inferred from the component.
 */

import type { AgentProfileSummary } from "@silo-code/sdk";

/** The profiles a Chat session can be connected to — `launch.interface` is
 *  `"chat"`. A Terminal profile is not a lesser Chat profile: `connect()`
 *  rejects it outright, so it must never reach the picker. */
export function chatProfiles(
  all: readonly AgentProfileSummary[],
): readonly AgentProfileSummary[] {
  return all.filter((p) => p.interface === "chat");
}

/**
 * Pick the profile this panel should connect to, in order:
 *
 * 1. `requestedId`, when it names a Chat profile — the id the tab persisted,
 *    so a reopened panel comes back on the same agent.
 * 2. The user's **default** profile, when that happens to be a Chat one.
 * 3. The first Chat profile in the user's own order.
 *
 * `undefined` means the user has no Chat profile at all, which is a state to
 * render (a prompt to go and make one), not an error.
 *
 * A `requestedId` that is missing or Terminal-armed falls through rather than
 * failing: profiles are user-editable, so a remembered id can name a profile
 * that was deleted or switched to Terminal since, and opening on a working
 * agent beats refusing to open.
 */
export function resolveChatProfile(
  all: readonly AgentProfileSummary[],
  requestedId?: string,
): AgentProfileSummary | undefined {
  const chat = chatProfiles(all);
  if (requestedId) {
    const requested = chat.find((p) => p.id === requestedId);
    if (requested) return requested;
  }
  return chat.find((p) => p.isDefault) ?? chat[0];
}
