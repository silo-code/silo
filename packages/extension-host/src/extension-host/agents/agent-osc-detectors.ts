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
  /** When true, dispatch immediately even for agent-sourced idle — used for
   * identity-only signals (pi's OSC 0 title) that must promote `isAgent`
   * without waiting out the agent-idle debounce. */
  identity?: boolean;
  /** Catalog id when this detector uniquely identifies an agent (e.g. pi's
   * title). Stamped onto the terminal so shell-integration OSC the agent
   * itself emits cannot demote it back to a plain shell. */
  agentId?: string;
}

const BRAILLE_START = 0x2800;
const BRAILLE_END = 0x28ff;
/**
 * Claude Code's *current* title spinner: the half/quarter-filled circles
 * U+25D0–U+25D3 (`◐ ◑ ◒ ◓`). Confirmed against claude-code 2.1.228, whose
 * title component animates `["◐", "◑"]` and falls back to the idle marker when
 * not animating — i.e. the OSC 0 title is `"<glyph> <conversation title>"`.
 * Claude *used* to use the braille range here; the braille branch stays because
 * Codex CLI and Grok still emit braille frames (and older Claude builds do
 * too). The whole U+25D0–U+25D3 block is accepted, not just the two frames
 * currently in rotation, so another frame added to that set still reads as
 * working.
 */
const CIRCLE_SPINNER_START = 0x25d0;
const CIRCLE_SPINNER_END = 0x25d3;
const CLAUDE_IDLE_CHAR = "✳";

/**
 * Does this OSC 0 title lead with a known agent spinner frame — i.e. is the
 * agent mid-turn? Shared by `detectClaudeCode` (spinner → working) and
 * `detectCodexIdleAfterWorking` (spinner → *not* the "spinner cleared to a
 * plain title" idle signal), so the two can never disagree about which glyphs
 * mean "still working". An empty payload yields `NaN` and is correctly false.
 */
function startsWithSpinnerGlyph(payload: string): boolean {
  const first = payload.charCodeAt(0);
  return (
    (first >= BRAILLE_START && first <= BRAILLE_END) ||
    (first >= CIRCLE_SPINNER_START && first <= CIRCLE_SPINNER_END)
  );
}

/**
 * Claude Code's title spinner (working) + `✳` idle marker (idle).
 * Note: Codex CLI and Grok use the *same* braille spinner range for "working",
 * so the spinner → working branch covers all three — that's why this function is
 * also attached to their `activityDetectors` in the catalog, not just
 * Claude's. Codex has no `✳` of its own though; its idle transitions are
 * handled separately by `detectCodexCLI`/`detectCodexIdleAfterWorking`.
 */
export function detectClaudeCode(
  code: number,
  payload: string,
): DetectionResult | null {
  if (code !== 0) return null;
  if (startsWithSpinnerGlyph(payload)) {
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
 * title that is not Claude's ✳ and not another spinner frame (see
 * `startsWithSpinnerGlyph`) means Codex cleared the spinner to its plain
 * project title — treat as idle.
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
  if (startsWithSpinnerGlyph(payload)) return null;
  if (payload.startsWith(CLAUDE_IDLE_CHAR)) return null;
  if (CODEX_ACTION_REQUIRED.some((p) => payload.startsWith(p))) return null;
  return { status: "idle", source: "agent", timer: "clear" };
}

// ---------------------------------------------------------------------------
// Presentation: stripping status markers back out of a title
// ---------------------------------------------------------------------------

/** Leading marker an OSC 0 title may carry: a spinner frame (either range),
 * Claude's `✳`, or Codex's action-required marker — plus trailing whitespace.
 * Built from the same constants the detectors match on, so a glyph Silo can
 * *detect* is always a glyph Silo can *strip*.
 *
 * OMP is the one agent whose status marker does **not** lead: it prints its
 * `π` brand first and its state separator second (`π ⠋ label`, `π > label`).
 * Honouring the invariant above therefore means allowing an optional `π `
 * ahead of the marker set, plus a branch for OMP's three non-glyph separators
 * (`>` idle, `!` waiting on you, `:` working on Windows). Both OMP branches
 * are anchored behind the brand on purpose — a bare leading `>` is an
 * ordinary thing for an unrelated program to put in a title, and stripping it
 * generally would be wrong.
 *
 * pi is unaffected, and `agent-osc-detectors.test.ts` asserts it: `π - ` is
 * neither a marker glyph nor one of OMP's separators, so `π - notes - repo`
 * comes back untouched. */
const OMP_BRAND_PREFIX_RE_SRC = `\\u03c0[ ]`;
const LEADING_MARKER_RE = new RegExp(
  `^(?:` +
    `(?:${OMP_BRAND_PREFIX_RE_SRC})?` +
    `(?:[\\u2800-\\u28ff\\u25d0-\\u25d3]|${CLAUDE_IDLE_CHAR}|\\[ [!.] \\])` +
    `|${OMP_BRAND_PREFIX_RE_SRC}[>!:]` +
    `)\\s*`,
);

/** Cursor Agent encodes status as a trailing `" - <emoji?> <status>"` segment
 * (optionally followed by a `" (worktree)"` suffix) rather than a leading
 * glyph. Assembled from the detector's own status tables — the whole point of
 * deriving it here is that adding a status to those tables can't leave this
 * regex behind.
 *
 * The emoji is skipped as `[^A-Za-z]*` rather than an emoji character class,
 * matching what `cursorStatusMatches` already does. A class would be wrong:
 * Cursor's status emoji include astral-plane codepoints (`📤` = a surrogate
 * pair) and one with a variation selector (`⌨️` = U+2328 U+FE0F), and a
 * character class decomposes both into separate single-unit members — so it
 * would match half a glyph and then fail to reach the status text. */
const CURSOR_STATUS_SUFFIX_RE = new RegExp(
  ` - [^A-Za-z]*` +
    `(?:${[...CURSOR_WORKING_STATUSES, ...CURSOR_IDLE_STATUSES].join("|")})` +
    // The status must END here, not merely start here: the trailing `[^)]*`
    // absorbs Cursor's animated ellipsis ("Working ...", "Working ···"), and
    // without this lookahead it would just as happily absorb the rest of a real
    // word — stripping "notes - Workingham" down to "notes".
    `(?![A-Za-z])[^)]*(?: \\([^)]+\\))?$`,
);

/**
 * Strip agent status markers out of a terminal title, for display.
 *
 * Agents encode their status *into* the OSC 0 window title — that's what the
 * detectors above read. Once the host has turned that into real
 * `ctx.agents` state (rendered as a tab activity dot and a Workspaces status
 * row), the raw glyph is redundant and visually noisy next to those, so the
 * tab title and `TerminalRecord.title` show the cleaned text instead. Gated by
 * the `hideAgentStatusGlyphs` terminal setting (Settings → Agents).
 *
 * Detection is unaffected: it reads the raw OSC stream via
 * `subscribeOsc`, never a title. Stripping is purely presentational.
 *
 * Returns `""` when the title was *nothing but* a marker (Claude emits a bare
 * `✳` before its first conversation title exists) — callers should treat that
 * as "no title" and fall back rather than showing an empty tab.
 */
export function stripAgentStatusMarkers(title: string): string {
  return title
    .replace(CURSOR_STATUS_SUFFIX_RE, "")
    .replace(LEADING_MARKER_RE, "")
    .trim();
}

// ---------------------------------------------------------------------------
// GitHub Copilot CLI  (OSC 9;4 ConEmu/Windows Terminal progress protocol)
// ---------------------------------------------------------------------------
// Payload format: "4;<state>" or "4;<state>;<progress%>"
// Copilot emits state=3 while actively running and state=0 on completion.
// States 1/2/3 → working; states 0/4 → idle.
const COPILOT_PROGRESS_PREFIX = "4;";

// ---------------------------------------------------------------------------
// pi  (OSC 0 title — identity only, no status encoded)
// ---------------------------------------------------------------------------
// Pi's TUI sets the title to "π - <session> - <cwd>". That carries no
// working/idle state (unlike Claude's spinner prefix), but it is a reliable,
// pi-specific identity signal for plain-shell terminals where argv0 is `node`
// and leader-name matching alone would miss it. Exported so `agent-catalog.ts`
// can reuse the exact same literal as pi's `titleIdentityPrefix` — the prefix
// that's redundant once the tab already shows pi's icon.
export const PI_TITLE_PREFIX = "π - ";

export function detectPiTitle(
  code: number,
  payload: string,
): DetectionResult | null {
  if (code !== 0 || !payload.startsWith(PI_TITLE_PREFIX)) return null;
  return {
    status: "idle",
    source: "agent",
    identity: true,
    agentId: "pi",
  };
}

// ---------------------------------------------------------------------------
// OMP / Oh My Pi  (OSC 0 title — identity AND run state)
// ---------------------------------------------------------------------------
// OMP is a pi fork, and its title leads with the same `π` brand glyph — but
// there the resemblance stops. Confirmed live against omp 18.1.10 (a real PTY
// capture) and against its own `src/utils/title-generator.ts`, whose
// `buildTerminalTitleWithState` composes the title as `π <separator> <label>`:
//
//   π > label      the user's turn                     → idle
//   π ⠋ label      working (10 braille frames, 80 ms)  → working
//   π ! label      blocked on the user (ask/approval)  → idle
//   π: label       `tui.titleState` off                → idle, no state
//   π              no label and disabled               → idle, no state
//
// `label` is the generated session name, falling back to the cwd basename;
// when there is no label the separator trails the brand (`π >`), so the state
// is present even before a session is named. On Windows the working separator
// is a static `:` rather than an animated frame.
//
// This is the ONLY activity signal Silo reads for OMP, and deliberately so:
// `tui.titleState` defaults to **true**, whereas OMP's OSC 9;4 progress is
// gated behind `terminal.showProgress`, which defaults to false and lives in
// a YAML config Silo has no writer for. The title is both the better signal
// and the one that needs no setup.
//
// Two mappings worth stating outright:
//
//   - `!` is idle, not working. OMP is waiting on the *user*, which in Silo's
//     model is exactly when a turn has ended and attention should be raised.
//     Reporting "working" would leave the tab spinning while it is the user's
//     move.
//   - A spinner frame arms the agent-idle debounce rather than promising an
//     explicit idle, because OMP *animates* the frame instead of re-announcing
//     that it is still busy — so silence is what ends a turn, the same shape
//     Copilot's working title uses. The explicit `>` normally arrives first
//     and clears it; the debounce is the backstop for a turn that ends without
//     one.
//
// DISJOINT FROM pi BY CONSTRUCTION: `-` is not a separator
// `buildTerminalTitleWithState` can emit, so an OMP title never starts with
// pi's `π - `; and `-` is none of `>`/`!`/`:`/braille, so a pi title never
// matches here. `agent-osc-detectors.test.ts` asserts both directions, so an
// edit to either literal that reintroduces an overlap fails loudly rather
// than silently resurrecting the misidentification RFC 0037 was written for.
//
// Exported so `agent-catalog.ts` can reuse the exact literal as OMP's
// `titleIdentityPrefix` — the brand is redundant once the tab shows OMP's own
// icon, exactly as pi's and OpenCode's are.
export const OMP_TITLE_PREFIX = "π ";

/** The brand on its own — OMP's title with no label and no state separator. */
const OMP_BRAND = "π";
/**
 * `tui.titleState` off: OMP joins brand and label with `": "` and reports no
 * state at all (`π: my-project`). Note this is **not** the same string as the
 * Windows *working* separator below, which is a colon surrounded by spaces
 * (`π : my-project`) — OMP builds the two in different branches, and the
 * difference is exactly one space. Tested here so a refactor can't merge them.
 */
const OMP_STATELESS_PREFIX = "π:";
/** The user's turn. */
const OMP_IDLE_SEPARATOR = ">";
/** OMP is blocked on the user (an ask or an approval prompt). */
const OMP_ATTENTION_SEPARATOR = "!";
/**
 * Windows (and any ConPTY-hosted terminal) gets a static `:` where every other
 * platform animates a braille frame — OMP does not run a title spinner there.
 * Without this branch, an OMP turn on Windows would emit no working signal at
 * all, which is the platform that already has no foreground argv and no hook.
 */
const OMP_WINDOWS_WORKING_SEPARATOR = ":";

export function detectOmpTitle(
  code: number,
  payload: string,
): DetectionResult | null {
  if (code !== 0) return null;
  const title = payload.trim();
  // Checked before the `"π "` split below: `π:` has no space after the brand,
  // so it would otherwise fall through and match nothing.
  if (title === OMP_BRAND || title.startsWith(OMP_STATELESS_PREFIX)) {
    return { status: "idle", source: "agent", identity: true, agentId: "omp" };
  }
  if (!title.startsWith(OMP_TITLE_PREFIX)) return null;

  const rest = title.slice(OMP_TITLE_PREFIX.length);
  if (
    startsWithSpinnerGlyph(rest) ||
    rest.startsWith(OMP_WINDOWS_WORKING_SEPARATOR)
  ) {
    return {
      status: "working",
      source: "agent",
      timer: "schedule-agent",
      agentId: "omp",
    };
  }
  if (
    rest.startsWith(OMP_IDLE_SEPARATOR) ||
    rest.startsWith(OMP_ATTENTION_SEPARATOR)
  ) {
    return {
      status: "idle",
      source: "agent",
      identity: true,
      timer: "clear",
      agentId: "omp",
    };
  }
  // Anything else after the brand is not a separator OMP emits — notably pi's
  // `π - <session> - <cwd>`, which must fall through to `null` here.
  return null;
}

/**
 * Copilot CLI's OSC 0 title, which is both a state and an identity signal:
 *
 * ```
 * GitHub Copilot                                    idle, at its prompt
 * Implement Quick Task - GitHub Copilot             working on a task
 * do something simple for 20 seconds - GitHub Copilot
 * ```
 *
 * Captured live on Windows (2026-08-24). This matters more than it looks:
 * Copilot emitted **no OSC 9;4 progress at all** in that session, so
 * {@link detectCopilotCLI} — the progress detector — never fired and
 * Copilot's activity never changed. The title is its only per-turn signal.
 *
 * The suffix is specific enough to carry `agentId`, unlike the OSC 9;4
 * progress protocol, which is generic to Windows consoles and would label any
 * `winget` install as Copilot.
 *
 * A working title arms the agent-idle debounce rather than promising an
 * explicit idle: Copilot sets a title when a task *starts* and was not
 * observed resetting it on completion, so silence is what ends the turn —
 * the same shape as Cursor Agent's spinner fallback.
 */
const COPILOT_TITLE = "GitHub Copilot";
const COPILOT_TITLE_SUFFIX = ` - ${COPILOT_TITLE}`;

export function detectCopilotTitle(
  code: number,
  payload: string,
): DetectionResult | null {
  if (code !== 0) return null;
  const title = payload.trim();
  if (title === COPILOT_TITLE) {
    return {
      status: "idle",
      source: "agent",
      identity: true,
      agentId: "copilot",
    };
  }
  if (title.endsWith(COPILOT_TITLE_SUFFIX)) {
    return {
      status: "working",
      source: "agent",
      timer: "schedule-agent",
      agentId: "copilot",
    };
  }
  return null;
}

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
// OpenCode  (raw output only — no OSC signal exists, ADR 0043)
// ---------------------------------------------------------------------------
// Confirmed live across four separate real generations (ADR 0043): OpenCode
// never emits OSC 9 progress or OSC 133 shell integration, and its OSC 0
// title is static except a one-time async session-naming rename unrelated
// to working/idle. The only real signal is raw output: its @opentui-based
// TUI renders an animated 8-cell bar while busy, each cell an individual
// CSI cursor-position escape (`ESC[<row>;<col>H`) immediately followed by
// U+2B1D "⬝" (empty) or U+25A0 "■" (filled). Requiring the glyph to follow a
// cursor-position escape, and requiring at least two such cells per chunk,
// rules out an unrelated program's incidental single use of either
// character — the same "beware bare single-glyph spinners" trap
// `detectCursorAgentOutput` above avoids via its 2-char frame set. No
// explicit idle signal exists in raw output either, so (like Cursor) the
// agent-idle debounce timer clears "working" on silence.
const OPENCODE_BAR_CELL_RE = /\x1b\[\d+;\d+H(?:\x1b\[[0-9;]*m)*[⬝■]/g;

export function detectOpencodeOutput(chunk: string): DetectionResult | null {
  const cells = chunk.match(OPENCODE_BAR_CELL_RE);
  if (cells && cells.length >= 2) {
    return { status: "working", source: "agent", timer: "schedule-agent" };
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
