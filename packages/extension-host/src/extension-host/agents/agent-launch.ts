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
import { getLoginShell } from "../login-shell";
import { requestProfileLaunch } from "./pending-launch";
import { shellDialect, type ShellDialect } from "./agent-prompt";
import type { TerminalRecord } from "../../state/types";

/**
 * The dialect of the shell a Silo-launched terminal will actually run (RFC
 * 0033 phase 3), in the order the shell is actually chosen:
 *
 * 1. The Terminal setting's explicit shell, when the user set one — that is
 *    what `process-service.ts` passes to the session host, so it is the shell
 *    the prompt will be typed into.
 * 2. Otherwise the login shell, which is what the session host falls back to
 *    when the setting is empty.
 *
 * An unreadable login shell yields `"unsupported"` and the prompt is refused —
 * never assumed POSIX. Resolved **once per launch** and carried on the pending
 * launch, so the precheck and the drain cannot reach different conclusions.
 */
export function launchShellDialect(): ShellDialect {
  const configured = store.terminalSettings.shell.trim();
  return shellDialect(configured || getLoginShell());
}

export interface LaunchAgentProfileInput {
  profileId: string;
  /** Target workspace. Defaults to the active workspace. */
  workspaceId?: string;
  /** Working directory for the terminal. Defaults to the workspace folder. */
  cwd?: string;
  /**
   * An opening prompt to deliver on the launch line (RFC 0033 phase 3).
   * Composed at drain time against the profile as it is then; a prompt that
   * cannot be quoted safely types nothing. Callers that can refuse before
   * creating anything (`ctx.agents.profiles.launch()`) precheck first — this
   * function itself does not, because the terminal record is its whole job.
   */
  prompt?: string;
  /** The dialect the prompt will be quoted for. Required whenever `prompt` is
   *  set; decided once by {@link launchShellDialect} at the caller's precheck
   *  so the drain cannot re-derive a different answer. */
  dialect?: ShellDialect;
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
  requestProfileLaunch(rec.id, input.profileId, input.prompt, input.dialect);

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
