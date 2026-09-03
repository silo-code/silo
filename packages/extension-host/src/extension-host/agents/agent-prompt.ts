// Opening-prompt delivery for an Agent Profile launch (RFC 0033 phase 3). The
// whole of the phase's risk lives in this module, and none of it anywhere else:
// sanitizing, dialect selection, delimiter choice, and the one place shell
// syntax is written. Pure — no store, no I/O, no `\r`.
//
// Why this is delicate. A profile launch is *typed* into the user's own
// interactive shell (phase 1 chose that over `exec` so a launch is something
// you can see, edit, and re-run). Typed bytes reach the shell's **line editor**
// as keystrokes, not an argv value, so:
//
//   - ESC and C1 sequences fire keybindings rather than appearing as text;
//   - a lone CR submits the line early, splitting the payload mid-quote;
//   - a tab triggers completion.
//
// And whatever survives sanitizing still has to be quoted so the shell cannot
// interpret it. That is `composePromptLaunchLine`'s job, and it is the only
// function in the codebase that writes shell syntax for a prompt. The drain
// calls it; the profile editor calls `resolveProfileAgentId` and
// `promptDeliveryForAgent` to say the same thing statically. Nothing composes
// a line inline.
//
// The transport is a **quoted heredoc inside a command substitution**:
//
//     claude "$(cat <<'SILO_PROMPT'
//     fix the CI
//     SILO_PROMPT
//     )"
//
// A quoted delimiter (`<<'SILO_PROMPT'`) disables parameter expansion, command
// substitution, and backslash escapes inside the body, so `$HOME`, `` `date` ``,
// `$(uname)` and friends are literal text by construction rather than by
// escaping — which is what makes a multi-line or very long payload
// unremarkable instead of a special case. `fish` has no heredocs, so it gets
// its own exact single-quoted form (R4); any other shell is refused outright
// rather than approximated.

import {
  agentById,
  promptDeliveryForAgent,
  type AgentPromptDelivery,
} from "./agent-catalog";
import { fallbackAgentForCommand } from "./agent-profile-model";
import type { AgentProfile } from "../../state/types";

/**
 * Why a prompt could not be delivered. Public API as of phase 3 — these
 * members are returned to extension authors through
 * `ctx.agents.profiles.launch()`, so they are named for that reader rather
 * than for this module's internals.
 */
export type PromptRefusal =
  /** The profile resolves to no catalog agent, so Silo cannot know how (or
   *  whether) its CLI takes an opening prompt. */
  | "no-agent"
  /** The resolved agent has no reconned way to take an opening prompt while
   *  staying interactive. */
  | "agent-takes-none"
  /** Silo has no exact quoting rule for the shell this terminal will run, and
   *  will not approximate one. */
  | "unsupported-shell"
  /** The sanitized prompt is larger than {@link MAX_PROMPT_BYTES}. */
  | "too-large";

/**
 * The quoting rules Silo knows exactly. `"unsupported"` is not a gap to fill
 * in later by guessing — it is the answer for every shell whose exact rule
 * isn't implemented, and it refuses rather than approximating.
 */
export type ShellDialect = "posix" | "fish" | "unsupported";

/**
 * The largest sanitized prompt Silo will deliver, in UTF-8 **bytes** (not
 * characters). An opening instruction, not a file transfer: 16 KiB is far more
 * than any real instruction, far under `ARG_MAX`, and small enough to stay
 * tractable for a line editor and for the shell-history entry the composed
 * line becomes (R5a). A bounded limit that fails loudly beats an unbounded
 * paste that wedges the user's shell.
 */
export const MAX_PROMPT_BYTES = 16 * 1024;

/** The heredoc delimiter, before any collision suffix. */
const BASE_DELIMITER = "SILO_PROMPT";

// A CSI sequence: ESC [ , parameter bytes, intermediate bytes, one final byte.
// Matched whole so a partial strip can never leave its parameters behind as
// literal text (`[38;2;118m` in the middle of someone's prompt).
const CSI_RE = /\x1b\[[0-9;:<=>?]*[ -/]*[@-~]/g;
// An OSC sequence: ESC ] , payload, terminated by BEL or ST (ESC \). Both
// terminators are real — xterm accepts either and agents emit both.
const OSC_RE = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?/g;
// Anything else introduced by ESC, after CSI and OSC have been taken out: a
// charset designator (`ESC ( B`), any other two-byte escape (`ESC 7`, `ESC =`),
// and a bare trailing ESC. At most the one introducer byte is consumed with
// it — eating more would swallow ordinary text following the escape.
const ESC_RE = /\x1b(?:[()*+#][0-9A-Za-z]|[ -~])?/g;
// C0 controls except LF, plus DEL, plus the C1 range (which a terminal reads
// as single-byte equivalents of ESC-introduced sequences).
const CONTROL_RE = /[\x00-\x08\x0b-\x1f\x7f-\x9f]/g;

/**
 * Strip everything a shell's line editor would *act on* rather than insert,
 * leaving plain multi-line text.
 *
 * Total (every string in, a string out; nothing throws), idempotent (a second
 * pass equals the first), and deliberately conservative about ordinary text —
 * a prompt with no control bytes comes back byte-identical, with no cosmetic
 * rewriting.
 *
 * Order matters: escape *sequences* are removed whole before the leftover
 * control bytes are removed individually, because removing the ESC first
 * would leave `[31m` as literal text in the user's prompt.
 */
export function sanitizePromptForLineEditor(text: string): string {
  return (
    text
      // CRLF and lone CR → LF. A bare CR typed into a line editor submits the
      // line, which would split the payload mid-heredoc.
      .replace(/\r\n?/g, "\n")
      .replace(OSC_RE, "")
      .replace(CSI_RE, "")
      .replace(ESC_RE, "")
      .replace(CONTROL_RE, "")
      // Tab triggers completion rather than inserting; a prompt's indentation is
      // presentational, so spaces preserve the intent without the side effect.
      .replace(/\t/g, "  ")
  );
}

/**
 * The dialect of a shell named by path or basename. `undefined` (nothing
 * configured, nothing resolved) is `"unsupported"` rather than an assumed
 * POSIX — guessing here is exactly the failure mode this phase avoids.
 */
export function shellDialect(shell: string | undefined): ShellDialect {
  if (!shell) return "unsupported";
  const trimmed = shell.trim();
  if (!trimmed) return "unsupported";
  const idx = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  const base = (idx >= 0 ? trimmed.slice(idx + 1) : trimmed).replace(
    /\.(exe|cmd|bat|com)$/i,
    "",
  );
  if (["bash", "zsh", "sh", "dash", "ksh", "mksh", "ash"].includes(base))
    return "posix";
  if (base === "fish") return "fish";
  return "unsupported";
}

/**
 * The catalog agent a profile resolves to: its explicit `assumedAgentId` when
 * set, else the auto-detect match from the command text.
 *
 * The **single** resolution both the launch path and the profile editor's
 * "can this take a prompt?" affordance (R10) go through, so a refusal and the
 * warning that predicts it can never disagree.
 *
 * An `assumedAgentId` naming no catalog entry — a profile written against an
 * agent Silo has since dropped, or hand-edited persisted state — resolves to
 * **nothing**, falling through to the command match rather than being taken at
 * its word. Otherwise a launch would report "that agent takes no prompt" about
 * an agent that does not exist, which names the wrong problem.
 */
export function resolveProfileAgentId(
  profile: Pick<AgentProfile, "assumedAgentId" | "command">,
): string | undefined {
  const assumed =
    profile.assumedAgentId && agentById(profile.assumedAgentId)
      ? profile.assumedAgentId
      : undefined;
  return assumed ?? fallbackAgentForCommand(profile.command);
}

/**
 * Whether a profile can be given an opening prompt at all — a static fact
 * about the catalog agent it resolves to, with no launch involved. Read by
 * the profile editor and by `ctx.agents.profiles.list()`.
 */
export function profileAcceptsPrompt(
  profile: Pick<AgentProfile, "assumedAgentId" | "command">,
): boolean {
  return promptDeliveryForAgent(resolveProfileAgentId(profile)) !== undefined;
}

/**
 * A delimiter no **line** of `payload` equals — the only collision that can
 * terminate a heredoc early. A payload merely *containing* `SILO_PROMPT`
 * mid-line is harmless and gets no suffix.
 */
export function heredocDelimiter(payload: string): string {
  const lines = new Set(payload.split("\n"));
  if (!lines.has(BASE_DELIMITER)) return BASE_DELIMITER;
  for (let n = 2; ; n++) {
    const candidate = `${BASE_DELIMITER}_${n}`;
    if (!lines.has(candidate)) return candidate;
  }
}

/**
 * fish has no heredocs, but its single-quoted strings are exact and span
 * newlines: only `\` and `'` carry meaning inside them.
 */
function fishSingleQuote(payload: string): string {
  return `'${payload.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

export interface ComposePromptInput {
  /** Phase 1's `profileLaunchLine(profile)`, verbatim — the `configDir` env
   *  prefix and the profile's `command`, untouched. */
  launchLine: string;
  /** Raw prompt text. This function sanitizes it; callers must not. */
  prompt: string;
  /** The catalog agent the profile resolved to, from
   *  {@link resolveProfileAgentId}, or `undefined` when none matched. Carried
   *  separately from `delivery` only so "this profile names no agent" and
   *  "this agent takes no prompt" stay distinguishable — the two refusals
   *  need different wording. */
  agentId: string | undefined;
  /** The resolved agent's delivery shape, or `undefined` for "cannot". */
  delivery: AgentPromptDelivery | undefined;
  /** The dialect of the shell this line will be typed into. */
  dialect: ShellDialect;
}

export type ComposePromptResult = { line: string } | { refusal: PromptRefusal };

/**
 * The whole decision, in one pure function: the exact line to type, or why
 * not. Called at **precheck** (before anything is created, so a refusal costs
 * nothing) and again at **drain** against the profile as it is then — the one
 * input that can legitimately have changed in between.
 *
 * Returns `\n`-separated text. Converting to `\r` for the PTY is the caller's
 * single send seam — doing it here as well is how a heredoc silently never
 * terminates.
 */
export function composePromptLaunchLine(
  input: ComposePromptInput,
): ComposePromptResult {
  const { launchLine, prompt, delivery, dialect, agentId } = input;

  if (!agentId) return { refusal: "no-agent" };
  if (!delivery) return { refusal: "agent-takes-none" };
  if (dialect === "unsupported") return { refusal: "unsupported-shell" };

  const payload = sanitizePromptForLineEditor(prompt);
  if (new TextEncoder().encode(payload).length > MAX_PROMPT_BYTES)
    return { refusal: "too-large" };

  // The two delivery kinds differ by exactly one token, which is why they are
  // a union rather than two code paths.
  const head =
    delivery.kind === "flag" ? `${launchLine} ${delivery.flag}` : launchLine;

  if (dialect === "fish") {
    return { line: `${head} ${fishSingleQuote(payload)}` };
  }

  const delimiter = heredocDelimiter(payload);
  return {
    line: `${head} "$(cat <<'${delimiter}'\n${payload}\n${delimiter}\n)"`,
  };
}
