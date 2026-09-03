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
import { agentById, promptDeliveryForAgent } from "./agent-catalog";
import { profileLaunchLine } from "./agent-profile-model";
import {
  composePromptLaunchLine,
  resolveProfileAgentId,
  MAX_PROMPT_BYTES,
  type PromptRefusal,
  type ShellDialect,
} from "./agent-prompt";
import { agentsChannel } from "./agents-channel";
import type { AgentProfile } from "../../state/types";

/**
 * `profileId` — resolve the profile and its launch line at drain time (an edit
 * or delete landing in between is respected). `rawLine` — type this exact line,
 * for the deprecated `ctx.terminals.create({ kind: "claude" | "pi" })` path
 * where no profile matched (RFC 0033 R9): a bare command with nothing to edit.
 *
 * Only the `profileId` arm can carry a `prompt` (RFC 0033 phase 3): the
 * `rawLine` arm has no profile and therefore no agent to resolve a delivery
 * shape from. Its `dialect` is decided **once**, by the caller, at registration
 * — carrying it here rather than re-deriving it at drain means the precheck and
 * the drain can only disagree about the profile, which is the one input phase 1
 * deliberately resolves late.
 */
export type PendingLaunch =
  | { profileId: string; prompt?: string; dialect?: ShellDialect }
  | { rawLine: string };

const pending = new Map<string, PendingLaunch>();

/** Record which profile to launch into `terminalId` once its session is live,
 *  optionally with an opening prompt quoted for `dialect`. */
export function requestProfileLaunch(
  terminalId: string,
  profileId: string,
  prompt?: string,
  dialect?: ShellDialect,
): void {
  pending.set(
    terminalId,
    prompt === undefined
      ? { profileId }
      : { profileId, prompt, dialect: dialect ?? "unsupported" },
  );
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

/** An agent's display name for a message, or a neutral phrase when the id
 *  isn't in the catalog. */
function agentDisplayName(agentId: string | undefined): string {
  return (agentId && agentById(agentId)?.displayName) || "This agent";
}

/** Plain-language reason a drained prompt was not typed, for the Output panel.
 *  Each refusal names the thing the user would have to change. */
function refusalMessage(
  refusal: PromptRefusal,
  profile: AgentProfile,
  dialect: ShellDialect | undefined,
): string {
  switch (refusal) {
    case "no-agent":
      return `Agent profile “${profile.label}” matches no known agent, so Silo can't tell how to hand it an opening prompt. Set the agent on Settings → Agents → Profiles.`;
    case "agent-takes-none":
      return `${agentDisplayName(resolveProfileAgentId(profile))} has no way to take an opening prompt while staying interactive, so the prompt was not sent.`;
    case "unsupported-shell":
      return `Silo has no exact quoting rule for the shell this terminal runs${dialect === undefined ? "" : ` (${dialect})`}, so the prompt was not sent. bash, zsh, and fish are supported.`;
    case "too-large":
      return `The prompt is larger than the ${MAX_PROMPT_BYTES / 1024} KiB limit, so it was not sent.`;
  }
}

/**
 * Drain the pending launch for `terminalId` against a now-live `sessionId`:
 * resolve the profile **at this moment** (a delete landing since the click
 * drains to nothing and leaves a plain shell) and type its launch line.
 *
 * With a prompt claimed, the composition runs again here against the profile
 * as it is now — the one input that can legitimately have changed since the
 * precheck. A refusal at this point types **nothing** and logs: the terminal
 * already exists and is left as a plain shell, which is the same shape as
 * phase 1's "a profile deleted mid-launch drains to nothing", and the one
 * refusal `ctx.agents.profiles.launch()` cannot return, because it has already
 * returned.
 */
export function drainPendingLaunch(
  terminalId: string,
  sessionId: string,
): void {
  const claim = takePendingLaunch(terminalId);
  if (!claim) return;

  if ("rawLine" in claim) {
    sendLine(sessionId, claim.rawLine);
    return;
  }

  const profile = getAgentProfiles().find((p) => p.id === claim.profileId);
  if (!profile) return; // deleted between the click and the session coming up

  const launchLine = profileLaunchLine(profile);
  if (claim.prompt === undefined) {
    sendLine(sessionId, launchLine);
    return;
  }

  const agentId = resolveProfileAgentId(profile);
  const composed = composePromptLaunchLine({
    launchLine,
    prompt: claim.prompt,
    agentId,
    delivery: promptDeliveryForAgent(agentId),
    dialect: claim.dialect ?? "unsupported",
  });
  if ("refusal" in composed) {
    agentsChannel.warn(
      refusalMessage(composed.refusal, profile, claim.dialect),
    );
    return;
  }
  sendLine(sessionId, composed.line);
}

/**
 * How much of a launch line to hand the PTY per write (RFC 0033 phase 3).
 *
 * **This is not a tuning knob — it is a correctness bound.** The session
 * daemon's `write_master_timed` (`crates/pty-host/src/daemon.rs`) writes a
 * frame's payload to the PTY master under a **one-second deadline and then
 * silently drops whatever is left** ("write_master: timeout after N/M bytes").
 * A 16 KiB heredoc is exactly the payload that can hit that: a plugin-heavy
 * line editor (zsh-autosuggestions, syntax highlighting) re-renders on every
 * chunk it consumes, so it drains slowly — and a heredoc truncated before its
 * closing delimiter never terminates, leaving the user's shell parked in an
 * unterminated quote waiting for input that will never come.
 *
 * One write per frame, one deadline per frame: splitting the line gives each
 * piece its own full budget, and each piece is small enough to land in the
 * PTY's input buffer in a single `write(2)` in the ordinary case. Ordering is
 * preserved by the per-session writer thread, and 16 chunks is far inside the
 * 64-slot write queue `terminal_write` enqueues into.
 */
const PTY_WRITE_CHUNK_BYTES = 1024;

/**
 * The **single** `\n` → `\r` seam in the codebase (RFC 0033 phase 3). The
 * composed line is a normal multi-line string; terminals take `\r` for Enter,
 * so every newline — including the heredoc's own — becomes one here, once, plus
 * the trailing `\r` that submits the line.
 *
 * Doing this conversion in a second place is how a heredoc silently never
 * terminates and wedges the user's shell in an unterminated quote, so it lives
 * here and nowhere else. `composePromptLaunchLine` deliberately returns `\n`
 * text and asserts as much in its own tests.
 *
 * A line that fits in one chunk — every promptless launch, and every short
 * prompt — is sent in exactly one `sendInput` call carrying exactly
 * `line + "\r"`, byte for byte what phases 1 and 2 sent.
 */
function sendLine(sessionId: string, line: string): void {
  const wire = `${line.replace(/\n/g, "\r")}\r`;
  for (const chunk of chunkForPty(wire)) {
    tauriTerminalClient.sendInput(sessionId, chunk);
  }
}

/**
 * Split `text` into pieces of at most {@link PTY_WRITE_CHUNK_BYTES} **UTF-8
 * bytes**, never inside a character. `sendInput` encodes each call
 * independently, so splitting by JS code units would cut a surrogate pair in
 * half and put replacement bytes on the wire; iterating code points is what
 * keeps an emoji or a CJK character in a prompt intact across a boundary.
 */
export function chunkForPty(text: string): string[] {
  const encoder = new TextEncoder();
  if (encoder.encode(text).length <= PTY_WRITE_CHUNK_BYTES) return [text];

  const chunks: string[] = [];
  let current = "";
  let currentBytes = 0;
  for (const codePoint of text) {
    const size = encoder.encode(codePoint).length;
    if (currentBytes + size > PTY_WRITE_CHUNK_BYTES) {
      chunks.push(current);
      current = "";
      currentBytes = 0;
    }
    current += codePoint;
    currentBytes += size;
  }
  if (current) chunks.push(current);
  return chunks;
}
