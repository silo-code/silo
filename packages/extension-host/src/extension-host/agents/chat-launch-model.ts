/**
 * Authoring the **`chat` launch arm** of an Agent Profile (RFC 0038).
 *
 * The Terminal arm's `command` is a *shell string* — Silo types it into an
 * interactive login shell, so aliases and version-manager shims resolve. The
 * Chat arm is not: Silo `exec`s a pipe-connected child with a path plus an
 * **argv vector**, and no shell ever sees it. That difference is the whole
 * reason this module exists — a profile editor needs a text field, an argv
 * array needs to survive the round trip through one, and nothing in between
 * may quietly become shell syntax.
 *
 * Pure and catalog-reading only; no state, no I/O.
 */

import { agentById } from "./agent-catalog";

/**
 * Split an argv text field into an argv vector.
 *
 * Whitespace separates tokens; `'…'` and `"…"` group one; a backslash escapes
 * the next character. **This is not shell parsing and must not grow into it**
 * — there is no expansion, no globbing, no operators, and `$HOME` is four
 * literal characters. Quotes exist only so an argument may contain a space,
 * which is the one thing a space-separated field cannot express on its own.
 */
export function parseArgs(text: string): string[] {
  const args: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let started = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === "\\" && i + 1 < text.length) {
      current += text[++i];
      started = true;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      // An empty quoted token ("") is still a token.
      started = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (started) args.push(current);
      current = "";
      started = false;
      continue;
    }
    current += ch;
    started = true;
  }
  if (started) args.push(current);
  return args;
}

/**
 * Render an argv vector back into a text field, quoting only the arguments
 * that need it. Round-trips with {@link parseArgs}, so opening a saved profile
 * and saving it again cannot rewrite its argv.
 */
export function formatArgs(args: readonly string[]): string {
  return args
    .map((arg) => {
      if (arg === "") return '""';
      if (!/[\s"'\\]/.test(arg)) return arg;
      return `"${arg.replace(/(["\\])/g, "\\$1")}"`;
    })
    .join(" ");
}

/** What Silo will actually exec, for the editor's preview line. Display only
 *  — never parsed back, and never handed to a shell. */
export function chatExecPreview(
  command: string,
  args: readonly string[],
): string {
  const cmd = command.trim();
  if (!cmd) return "";
  return [cmd, ...args].map((t) => (/\s/.test(t) ? `"${t}"` : t)).join(" ");
}

/**
 * Whether a command + argv already match a {@link ChatLaunchSuggestion} — used
 * to decide whether to *offer* the catalog's verified invocation. Compared
 * after trimming, so trailing whitespace in a text field is not a difference.
 */
export function matchesChatSuggestion(
  command: string,
  args: readonly string[],
  suggestion: ChatLaunchSuggestion | undefined,
): boolean {
  if (suggestion?.kind !== "builtin") return false;
  return (
    command.trim() === suggestion.command &&
    args.length === suggestion.args.length &&
    args.every((a, i) => a === suggestion.args[i])
  );
}

/** A suggested Chat launch for a catalog agent, or why there isn't one. */
export type ChatLaunchSuggestion =
  /** The agent speaks the protocol itself — these values work as they are. */
  | { kind: "builtin"; command: string; args: string[] }
  /**
   * The agent needs a separate adapter process. Silo deliberately does **not**
   * prefill a command here: the adapter's npm coordinates are not something
   * the catalog can state accurately today (it records the adapter's short
   * name, not a resolvable package spec), and fetch-on-first-use is a later
   * phase. Naming the adapter and letting the user write the line beats
   * guessing one that fails at spawn.
   */
  | { kind: "adapter"; adapter: string }
  /** The agent has no ACP path at all (`grok`), so it cannot be a Chat agent. */
  | { kind: "none" };

/**
 * What the profile editor should offer for the Chat arm, given the catalog
 * agent the profile resolves to.
 *
 * `undefined` when no agent is resolved yet — a different state from
 * `"none"`: the user simply has not said which agent this is, so nothing is
 * known either way.
 */
export function suggestChatLaunch(
  agentId: string | undefined,
): ChatLaunchSuggestion | undefined {
  if (!agentId) return undefined;
  const agent = agentById(agentId);
  if (!agent) return undefined;
  const acp = agent.acpLaunch;
  if (!acp) return { kind: "none" };
  if (acp.kind === "adapter") return { kind: "adapter", adapter: acp.package };
  return {
    kind: "builtin",
    // The binary basename the catalog identifies this agent by. Resolved on
    // `PATH` at spawn — there is no shell, so an alias would not work here.
    command: agent.leaderNames[0] ?? agentId,
    args: [...acp.args],
  };
}
