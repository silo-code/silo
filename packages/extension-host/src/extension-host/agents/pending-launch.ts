// The pending-launch registry (RFC 0033 R6). A launch is an *intent*, not a
// spawn: `launchAgentProfile` records what should be typed into a terminal once
// its session is live, and whoever brings the session up — the mounted
// `TerminalPanel`, or `ensureSession`'s lazy spawn — drains it.
//
// `takePendingLaunch` is **remove-on-read**, which is the entire concurrency
// argument: whichever path arrives second gets `null`. One map operation, no
// lock. The registry is a module-level map and is **never persisted** — a
// launch intent that survived a restart would type into a terminal the user
// reopened later, unprompted; losing it on a crash and getting a plain shell is
// the correct failure instead.
//
// The drain is deliberately decoupled from session-readiness (RFC 0033 R6):
// `takePendingLaunch` does not itself check anything, so phase 2's
// `silo agent run` inside a live terminal can add a caller that drains on a
// different signal without reworking this.

import { getAgentProfiles } from "../../state/agent-profiles";
import { tauriTerminalClient } from "../../services/tauri-terminal-client";
import { profileLaunchLine } from "./agent-profile-model";

/**
 * `profileId` — resolve the profile and its launch line at drain time (an edit
 * or delete landing in between is respected). `rawLine` — type this exact line,
 * for the deprecated `ctx.terminals.create({ kind: "claude" | "pi" })` path
 * where no profile matched (RFC 0033 R9): a bare command with nothing to edit.
 */
export type PendingLaunch = { profileId: string } | { rawLine: string };

const pending = new Map<string, PendingLaunch>();

/** Record which profile to launch into `terminalId` once its session is live. */
export function requestProfileLaunch(
  terminalId: string,
  profileId: string,
): void {
  pending.set(terminalId, { profileId });
}

/** Record a bare command line to type into `terminalId` once its session is
 *  live — the deprecated-kind fallback with no matching profile. */
export function requestRawLaunch(terminalId: string, rawLine: string): void {
  pending.set(terminalId, { rawLine });
}

/** Claim the pending launch for `terminalId` and remove it — or `null`. The
 *  remove-on-read is what makes a double-drain impossible. */
export function takePendingLaunch(terminalId: string): PendingLaunch | null {
  const entry = pending.get(terminalId) ?? null;
  pending.delete(terminalId);
  return entry;
}

/** Drop a pending launch unconsumed — the terminal record was removed, or its
 *  workspace was reaped, before any session came up. */
export function discardPendingLaunch(terminalId: string): void {
  pending.delete(terminalId);
}

/** Test seam — true when a pending launch is registered for `terminalId`. */
export function hasPendingLaunch(terminalId: string): boolean {
  return pending.has(terminalId);
}

/**
 * Drain the pending launch for `terminalId` against a now-live `sessionId`:
 * resolve the profile **at this moment** (a delete landing since the click
 * drains to nothing and leaves a plain shell) and type its launch line.
 */
export function drainPendingLaunch(
  terminalId: string,
  sessionId: string,
): void {
  const claim = takePendingLaunch(terminalId);
  if (!claim) return;

  if ("rawLine" in claim) {
    tauriTerminalClient.sendInput(sessionId, `${claim.rawLine}\r`);
    return;
  }

  const profile = getAgentProfiles().find((p) => p.id === claim.profileId);
  if (!profile) return; // deleted between the click and the session coming up

  tauriTerminalClient.sendInput(sessionId, `${profileLaunchLine(profile)}\r`);
}
