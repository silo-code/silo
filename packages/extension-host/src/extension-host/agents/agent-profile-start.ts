/**
 * "Start this Agent Profile" — one dispatch, for every UI gesture that means it
 * (RFC 0038 Session 3.7).
 *
 * A profile's `launch` union decides what starting it *is*: a Terminal profile
 * creates a terminal record, a Chat profile opens a transcript panel. Before
 * this, each caller branched on `launch.interface` itself and re-derived the
 * Chat half — the `+` menu and `core.newAgent.<id>` had the same
 * resolve-the-host-or-explain logic written twice, and the reason
 * `resolveChatProfileHost` had to be reachable from `extensions-core` at all
 * was that the second copy lived there.
 *
 * ## What stays with the caller: placement
 *
 * Deliberately not folded in, because the callers genuinely differ. The `+`
 * menu has a dock group to put the panel in; a keybinding has none and opens
 * into the layout's default. So this resolves *what to start* and hands back a
 * discriminated answer the caller places — rather than taking a placement
 * callback, which would make one shape pretend to be two.
 *
 * ## What deliberately does not use this
 *
 * `control/agent-run-handler.ts` (`silo agent run`). It is a **headless**
 * verb — there is no window to open a transcript in — so it refuses a Chat
 * profile in its own words rather than dispatching. Routing it through here
 * would silently turn `silo agent run --profile my-chat` into a panel opening
 * on someone's screen, which is not what a control-API caller asked for.
 */

import { store } from "../../state/store";
import { pickWorkspaceFolder } from "../pick-folder";
import { launchAgentProfile } from "./agent-launch";
import {
  resolveChatProfileHost,
  chatProfileHostParams,
} from "./chat-profile-host";
import type { AgentProfile } from "../../state/types";
import type { TerminalRecord } from "../../state/types";

/**
 * What starting a profile resolved to. `refused` carries a message worth
 * showing the user; `cancelled` is silent on purpose — they dismissed the
 * folder chooser, or the profile was deleted between opening a menu and
 * clicking it, and inventing an error for either would be noise.
 */
export type AgentProfileStart =
  | { outcome: "terminal"; record: TerminalRecord }
  | {
      outcome: "panel";
      panelKindId: string;
      title: string;
      params: Record<string, unknown>;
    }
  | { outcome: "refused"; message: string }
  | { outcome: "cancelled" };

/**
 * Resolve what starting `profile` means, doing the side effect that belongs to
 * the host (creating the terminal record) but never placing a tab.
 *
 * Chat is decided first and without touching the folder chooser: a transcript
 * runs in the workspace folder, so prompting for a directory would be asking a
 * question the answer to which is unused.
 */
export async function startAgentProfile(
  profile: AgentProfile,
  workspaceId: string = store.activeWorkspaceId ?? "",
): Promise<AgentProfileStart> {
  if (!workspaceId || !store.workspaces[workspaceId]) {
    return { outcome: "cancelled" };
  }

  // `?.` guards a record predating the RFC 0038 launch union: falling through
  // to the terminal path is what happened before it existed, and
  // `launchAgentProfile` refuses anything it cannot type.
  if (profile.launch?.interface === "chat") {
    const kind = resolveChatProfileHost();
    if (!kind) {
      // Reachable: the profile outlives whatever panel used to render it (the
      // Chat panel example was disabled or uninstalled with nothing in its
      // place). Silence here is what sent the user hunting, so say what is
      // missing.
      return {
        outcome: "refused",
        message: `“${profile.label}” is a Chat profile and no Chat panel is installed to open it.`,
      };
    }
    return {
      outcome: "panel",
      panelKindId: kind.id,
      title: profile.label,
      params: chatProfileHostParams(profile),
    };
  }

  const folder = await pickWorkspaceFolder(workspaceId);
  if (!folder) return { outcome: "cancelled" };
  const record = launchAgentProfile({
    profileId: profile.id,
    workspaceId,
    cwd: folder,
  });
  if (!record) return { outcome: "cancelled" };
  return { outcome: "terminal", record };
}
