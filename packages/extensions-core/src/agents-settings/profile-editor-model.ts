/**
 * The profile editor's pure half (RFC 0033 R14 / RFC 0038): a saved
 * {@link AgentProfile} → the editor's fields, and the fields → the `launch`
 * union it saves back.
 *
 * Split out of `ProfileEditorModal.tsx` because *which arm gets written* is
 * the one piece of that component worth pinning down: the two arms mean
 * different things by `command` (a shell string vs. an executable path), the
 * Chat arm's argv survives a round trip through a text field, and getting it
 * wrong writes a profile that fails only later, at spawn.
 */

import {
  chatAgentForLaunch,
  configDirEnvVarForAgent,
  formatArgs,
  parseArgs,
  type AgentProfile,
} from "@silo-code/extension-host/internal";

/**
 * The Chat arm's Agent picker selection when the user chose to write the launch
 * line themselves — a locally-built ACP binary, or an adapter fork. Not a
 * second-class escape hatch: it is the same authoring path a third party
 * driving `ctx.agents.sessions` needs.
 */
export const CHAT_CHOICE_CUSTOM = "custom";

export interface ProfileEditorState {
  label: string;
  id: string;
  idEdited: boolean;
  /** Which launch arm is being authored. */
  interfaceKind: "terminal" | "chat";
  /**
   * The Terminal arm's `command` — a **shell string**: an alias, a shell
   * function, a version-manager shim.
   *
   * Held separately from {@link chatCommand} because the two are not the same
   * kind of value. Carrying one field across an Interface switch put a shell
   * alias into an argv[0] and produced `failed to spawn claude-work: No such
   * file or directory` — the switch looked harmless and the failure surfaced
   * much later, at spawn. Two fields also mean toggling back and forth is
   * non-destructive.
   */
  terminalCommand: string;
  /** The Chat arm's `command` — an **executable** resolved on `PATH`. */
  chatCommand: string;
  /** Chat arm only — the argv vector, as the text field holds it. */
  args: string;
  /** `""` = auto-detect; otherwise an explicit catalog agent id. */
  agentOverride: string;
  configDir: string;
  /**
   * The Chat arm's **Agent picker** selection: a catalog agent id,
   * {@link CHAT_CHOICE_CUSTOM}, or `""` for a new Chat profile where nothing
   * has been picked yet (there is no launch to save in that state).
   *
   * Replaces the old `chatLaunchEdited` flag, which existed only because the
   * user typed the launch line and the catalog's suggestion had to stop
   * overwriting it. Nobody types it now, so the question is no longer "has this
   * been hand-edited" but "which entry in the picker is this" — and the answer
   * is derived from the saved launch rather than remembered as a flag.
   */
  chatChoice: string;
  /**
   * A saved Chat launch's `env`, **minus** the config-directory key that
   * {@link ProfileEditorState.configDir} owns — carried through untouched so
   * saving cannot drop a key this editor has no field for.
   */
  chatEnv: Record<string, string>;
}

/**
 * Seed the editor from a profile being edited or duplicated, or from nothing
 * for a new one.
 *
 * Each arm contributes only its own fields; the **addressing** half (label,
 * id, assumed agent) is shared, which is what lets a profile switch arms
 * without being retyped — the durable idea RFC 0033 got right and RFC 0038
 * kept.
 *
 * A saved Chat profile is classified, not rewritten: `chatChoice` comes from
 * matching its launch against the catalog, and its `command` / `args` are
 * carried through verbatim either way. So an editor round-trip with no edits
 * saves the same bytes back even for a profile Silo would compose differently
 * today — a pinned adapter version it no longer ships, or a launch that cannot
 * work at all.
 */
export function editorStateFromProfile(
  seed?: Partial<AgentProfile>,
): ProfileEditorState {
  const launch = seed?.launch;
  const terminal = launch?.interface === "terminal" ? launch : undefined;
  const chat = launch?.interface === "chat" ? launch : undefined;
  const chatChoice = chat
    ? (chatAgentForLaunch(chat.command, chat.args) ?? CHAT_CHOICE_CUSTOM)
    : "";
  // A recognised Chat launch identifies its own agent, so it can stand in for a
  // missing `assumedAgentId` — needed because that is what selects the
  // config-dir env var, and without it a hand-written profile's saved
  // `CLAUDE_CONFIG_DIR` would have no field to appear in.
  const chatAgentId =
    seed?.assumedAgentId ||
    (chatChoice && chatChoice !== CHAT_CHOICE_CUSTOM ? chatChoice : "");
  // Read the config dir out of `env` so it lands in the Config directory field
  // rather than staying invisible — the gap that made a second-account Chat
  // profile unauthorable in the first place.
  const chatEnvVar = configDirEnvVarForAgent(chatAgentId);
  const chatEnv = { ...(chat?.env ?? {}) };
  const chatConfigDir = chatEnvVar ? (chatEnv[chatEnvVar] ?? "") : "";
  if (chatEnvVar) delete chatEnv[chatEnvVar];
  return {
    label: seed?.label ?? "",
    id: seed?.id ?? "",
    idEdited: seed != null && seed.id != null,
    interfaceKind: chat ? "chat" : "terminal",
    terminalCommand: terminal?.command ?? "",
    chatCommand: chat?.command ?? "",
    args: chat ? formatArgs(chat.args) : "",
    agentOverride: chat ? chatAgentId : (seed?.assumedAgentId ?? ""),
    configDir: chat ? chatConfigDir : (terminal?.configDir ?? ""),
    chatChoice,
    chatEnv,
  };
}

/** The command field in play for the arm being authored. */
export function activeCommand(
  s: Pick<
    ProfileEditorState,
    "interfaceKind" | "terminalCommand" | "chatCommand"
  >,
): string {
  return s.interfaceKind === "chat" ? s.chatCommand : s.terminalCommand;
}

/**
 * Build the `launch` union to save.
 *
 * `configDir` is passed in already resolved (tilde expanded, and cleared when
 * the agent has no config-dir env var) because that resolution is async and
 * belongs to the save flow — this stays pure. `envVar` is the resolved agent's
 * {@link configDirEnvVarForAgent}, needed only by the Chat arm.
 *
 * The **same field, two destinations**: a second account is one idea, but the
 * arms deliver it differently. Terminal prefixes `VAR='path'` onto a shell
 * line, so it stores the path as `configDir`. Chat is `exec`'d with no shell,
 * so there is nowhere to put a prefix — the path becomes an entry in the
 * child's `env` under that agent's variable. Session 3.1 dropped the field from
 * Chat over exactly this difference and then never surfaced `env` at all,
 * which left a second-account Chat profile unauthorable.
 */
export function launchFromEditorState(
  s: Pick<
    ProfileEditorState,
    "interfaceKind" | "terminalCommand" | "chatCommand" | "args" | "chatEnv"
  >,
  configDir: string,
  envVar?: string,
): AgentProfile["launch"] {
  const command = activeCommand(s).trim();
  if (s.interfaceKind === "chat") {
    const env = { ...s.chatEnv };
    if (envVar && configDir) env[envVar] = configDir;
    return {
      interface: "chat",
      command,
      args: parseArgs(s.args),
      ...(Object.keys(env).length > 0 ? { env } : {}),
    };
  }
  return {
    interface: "terminal",
    command,
    ...(configDir ? { configDir } : {}),
  };
}
