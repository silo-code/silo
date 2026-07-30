/**
 * Pure per-agent OSC/output activity detectors for `ctx.agents` (RFC 0018).
 * Sealed inside the host — there is no registration API (see the RFC's
 * "Detection is sealed, not pluggable"). Ported from
 * `silo-extensions/agent-monitor`'s private `osc-detectors.ts` — full parity,
 * not just Claude: Claude Code, Cursor Agent, Codex CLI, and GitHub Copilot
 * CLI all have dedicated detectors here, the same as agent-monitor.
 *
 * These are just the detector *functions*. Which agents use which detector,
 * and the dispatch order, live in `agent-catalog.ts` (`detectFromOsc`/
 * `detectIdleAfterWorking`/`detectFromOutput`) — the single source of truth
 * for per-agent knowledge. `detectShellIntegration` is the one generic (not
 * agent-specific) fallback and isn't attached to any catalog entry.
 */

export interface DetectionResult {
  status: "working" | "idle" | "error";
  /** Which class of program emitted the sequence. Agent-specific detectors
   * tag `"agent"`; the generic OSC 133 shell-integration detector (which
   * fires for ordinary shell commands too) tags `"shell"`. The activity
   * reducer (`agent-activity-model.ts`) uses the tag to promote/demote
   * terminals and to gate which source is allowed to end a working phase. */
  source: "agent" | "shell";
  /**
   * "schedule" → (re)arm the shell-idle debounce timer;
   * "schedule-agent" → (re)arm the agent-idle debounce timer (ends
   *   agent-sourced working on silence — used by Cursor Agent's raw-output
   *   spinner fallback, which has no explicit "idle" signal of its own);
   * "clear" → cancel the shell-idle timer.
   * See `agent-detection-dispatch.ts`'s `planDetection` for exactly how each
   * value is acted on.
   */
  timer?: "schedule" | "schedule-agent" | "clear";
}

const BRAILLE_START = 0x2800;
const BRAILLE_END = 0x28ff;
const CLAUDE_IDLE_CHAR = "✳";

/**
 * Claude Code's braille spinner (working) + `✳` idle marker (idle).
 * Note: Codex CLI uses the *same* braille spinner range for "working", so
 * the braille → working branch covers both — that's why this function is
 * also attached to Codex's `activityDetectors` in the catalog, not just
 * Claude's. Codex has no `✳` of its own though; its idle transitions are
 * handled separately by `detectCodexCLI`/`detectCodexIdleAfterWorking`.
 */
export function detectClaudeCode(
  code: number,
  payload: string,
): DetectionResult | null {
  if (code !== 0) return null;
  const first = payload.charCodeAt(0);
  if (first >= BRAILLE_START && first <= BRAILLE_END) {
    return { status: "working", source: "agent", timer: "schedule" };
  }
  if (payload.startsWith(CLAUDE_IDLE_CHAR)) {
    return { status: "idle", source: "agent", timer: "clear" };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Cursor Agent  (OSC 0 title encoding + raw-output spinner fallback)
// ---------------------------------------------------------------------------
// Preferred signal: OSC 0 titles like `"<name> - <emoji?> <status>"` from
// cursor-agent's terminal-title-status.ts. Those titles are ONLY emitted when
// `display.showStatusIndicators` is true in ~/.cursor/cli-config.json (default
// is false!) — without that setting the OSC path is silent.
//
// Fallback: the ink TUI always renders a distinctive 2-cell braille spinner
// into the PTY stream while busy. Matching those exact frames via raw output
// (not OSC) works regardless of the config flag. Silence after the last frame
// ends working via the agent idle timer — see `detectCursorAgentOutput`.
//
// Working titles: ⏳ Working …, 🧭 Planning, ⌨️ Running shell command, …
// Idle titles: ✅ Ready, ❓ Waiting for you, 🔐 Waiting for confirmation
// Idle reset (statusIndicator=null): bare "Cursor Agent" / "(local-agent)".
// An optional " (worktree)" suffix may be appended to any of the above.
const CURSOR_BARE_TITLE_RE =
  /^Cursor Agent(?: \(local-agent\))?(?: \([^)]+\))?$/;
const CURSOR_WORKING_EMOJI = ["📤", "📂", "🔄", "⌨️", "🧭", "⏳", "📋", "📝"];
const CURSOR_IDLE_EMOJI = ["❓", "🔐", "✅"];
const CURSOR_WORKING_STATUSES = [
  "Moving to cloud",
  "Loading conversation",
  "Reconnecting",
  "Running shell command",
  "Planning",
  "Working",
  "Queued",
  "Reviewing changes",
];
const CURSOR_IDLE_STATUSES = [
  "Waiting for you",
  "Waiting for confirmation",
  "Ready",
];

/** Exact ink spinner frames from cursor-agent's spinner-definitions.ts. */
export const CURSOR_SPINNER_FRAMES = [
  "⠀⠞",
  "⠠⠜",
  "⠰⠰",
  "⠘⠤",
  "⠘⠆",
  "⠘⠣",
  "⠰⠳",
  "⠠⠛",
] as const;

function cursorStatusPart(payload: string): string | null {
  const sep = payload.lastIndexOf(" - ");
  if (sep < 0) return null;
  // Drop the optional worktree suffix cursor-agent appends to the full title.
  return payload.slice(sep + 3).replace(/ \([^)]+\)$/, "");
}

function cursorStatusMatches(
  status: string,
  emojis: readonly string[],
  texts: readonly string[],
): boolean {
  if (emojis.some((e) => status.startsWith(e))) return true;
  // useEmoji can be false — then the status is bare text ("Working ...").
  // Strip any leading non-ASCII glyph(s) so the same text table matches both.
  const text = status.replace(/^[^\sA-Za-z]*\s*/, "");
  return texts.some((t) => text === t || text.startsWith(t));
}

export function detectCursorAgent(
  code: number,
  payload: string,
): DetectionResult | null {
  if (code !== 0) return null;
  if (CURSOR_BARE_TITLE_RE.test(payload)) {
    return { status: "idle", source: "agent", timer: "clear" };
  }
  const status = cursorStatusPart(payload);
  if (status === null) return null;
  if (
    cursorStatusMatches(status, CURSOR_WORKING_EMOJI, CURSOR_WORKING_STATUSES)
  ) {
    return { status: "working", source: "agent", timer: "schedule" };
  }
  if (cursorStatusMatches(status, CURSOR_IDLE_EMOJI, CURSOR_IDLE_STATUSES)) {
    return { status: "idle", source: "agent", timer: "clear" };
  }
  return null;
}

/**
 * Raw-PTY fallback for Cursor Agent when OSC status titles are disabled
 * (`showStatusIndicators: false`, the default). Returns working when a known
 * spinner frame appears; the caller must drive the agent-idle timer so
 * silence after the last frame transitions to idle (there is no explicit
 * "idle" signal in raw output to detect instead).
 */
export function detectCursorAgentOutput(chunk: string): DetectionResult | null {
  if (CURSOR_SPINNER_FRAMES.some((frame) => chunk.includes(frame))) {
    return { status: "working", source: "agent", timer: "schedule-agent" };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Codex CLI  (OSC 0 title + OSC 9 desktop notifications)
// ---------------------------------------------------------------------------
// Codex's "working" is covered by detectClaudeCode above (shared braille
// range). This detector covers its *idle* transitions: it clears its title
// to empty on exit and emits "[ ! ]"/"[ . ]" when awaiting user approval. It
// also emits OSC 9 desktop notifications when TERM_PROGRAM=iTerm, matched on
// known payload prefixes only to avoid stomping an active Copilot status on
// unrelated OSC 9 from other programs.
//
// After a turn finishes at the prompt (not blocked on approval), Codex drops
// the braille spinner and sets a plain project/dir title. That OSC 0 does not
// match the patterns below — see detectCodexIdleAfterWorking.
const CODEX_ACTION_REQUIRED = ["[ ! ]", "[ . ]"];
const CODEX_IDLE_NOTIFICATIONS = [
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
      return { status: "idle", source: "agent", timer: "clear" };
    }
    return null;
  }
  if (
    code === 9 &&
    CODEX_IDLE_NOTIFICATIONS.some((p) => payload.startsWith(p))
  ) {
    return { status: "idle", source: "agent", timer: "clear" };
  }
  return null;
}

/**
 * Codex idle fallback: while an agent-sourced working phase is active (almost
 * always from the shared Claude/Codex braille spinner), a non-empty OSC 0
 * title that is not Claude's ✳ and not another braille frame means Codex
 * cleared the spinner to its plain project title — treat as idle.
 *
 * Gated on `wasAgentWorking` so ordinary programs that set a window title are
 * not promoted to agents. Not used as a silence timer: backgrounded tabs
 * pause OSC streaming, and a timer-based demotion would false-trigger for
 * Claude. This is contextual (needs to know the terminal's *current* state,
 * not just this one OSC pair), so it's dispatched separately from the
 * ordered detector list — see `agent-catalog.ts`'s `detectIdleAfterWorking`
 * and `agents-service.ts`'s OSC callback.
 */
export function detectCodexIdleAfterWorking(
  code: number,
  payload: string,
  wasAgentWorking: boolean,
): DetectionResult | null {
  if (code !== 0 || !wasAgentWorking || payload === "") return null;
  const first = payload.charCodeAt(0);
  if (first >= BRAILLE_START && first <= BRAILLE_END) return null;
  if (payload.startsWith(CLAUDE_IDLE_CHAR)) return null;
  if (CODEX_ACTION_REQUIRED.some((p) => payload.startsWith(p))) return null;
  return { status: "idle", source: "agent", timer: "clear" };
}

// ---------------------------------------------------------------------------
// GitHub Copilot CLI  (OSC 9;4 ConEmu/Windows Terminal progress protocol)
// ---------------------------------------------------------------------------
// Payload format: "4;<state>" or "4;<state>;<progress%>"
// Copilot emits state=3 while actively running and state=0 on completion.
// States 1/2/3 → working; states 0/4 → idle.
const COPILOT_PROGRESS_PREFIX = "4;";

export function detectCopilotCLI(
  code: number,
  payload: string,
): DetectionResult | null {
  if (code !== 9 || !payload.startsWith(COPILOT_PROGRESS_PREFIX)) return null;
  const state = parseInt(payload.slice(COPILOT_PROGRESS_PREFIX.length), 10);
  if (state === 1 || state === 2 || state === 3) {
    return { status: "working", source: "agent" };
  }
  if (state === 0 || state === 4) {
    return { status: "idle", source: "agent" };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Shell integration  (OSC 133 FTCS protocol — zsh/bash/fish, used by pi etc.)
// ---------------------------------------------------------------------------
// A=prompt start, B=command entered, C=command output start, D[;exit]=command done.
// A and D may carry extra params (e.g. "A;k=s" kitty keyboard protocol), so
// we use startsWith. Agents that emit 133;C per step but never emit A/D (e.g.
// pi) rely on the shell-idle debounce timer to clear the status after silence.
const SHELL_COMMAND_RUNNING = "C";
const SHELL_PROMPT_START = "A";

export function detectShellIntegration(
  code: number,
  payload: string,
): DetectionResult | null {
  if (code !== 133) return null;
  if (payload === SHELL_COMMAND_RUNNING) {
    return { status: "working", source: "shell", timer: "schedule" };
  }
  if (payload.startsWith(SHELL_PROMPT_START) || payload.startsWith("D")) {
    return { status: "idle", source: "shell", timer: "clear" };
  }
  return null;
}
