/**
 * Per-agent OSC sequence detectors for terminal status auto-detection.
 *
 * Each detector is a pure function that inspects one `{ code, payload }` pair
 * and returns either `null` (not handled) or a `DetectionResult` describing
 * the status to apply and whether to start/cancel the idle debounce timer.
 *
 * The dispatcher in `index.tsx` runs `AGENT_DETECTORS` in order and takes the
 * first non-null result. Adding support for a new agent means adding a new
 * detector function and appending it to the array — nothing else changes.
 */

import type { IconChoice } from "./types";

export type TimerAction = "schedule" | "clear";

export interface DetectionResult {
  status: IconChoice;
  /** "schedule" → reset the idle debounce timer; "clear" → cancel it. */
  timer?: TimerAction;
}

// ---------------------------------------------------------------------------
// Claude Code  (OSC 0 title encoding)
// ---------------------------------------------------------------------------
// Prefixes its OSC 0 title with an animated spinner glyph while busy, and with
// ✳ (U+2733) as an explicit idle signal when waiting for input.
//
// Two spinner ranges are accepted, because the glyph changed: current Claude
// Code (confirmed 2.1.228) animates the half-filled circles ◐/◑
// (U+25D0–U+25D3), while older builds — and Codex CLI, which shares this
// detector — use braille block characters (U+2800–U+28FF). The ✳ idle signal
// and debounce timer handle the Claude/Codex difference: Claude emits ✳
// immediately; Codex relies on the timer after silence.
const BRAILLE_START = 0x2800;
const BRAILLE_END = 0x28ff;
const CIRCLE_SPINNER_START = 0x25d0;
const CIRCLE_SPINNER_END = 0x25d3;
const CLAUDE_IDLE_CHAR = "\u2733"; // ✳

function startsWithSpinnerGlyph(payload: string): boolean {
  const first = payload.charCodeAt(0);
  return (
    (first >= BRAILLE_START && first <= BRAILLE_END) ||
    (first >= CIRCLE_SPINNER_START && first <= CIRCLE_SPINNER_END)
  );
}

export function detectClaudeCode(
  code: number,
  payload: string,
): DetectionResult | null {
  if (code !== 0) return null;
  if (startsWithSpinnerGlyph(payload)) {
    // Spinner frame: agent is busy. Schedule idle timer as a fallback for
    // Codex (which doesn't emit an explicit done signal).
    return { status: "working", timer: "schedule" };
  }
  if (payload.startsWith(CLAUDE_IDLE_CHAR)) {
    // Explicit idle signal from Claude Code.
    return { status: "waiting", timer: "clear" };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Codex CLI  (OSC 0 title + OSC 9 desktop notifications)
// ---------------------------------------------------------------------------
// Codex clears its title to empty on exit and emits "[ ! ]"/"[ . ]" when
// awaiting user approval. It also emits OSC 9 desktop notifications when
// TERM_PROGRAM=iTerm.app — matched on known payload prefixes only to avoid
// stomping an active Copilot status on unrelated OSC 9 from other programs.
const CODEX_ACTION_REQUIRED = ["[ ! ]", "[ . ]"];
const CODEX_DONE_NOTIFICATIONS = [
  "Agent turn complete",
  "Approval requested",
  "Codex wants to edit",
];

export function detectCodexCLI(
  code: number,
  payload: string,
): DetectionResult | null {
  if (code === 0) {
    if (
      payload === "" ||
      CODEX_ACTION_REQUIRED.some((p) => payload.startsWith(p))
    ) {
      return { status: "waiting", timer: "clear" };
    }
    return null;
  }
  if (
    code === 9 &&
    CODEX_DONE_NOTIFICATIONS.some((p) => payload.startsWith(p))
  ) {
    return { status: "waiting", timer: "clear" };
  }
  return null;
}

// ---------------------------------------------------------------------------
// GitHub Copilot CLI  (OSC 9;4 ConEmu/Windows Terminal progress protocol)
// ---------------------------------------------------------------------------
// Payload format: "4;<state>" or "4;<state>;<progress%>"
// Copilot emits state=3 while actively running and state=0 on completion.
// States 1/2/3 → working; states 0/4 → waiting.
const COPILOT_PROGRESS_PREFIX = "4;";

export function detectCopilotCLI(
  code: number,
  payload: string,
): DetectionResult | null {
  if (code !== 9 || !payload.startsWith(COPILOT_PROGRESS_PREFIX)) return null;
  const state = parseInt(payload.slice(COPILOT_PROGRESS_PREFIX.length), 10);
  if (state === 1 || state === 2 || state === 3) return { status: "working" };
  if (state === 0 || state === 4) return { status: "waiting" };
  return null;
}

// ---------------------------------------------------------------------------
// Shell integration  (OSC 133 FTCS protocol — zsh/bash/fish, used by pi etc.)
// ---------------------------------------------------------------------------
// A=prompt start, B=command entered, C=command output start, D[;exit]=command done.
// A and D may carry extra params (e.g. "A;k=s" kitty keyboard protocol), so
// we use startsWith. Agents that emit 133;C per step but never emit A/D (e.g. pi)
// rely on the idle debounce timer to clear the status after silence.
const SHELL_COMMAND_RUNNING = "C";
const SHELL_PROMPT_START = "A";

export function detectShellIntegration(
  code: number,
  payload: string,
): DetectionResult | null {
  if (code !== 133) return null;
  if (payload === SHELL_COMMAND_RUNNING) {
    return { status: "working", timer: "schedule" };
  }
  if (payload.startsWith(SHELL_PROMPT_START) || payload.startsWith("D")) {
    return { status: "waiting", timer: "clear" };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Ordered detector list — first non-null result wins.
// ---------------------------------------------------------------------------
// Copilot before Codex: both use OSC 9 but with non-overlapping payloads.
// Copilot's "4;" prefix is checked first; Codex uses known notification strings.
export const AGENT_DETECTORS = [
  detectCopilotCLI,
  detectClaudeCode,
  detectCodexCLI,
  detectShellIntegration,
];
