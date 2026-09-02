import type { Workspace } from "@silo-code/sdk";
import {
  store,
  activateWorkspace,
  getTerminalService,
  createHostChannel,
} from "@silo-code/extension-host";
import {
  getAgentProfiles,
  resolveDefaultProfile,
  launchAgentProfile,
} from "@silo-code/extension-host/internal";
import {
  findWorkspaceContaining,
  folderContains,
  normalizeFolder,
} from "./open-handler";

/**
 * A resolved `silo agent run [--profile <id>] [--ws <folder|.|id>]` request from
 * the host (`src-tauri`'s `commands/cli.rs`). `cwd` is the shell's forwarded
 * working directory — which workspace it launches into when `ws` is absent
 * (RFC 0033 R5, ADR 0047's resolution order). `profileId` is absent for a bare
 * `silo agent run`, which launches the default profile.
 */
export interface CliAgentRunRequest {
  cwd: string;
  profileId?: string;
  /** An explicit target: an absolute folder path, or a workspace id. */
  ws?: string;
}

// `cli:open` is fire-and-forget — there is no channel back to the caller's
// stdout (that is ADR 0047's Control mode, RFC 0034). A miss is reported to the
// Output panel, the one place a user can see why nothing happened.
const log = createHostChannel("silo:application", "Application");

const USAGE = "silo agent run [--profile <id>] [--ws <folder|.|id>]";

/**
 * `silo agent` with no verb, or a verb that isn't `run`. `agent` is a reserved
 * noun (ADR 0047), so this is never a path open — it reports usage instead of
 * silently opening a folder named `agent`.
 */
export function applyCliAgentUsage(verb?: string): void {
  log.warn(
    verb
      ? `silo agent: unknown command "${verb}". Usage: ${USAGE}`
      : `silo agent: missing command. Usage: ${USAGE}`,
  );
}

/** A resolved `--ws` target, plus the root the caller named when they named a
 *  path (an id target names no folder). */
interface ExplicitTarget {
  workspace: Workspace;
  namedFolder?: string;
}

/** An explicit `--ws` target: a workspace id, else an exact folder match. */
function resolveExplicitWorkspace(target: string): ExplicitTarget | undefined {
  const byId = store.workspaces[target];
  if (byId) return { workspace: byId };
  const wanted = normalizeFolder(target);
  for (const w of Object.values(store.workspaces)) {
    for (const folder of [w.folder, ...(w.extraFolders ?? [])]) {
      if (normalizeFolder(folder) === wanted)
        return { workspace: w, namedFolder: folder };
    }
  }
  return undefined;
}

/**
 * Where the agent's terminal starts. The shell's cwd wins **when it is inside
 * the target workspace** — that is the whole point of inferring a workspace
 * from it, and `cd packages/sdk && silo agent run` should start the agent
 * there, not at the repo root. When `--ws` names a workspace the shell is
 * *not* inside, its cwd is irrelevant to that workspace: start at the root the
 * caller named rather than in whatever unrelated directory they were standing
 * in.
 */
function launchCwd(
  workspace: Workspace,
  shellCwd: string,
  namedFolder?: string,
): string {
  const roots = [workspace.folder, ...(workspace.extraFolders ?? [])];
  if (roots.some((root) => folderContains(root, shellCwd))) return shellCwd;
  return namedFolder ?? workspace.folder;
}

/**
 * Act on a resolved `silo agent run` request against the live store:
 *
 * 1. Resolve the profile — `--profile <id>` by id, else the default (else the
 *    first). A miss logs and stops, creating nothing.
 * 2. Resolve the workspace — an explicit `--ws` target, else the one containing
 *    `cwd`. **Neither one creates a workspace** (ADR 0047: only `silo <dir>`
 *    may): running an agent somewhere unrelated is a mistake, not a request for
 *    a new workspace, and a persistent side effect the caller didn't ask for is
 *    the wrong way to guess.
 * 3. Launch, then activate, then focus. Launching while the target workspace is
 *    still not active takes `launchAgentProfile`'s eager-spawn branch; a panel
 *    mounting afterwards finds the intent already drained and just attaches.
 *    Activating a soft-closed match reopens it.
 *
 * The terminal's cwd is the forwarded `cwd` when that is inside the target; an
 * explicit `--ws` pointing elsewhere starts at the named root instead (see
 * {@link launchCwd}).
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

  const target = req.ws ? resolveExplicitWorkspace(req.ws) : undefined;
  const workspace = req.ws
    ? target?.workspace
    : findWorkspaceContaining(
        store.workspaces,
        req.cwd,
        store.activeWorkspaceId,
      );

  if (!workspace) {
    log.warn(
      req.ws
        ? `silo agent run: no workspace matches --ws "${req.ws}".`
        : `silo agent run: ${req.cwd} is not inside any workspace — open one first (silo <dir>) or name one with --ws <folder|.|id>.`,
    );
    return;
  }

  const rec = launchAgentProfile({
    profileId: profile.id,
    workspaceId: workspace.id,
    cwd: launchCwd(workspace, req.cwd, target?.namedFolder),
  });
  if (!rec) {
    // Profile vanished between the checks above and here — nothing to focus.
    return;
  }

  activateWorkspace(workspace.id);
  getTerminalService().focus(rec.id);
}
