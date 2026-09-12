/**
 * Which registered dock panel kind opens a **Chat** Agent Profile (RFC 0038).
 *
 * A Chat-armed profile has no PTY to launch — `launchAgentProfile` refuses one
 * by design — so every "start this profile" gesture (the center dock's **+**
 * menu, `core.newAgent.<id>`) needs a transcript UI instead, and the host does
 * not own one. A panel kind claims the job by declaring
 * `DockPanelKind.chatProfileHost`, which is a **declaration, not a
 * privilege**: the bundled `core.acp-chat` claims it exactly as a third-party
 * Chat panel would, so replacing the bundled panel keeps the `+` menu working
 * rather than stranding those profiles.
 *
 * Kept out of `GroupAddMenu.tsx` so the host chrome never hardcodes an
 * extension's panel-kind id, and so the resolution is testable on its own.
 */

import type { DockPanelKind } from "@silo-code/sdk";
import { dockPanelKindRegistry } from "../dock-panel-kinds";

/**
 * Pick the kind that renders Chat sessions, or `undefined` when no installed
 * extension offers one (the `chatAgents` gate is off, or the user disabled the
 * bundled panel without installing a replacement).
 *
 * First registered wins when several claim it. Registration order is the
 * composition root's for built-ins and install order for the rest, so this is
 * stable across restarts — and the fix for the wrong one winning is to disable
 * it on Settings → Extensions, not a preference Silo would have to invent.
 */
export function resolveChatProfileHost(
  kinds: readonly DockPanelKind[] = dockPanelKindRegistry.list(),
): DockPanelKind | undefined {
  return kinds.find((k) => k.chatProfileHost === true);
}

/** The params a chat-profile host is opened with. `title` seeds the tab label
 *  before the agent has declared its own name. */
export function chatProfileHostParams(profile: {
  id: string;
  label: string;
}): Record<string, unknown> {
  return { profileId: profile.id, title: profile.label };
}
