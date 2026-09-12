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
 * Since Session 3.6 the module does two jobs rather than one. It still parses
 * and formats an argv text field, for the **Custom…** launch a user really does
 * write themselves. But the ordinary path no longer asks: picking a catalog
 * agent *is* the launch, {@link chatLaunchForAgent} composes it, and
 * {@link chatAgentForLaunch} reads a saved one back to decide which entry in
 * that picker a profile already is.
 *
 * Pure and catalog-reading only; no state, no I/O.
 */

import { AGENT_CATALOG, agentById } from "./agent-catalog";

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
 * A composed Chat launch — exactly what the `chat` arm of an
 * `AgentProfileLaunch` carries, minus the env.
 */
export interface ChatLaunch {
  /** Executable resolved on `PATH` at spawn — no shell, so no alias. */
  command: string;
  /** Argument vector, already split; never a shell string. */
  args: string[];
}

/**
 * The Chat launch Silo composes for a catalog agent, or `undefined` when that
 * agent has no verified ACP path (`grok`, `omp`) or is not in the catalog.
 *
 * This is the **source** of a Chat profile's launch line, not a hint about
 * one. The Terminal arm's `command` must be free text because only the user
 * knows their own shell — `claude-personal` is an alias nothing else can
 * resolve. The Chat arm is the exact opposite in both respects: it is `exec`'d
 * with no shell, so only a resolvable file works, and the value that works came
 * out of recon, so **Silo** is the one that knows it. Nobody guesses
 * `npx -y @agentclientprotocol/claude-agent-acp@0.75.1`.
 *
 * `undefined` therefore means "cannot be a Chat agent", and the editor's
 * response is to leave that agent out of the picker entirely rather than offer
 * it with a warning attached — an agent absent from the list beats one that
 * fails at spawn.
 */
export function chatLaunchForAgent(
  agentId: string | undefined,
): ChatLaunch | undefined {
  if (!agentId) return undefined;
  const agent = agentById(agentId);
  const acp = agent?.acpLaunch;
  if (!agent || !acp) return undefined;
  if (acp.kind === "adapter") {
    // `-y` so a first run installs without prompting on a pipe nobody is
    // watching, and the version is pinned by the catalog — never `@latest`,
    // since an adapter's advertised behaviour moves between releases.
    return { command: "npx", args: ["-y", `${acp.package}@${acp.version}`] };
  }
  return {
    // The binary basename the catalog identifies this agent by.
    command: agent.leaderNames[0] ?? agentId,
    args: [...acp.args],
  };
}

/**
 * Which catalog agent a **saved** Chat launch was composed for, or `undefined`
 * when it matches none — in which case the editor presents it as **Custom…**.
 *
 * This is the migration rule, and the `undefined` case is the load-bearing
 * half: a profile Silo cannot recognise is shown as the custom launch it is
 * and saved back byte-for-byte. It is never re-authored into the catalog's
 * current answer, because a profile is the user's and a model changing is not
 * their edit. Dave's `claude-personal` profile is the live example — a shell
 * alias that can never work under `exec`, which this editor must present
 * honestly rather than quietly replace.
 *
 * An adapter is matched on **package, ignoring the version**, so bumping a
 * pinned version in the catalog does not silently reclassify every existing
 * profile as Custom. The saved argv still wins on save: recognising a profile
 * as Claude's does not rewrite its pin.
 */
export function chatAgentForLaunch(
  command: string,
  args: readonly string[],
): string | undefined {
  const cmd = command.trim();
  if (!cmd) return undefined;
  for (const agent of AGENT_CATALOG) {
    const acp = agent.acpLaunch;
    if (!acp) continue;
    if (acp.kind === "adapter") {
      // `npx -y <package>@<version>` — any version of the same package.
      if (cmd !== "npx") continue;
      const spec = args.find((a) => !a.startsWith("-"));
      if (spec && stripVersion(spec) === acp.package) return agent.id;
      continue;
    }
    const launch = chatLaunchForAgent(agent.id);
    if (!launch) continue;
    if (
      cmd === launch.command &&
      args.length === launch.args.length &&
      args.every((a, i) => a === launch.args[i])
    ) {
      return agent.id;
    }
  }
  return undefined;
}

/** Drop a trailing `@version` from an npm spec, keeping a leading `@scope`. */
function stripVersion(spec: string): string {
  const at = spec.lastIndexOf("@");
  return at > 0 ? spec.slice(0, at) : spec;
}
