import {
  store,
  createWorkspace,
  activateWorkspace,
  getTerminalService,
  createHostChannel,
} from "@silo-code/extension-host";
import {
  getAgentProfiles,
  resolveDefaultProfile,
  launchAgentProfile,
} from "@silo-code/extension-host/internal";
import { basename, findWorkspaceContaining } from "./open-handler";

/**
 * A resolved `silo agent run [--profile <id>]` request from the host
 * (`src-tauri`'s `commands/cli.rs`). `cwd` is the shell's forwarded working
 * directory — which workspace it launches into (RFC 0033 R5). `profileId` is
 * absent for a bare `silo agent run`, which launches the default profile.
 */
export interface CliAgentRunRequest {
  cwd: string;
  profileId?: string;
}

// `cli:open` is fire-and-forget — there is no channel back to the caller's
// stdout (that is phase 9's Control API). A miss is reported to the Output
// panel, the one place a user can see why nothing happened.
const log = createHostChannel("silo:application", "Application");

/**
 * Act on a resolved `silo agent run` request against the live store:
 *
 * 1. Resolve the profile — `--profile <id>` by id, else the default (else the
 *    first). A miss logs and stops, creating nothing.
 * 2. Resolve the workspace — the open one containing `cwd`, else a new one
 *    rooted at `cwd` (as `silo <dir>` does).
 * 3. Launch, then activate, then focus. Launching while the target workspace is
 *    still not active takes `launchAgentProfile`'s eager-spawn branch; a panel
 *    mounting afterwards finds the intent already drained and just attaches.
 *
 * The terminal's cwd is the forwarded `cwd`, not the workspace root.
 */
export function applyCliAgentRun(req: CliAgentRunRequest): void {
  const profiles = getAgentProfiles();
  const profile = req.profileId
    ? profiles.find((p) => p.id === req.profileId)
    : resolveDefaultProfile(profiles);

  if (!profile) {
    log.warn(
      req.profileId
        ? `silo agent run: no profile with id "${req.profileId}".`
        : "silo agent run: no agent profiles defined — add one on Settings → Agents → Profiles.",
    );
    return;
  }

  const existing = findWorkspaceContaining(store.workspaces, req.cwd);
  const workspaceId =
    existing?.id ??
    createWorkspace({ folder: req.cwd, name: basename(req.cwd) }).id;

  const rec = launchAgentProfile({
    profileId: profile.id,
    workspaceId,
    cwd: req.cwd,
  });
  if (!rec) {
    // Profile vanished between the checks above and here — nothing to focus.
    return;
  }

  activateWorkspace(workspaceId);
  getTerminalService().focus(rec.id);
}
