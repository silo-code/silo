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
  formatArgs,
  parseArgs,
  type AgentProfile,
} from "@silo-code/extension-host/internal";

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
  /** Set once the user edits command/args by hand, so a later change of agent
   *  stops overwriting their line with the catalog's suggestion. */
  chatLaunchEdited: boolean;
}

/**
 * Seed the editor from a profile being edited or duplicated, or from nothing
 * for a new one.
 *
 * Each arm contributes only its own fields; the **addressing** half (label,
 * id, assumed agent) is shared, which is what lets a profile switch arms
 * without being retyped — the durable idea RFC 0033 got right and RFC 0038
 * kept.
 */
export function editorStateFromProfile(
  seed?: Partial<AgentProfile>,
): ProfileEditorState {
  const launch = seed?.launch;
  const terminal = launch?.interface === "terminal" ? launch : undefined;
  const chat = launch?.interface === "chat" ? launch : undefined;
  return {
    label: seed?.label ?? "",
    id: seed?.id ?? "",
    idEdited: seed != null && seed.id != null,
    interfaceKind: chat ? "chat" : "terminal",
    terminalCommand: terminal?.command ?? "",
    chatCommand: chat?.command ?? "",
    args: chat ? formatArgs(chat.args) : "",
    agentOverride: seed?.assumedAgentId ?? "",
    configDir: terminal?.configDir ?? "",
    // An existing Chat profile's line is the user's own, whatever its origin,
    // so the catalog must not re-suggest over it.
    chatLaunchEdited: chat != null,
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
 * belongs to the save flow — this stays pure. It is ignored entirely on the
 * Chat arm, which has no config directory.
 */
export function launchFromEditorState(
  s: Pick<
    ProfileEditorState,
    "interfaceKind" | "terminalCommand" | "chatCommand" | "args"
  >,
  configDir: string,
): AgentProfile["launch"] {
  const command = activeCommand(s).trim();
  if (s.interfaceKind === "chat") {
    return { interface: "chat", command, args: parseArgs(s.args) };
  }
  return {
    interface: "terminal",
    command,
    ...(configDir ? { configDir } : {}),
  };
}
