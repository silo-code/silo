// Launch an Agent Profile into a terminal (RFC 0033 R6). This does NOT spawn a
// PTY as a side effect of being called — it creates the terminal record,
// records the pending launch, and (only for a background workspace, where no
// panel will ever mount) kicks `ensureSession` so the intent actually gets
// drained. The launch line is resolved from the profile at *drain* time, not
// here, so an edit or delete landing in between is respected.

import { store } from "../../state/store";
import { addTerminal } from "../../state/workspaces";
import { getAgentProfiles } from "../../state/agent-profiles";
import { ensureSession } from "../terminal-service";
import { requestProfileLaunch } from "./pending-launch";
import type { TerminalRecord } from "../../state/types";

export interface LaunchAgentProfileInput {
  profileId: string;
  /** Target workspace. Defaults to the active workspace. */
  workspaceId?: string;
  /** Working directory for the terminal. Defaults to the workspace folder. */
  cwd?: string;
}

/**
 * Create a terminal bound to a profile and register its pending launch.
 * Returns the created {@link TerminalRecord}, or `undefined` when there is no
 * target workspace or the profile does not exist.
 *
 * The caller owns opening and activating the tab (exactly as the `+` menu does
 * for "New Terminal") — this never moves focus or reorders tabs.
 */
export function launchAgentProfile(
  input: LaunchAgentProfileInput,
): TerminalRecord | undefined {
  const workspaceId = input.workspaceId ?? store.activeWorkspaceId;
  if (!workspaceId || !store.workspaces[workspaceId]) return undefined;
  if (!getAgentProfiles().some((p) => p.id === input.profileId))
    return undefined;

  const rec = addTerminal(workspaceId, "shell", input.cwd, {
    profileId: input.profileId,
  });
  requestProfileLaunch(rec.id, input.profileId);

  // Foreground: a `TerminalPanel` will mount and drain on "ready". Background
  // (a workspace that is not the active one — no panel mounts): nobody would
  // report readiness, so kick the lazy spawn, which drains on resolve. No
  // phase-1 surface reaches this branch (both menus target the active
  // workspace); it exists for `silo agent run --profile` (phase 2) and
  // `ctx.agents.profiles.launch({ workspaceId })` (phase 5).
  if (workspaceId !== store.activeWorkspaceId) {
    void ensureSession(rec.id);
  }
  return rec;
}
