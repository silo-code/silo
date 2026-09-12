/**
 * Pure decision logic for **Chat session resurrection** (RFC 0042) at the
 * panel boundary — kept out of `AcpChatPanel.tsx` so it is unit-tested rather
 * than exercised only through the component (the same split `profile-switch.ts`
 * makes for the profile-switch confirmation).
 */

import type { AgentSessionHandle, AgentSessionRestore } from "@silo-code/sdk";

/**
 * The `connect()` restore option for a panel's persisted `sessionId` —
 * `undefined` for a brand-new session (nothing to restore).
 */
export function resumeOptionFor(
  sessionId: string | null | undefined,
): AgentSessionRestore | undefined {
  return sessionId ? { sessionId } : undefined;
}

/**
 * The `connect()` option for "Continue in a new session" from a
 * `"journal-only"` handle — reads the old journal by this id and skips
 * straight to `session/new`. The *new* handle gets a new
 * `AgentSessionHandle.sessionId` (the journal carries over into its file);
 * `panelStateAfterConnect` persists that one, same as any other connect.
 */
export function continueInNewSessionOption(
  sessionId: string,
): AgentSessionRestore {
  return { sessionId, startFresh: true };
}

/**
 * What to persist into `DockPanelState` once a session connects. Keyed on
 * {@link AgentSessionHandle.sessionId} — not necessarily the id that was
 * asked for, since `session/load` may have adopted a new one, and a
 * `startFresh` continuation deliberately keeps the original. `cwd` is the
 * live workspace folder, never a stale persisted one.
 */
export function panelStateAfterConnect(
  profileId: string,
  handle: Pick<AgentSessionHandle, "sessionId">,
  cwd: string,
): { profileId: string; sessionId: string; cwd: string } {
  return { profileId, sessionId: handle.sessionId, cwd };
}

/**
 * Whether the composer should be read-only — true only for
 * `resumeOutcome: "journal-only"`, the one outcome with no live agent to
 * prompt.
 */
export function isReadOnly(
  resumeOutcome: AgentSessionHandle["resumeOutcome"] | undefined,
): boolean {
  return resumeOutcome === "journal-only";
}
