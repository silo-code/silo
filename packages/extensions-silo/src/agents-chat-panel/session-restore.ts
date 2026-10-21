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
 * Whether this reconnect keeps the Context reading
 * ({@link AcpChatPanelParams.usage}) it had before, or starts from no reading
 * at all.
 *
 * `usage_update` is a **per-turn** frame — no agent sends one at connect or
 * resume time — so a reading cleared on reconnect stays blank until the user
 * sends a message *and* that turn finishes. For a reconnect that resumes the
 * same conversation that blank is a hole, not information: the context is
 * still loaded, and the last reading is the best answer available until the
 * agent reports again.
 *
 * A fresh start is the opposite. `reset` (Clear, RFC 0048) and
 * `continue-fresh` ("Continue in a new session", RFC 0042) both begin an empty
 * context, so carrying the old figure forward would overstate it until the
 * first turn corrected it.
 *
 * Note this is about *remembering* a reading the agent really sent, never
 * about inventing one — {@link AgentSessionUsage} is explicit that a reading
 * must not be synthesized when the agent hasn't sent it.
 */
export function carriesUsageForward(intent: RestartIntent | null): boolean {
  return intent !== "reset" && intent !== "continue-fresh";
}

/**
 * The seed title to paint immediately while this reconnect's handshake is in
 * flight ({@link AcpChatPanelParams.title}) — the old session's agent-given
 * title, for anything that keeps the same conversation: an ordinary
 * reconnect/resume, or `continue-fresh` ("Continue in a new session"), which
 * carries the old journal into the new session and so carries its title too.
 *
 * `undefined` only for `reset` (Clear, RFC 0048): the one restart that
 * discards the old conversation's journal outright, so it has no more claim
 * to that conversation's title than a brand-new session would. The host's
 * `chatSessionState` backstop (`acp-sessions-service.ts`'s `restoredTitle`)
 * makes the matching exclusion for the same reason, so the two sides agree
 * on when a title has no history to fall back on.
 *
 * Deliberately **not** the same split as {@link carriesUsageForward}: the
 * Context reading resets for `continue-fresh` too, but that is a fact about
 * the new session process's own token accounting (it genuinely starts at
 * zero), not about whether it is "the same conversation" — which, for
 * `continue-fresh`, it is.
 */
export function seedTitleFor(
  title: string | null | undefined,
  intent: RestartIntent | null,
): string | undefined {
  return intent === "reset" ? undefined : (title ?? undefined);
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
