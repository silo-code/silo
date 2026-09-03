import type { Workspace } from "@silo-code/sdk";
import {
  store,
  activateWorkspace,
  getTerminalService,
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
} from "../cli/open-handler";
import { fail, ok, type ControlResult } from "./types";

/**
 * `agent.run` — launch an Agent Profile and **report what was created**
 * (RFC 0034 R11).
 *
 * This is the Control API's proving mutate-tier consumer. The Forward-mode
 * version it replaces logged its outcome to the Output panel and exited 0
 * whatever happened; the differences here are the whole point of the proposal:
 *
 * - it **returns** the created terminal's id, so a caller can act on it next;
 * - an unresolvable `--profile` or `--ws` is `not-found`, not a warning;
 * - a cwd inside no workspace is an error rather than a silent create, which
 *   brings the command into conformance with ADR 0047 rule 5 (only `silo <dir>`
 *   may create a workspace);
 * - every refusal happens **before** anything is created, so a failed run leaves
 *   no half-created terminal.
 */

/** A resolved `silo agent run` request, as it arrives over the channel. */
export interface ControlAgentRunRequest {
  /** The shell's forwarded working directory — which workspace it launches into
   *  when `ws` is absent (ADR 0047's resolution order). */
  cwd: string;
  /** `--profile <id>`. Absent → the default profile. */
  profileId?: string;
  /** `--ws <folder|.|ws_id>`: an absolute folder path, or a workspace id. */
  ws?: string;
  /** `--prompt <text>` — an opening prompt for the agent. */
  prompt?: string;
}

/** What a successful run reports back. */
export interface AgentRunData {
  terminalId: string;
  workspaceId: string;
  workspaceName: string;
  profileId: string;
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
 * Whether an opening prompt can be delivered at all.
 *
 * **Not yet.** RFC 0033 phase 3 owns prompt delivery — the `promptDelivery`
 * catalog field, the quoted-heredoc transport, and the line-editor sanitization
 * that makes typing a payload into a live shell safe. Until it lands there is no
 * safe path, and RFC 0034 deliberately does not invent one: a quoting bug in an
 * improvised transport is arbitrary code execution as the user, which is the
 * exact risk phase 3 exists to close.
 *
 * The flag ships now because ADR 0047's 2026-09-02 amendment puts a new flag on
 * a conversion-bound verb in Control mode, and `agent run`'s conversion is this
 * change — building it in Forward mode first would mean building it into a mode
 * the verb is leaving. So the flag, the wire argument, and the refusal mapping
 * are here, and phase 3 replaces this function's body with its real precheck.
 * The refusal is `failed`, not `internal`: nothing is broken, the capability
 * simply is not available in this build.
 */
function checkPrompt(prompt: string | undefined): ControlResult | undefined {
  if (prompt === undefined) return undefined;
  return fail(
    "failed",
    "--prompt is not available yet: opening-prompt delivery ships with Agent Profiles phase 3 (RFC 0033).",
  );
}

/**
 * Act on a resolved `agent.run` request against the live store.
 *
 * Resolution order, every step of which refuses rather than guessing:
 *
 * 1. **The profile** — `--profile <id>` by id, else the default (else the
 *    first). A miss is `not-found`.
 * 2. **The command** — a profile with nothing to run cannot start an agent, and
 *    saying so beats opening a terminal that sits at a bare prompt.
 * 3. **The workspace** — an explicit `--ws` target, else the one containing
 *    `cwd`. **Neither creates a workspace** (ADR 0047 rule 5): running an agent
 *    somewhere unrelated is a mistake, not a request for a new workspace, and a
 *    persistent side effect the caller did not ask for is the wrong way to
 *    guess.
 * 4. **Launch, activate, focus.** Launching while the target workspace is still
 *    not active takes `launchAgentProfile`'s eager-spawn branch; a panel
 *    mounting afterwards finds the intent already drained and just attaches.
 *    Activating a soft-closed match reopens it.
 *
 * One thing this deliberately does **not** report: whether the agent's command
 * actually started. The launch line is *typed into a shell* at drain time
 * (RFC 0033's model), so a `command not found` surfaces in the terminal seconds
 * after this response has already been written. What the caller gets is the
 * terminal's id — a real handle it can watch — rather than a guess.
 */
export function applyControlAgentRun(
  req: ControlAgentRunRequest,
): ControlResult {
  const profiles = getAgentProfiles();
  const profile = req.profileId
    ? profiles.find((p) => p.id === req.profileId)
    : resolveDefaultProfile(profiles);

  if (!profile) {
    return fail(
      "not-found",
      req.profileId
        ? `No agent profile with id "${req.profileId}".`
        : "No agent profiles defined — add one on Settings → Agents → Profiles.",
    );
  }

  if (!profile.command.trim()) {
    return fail(
      "failed",
      `Agent profile "${profile.id}" has no command to run.`,
    );
  }

  const promptRefusal = checkPrompt(req.prompt);
  if (promptRefusal) return promptRefusal;

  const target = req.ws ? resolveExplicitWorkspace(req.ws) : undefined;
  const workspace = req.ws
    ? target?.workspace
    : findWorkspaceContaining(
        store.workspaces,
        req.cwd,
        store.activeWorkspaceId,
      );

  if (!workspace) {
    return fail(
      "not-found",
      req.ws
        ? `No workspace matches --ws "${req.ws}".`
        : `${req.cwd} is not inside any workspace — open one first (silo <dir>) or name one with --ws <folder|.|ws_id>.`,
    );
  }

  const rec = launchAgentProfile({
    profileId: profile.id,
    workspaceId: workspace.id,
    cwd: launchCwd(workspace, req.cwd, target?.namedFolder),
  });
  if (!rec) {
    // Both of `launchAgentProfile`'s refusals were already checked above, so
    // reaching here means the store changed underneath us mid-call. It creates
    // nothing when it refuses, so there is no half-built terminal to clean up.
    return fail(
      "internal",
      "Silo could not create the terminal — the profile or workspace changed mid-launch.",
    );
  }

  activateWorkspace(workspace.id);
  getTerminalService().focus(rec.id);

  return ok({
    terminalId: rec.id,
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    profileId: profile.id,
  } satisfies AgentRunData);
}
