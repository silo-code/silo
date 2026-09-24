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
 * The `connect()` option for a **session reset** (RFC 0048) — what Clear
 * means: skip straight to `session/new` *and* discard the journal this id was
 * writing, so neither the agent nor the transcript remembers the conversation
 * the user just threw away.
 *
 * The same mechanism as {@link continueInNewSessionOption}, opposite intent on
 * the journal: recovery carries the conversation forward, a clear does not.
 */
export function sessionResetOption(sessionId: string): AgentSessionRestore {
  return { sessionId, startFresh: true, transcript: "discard" };
}

/**
 * Why a reconnect is happening, as the panel knows it just before it bumps
 * `nonce` — `null` for an ordinary connect, remount, or "Reconnect", which
 * take the normal resume → load → journal path.
 */
export type RestartIntent = "continue-fresh" | "reset" | "resume-other";

/**
 * The restore option for one reconnect: the panel's persisted session id read
 * through whichever intent set off this reconnect. `undefined` when there is
 * nothing to restore (a brand-new panel), which is an ordinary `session/new`.
 */
export function restoreOptionFor(
  sessionId: string | null | undefined,
  intent: RestartIntent | null,
): AgentSessionRestore | undefined {
  if (!sessionId) return undefined;
  if (intent === "reset") return sessionResetOption(sessionId);
  if (intent === "continue-fresh") return continueInNewSessionOption(sessionId);
  // Session Discovery (RFC 0051): resuming a different, already-existing
  // session picked from the agent's own `session/list` is a plain resume —
  // `{ sessionId }`, same as `intent === null` — not a fresh start. Spelled
  // out explicitly rather than left to the fallback below, so a future
  // divergence (e.g. a different transcript strategy for a foreign session)
  // has an obvious seam.
  if (intent === "resume-other") return resumeOptionFor(sessionId);
  return resumeOptionFor(sessionId);
}

/**
 * Whether the instant-paint effect (RFC 0042's "paint the journal before
 * connecting" half) should skip repainting from `params.sessionId`'s journal
 * this run.
 *
 * That effect re-runs on every reconnect, including Clear (RFC 0048) — and at
 * that point `params.sessionId` still names the session Clear is discarding,
 * since the connect effect hasn't persisted the new one yet. Painting from it
 * would repaint the very transcript Clear just asked to empty, until the new
 * session's own connect() replaces it — which reads as "Clear doesn't happen
 * until the new session initializes" instead of an immediate clear.
 */
export function shouldSkipInstantPaint(intent: RestartIntent | null): boolean {
  return intent === "reset";
}

/**
 * The folder this panel's session runs in: the one chosen when it was started
 * (RFC 0046), falling back to the workspace's primary folder.
 *
 * `||`, not `??`, on purpose. A panel whose workspace lookup failed persists
 * `cwd: ""`, and `??` would treat that empty string as a real answer — pinning
 * the panel to no working directory for the rest of its life. The persisted
 * value is authoritative precisely *because* it can differ from the primary
 * folder; it just can't be empty.
 */
export function resolveChatCwd(
  persisted: string | undefined,
  workspaceFolder: string,
): string {
  return persisted || workspaceFolder;
}

/**
 * What to persist into `DockPanelState` once a session connects. Keyed on
 * {@link AgentSessionHandle.sessionId} — not necessarily the id that was
 * asked for, since `session/load` may have adopted a new one, and a
 * `startFresh` continuation deliberately keeps the original.
 *
 * An empty `cwd` is left out entirely rather than written, so a bad connect
 * can't persist one and strand every later restore on it.
 */
export function panelStateAfterConnect(
  profileId: string,
  handle: Pick<AgentSessionHandle, "sessionId">,
  cwd: string,
): { profileId: string; sessionId: string; cwd?: string } {
  return {
    profileId,
    sessionId: handle.sessionId,
    ...(cwd ? { cwd } : {}),
  };
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
