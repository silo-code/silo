/** Pure helpers for "Found on this machine" (RFC 0033 R12 / RFC 0038). */

/** Which interface an Agent Profile starts the agent through. */
export type AgentMode = "terminal" | "chat";

/** Profile id when one-click-adding a catalog agent in a given mode. Terminal
 *  keeps the bare slug (it is the common case and predates Chat); Chat takes a
 *  `-chat` suffix so both modes can coexist for one agent. */
export function profileIdForCatalogAgent(
  agentId: string,
  mode: AgentMode = "terminal",
): string {
  const slug = agentId.replace(/[^a-z0-9-]/g, "-");
  return mode === "chat" ? `${slug}-chat` : slug;
}

/** Inputs describing what already exists for one scanned agent. */
export interface FoundAgentCoverage {
  /** True when the catalog records an ACP path for this agent (it can be Chat). */
  supportsChat: boolean;
  /** True when a Chat panel extension is installed to host a Chat profile —
   *  `resolveChatProfileHost()` in the host. With none, Chat cannot be added. */
  chatHostInstalled: boolean;
  /** Modes this agent already has a profile for (matched by `assumedAgentId`). */
  coveredModes: ReadonlySet<AgentMode>;
  /** Every existing profile id — blocks a one-click add that would collide with
   *  a hand-named profile. */
  existingProfileIds: ReadonlySet<string>;
}

/** Which one-click adds a card should offer, or `null` to hide the card. */
export interface FoundAgentActions {
  terminal: boolean;
  chat: boolean;
}

/**
 * The add actions still worth offering for a scanned agent. A mode is offered
 * only when nothing already covers it — so the card narrows as profiles are
 * added and disappears once every mode the agent supports is covered.
 */
export function foundAgentActions(
  agentId: string,
  c: FoundAgentCoverage,
): FoundAgentActions | null {
  const terminal =
    !c.coveredModes.has("terminal") &&
    !c.existingProfileIds.has(profileIdForCatalogAgent(agentId, "terminal"));
  const chat =
    c.supportsChat &&
    c.chatHostInstalled &&
    !c.coveredModes.has("chat") &&
    !c.existingProfileIds.has(profileIdForCatalogAgent(agentId, "chat"));
  if (!terminal && !chat) return null;
  return { terminal, chat };
}

/** The modes label under a card's name — `Terminal · Chat` or just `Terminal`.
 *  Always lists what the agent *supports*, not what is still addable. */
export function foundAgentModesLabel(supportsChat: boolean): string {
  return supportsChat ? "Terminal · Chat" : "Terminal";
}
