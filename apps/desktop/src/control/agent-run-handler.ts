import type { PromptRefusal, Workspace } from "@silo-code/sdk";
import { store } from "@silo-code/extension-host";
import {
  getAgentProfiles,
  resolveDefaultProfile,
  createAgentProfilesService,
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
 * Map a launch refusal onto the closed error vocabulary (R4).
 *
 * The split is the one the vocabulary exists to make. `too-large` is the
 * caller's argument, so `invalid-args`; the prompt refusals are facts about the
 * environment the command ran in — which agent the profile resolves to, whether
 * that agent's CLI takes an opening prompt, whether Silo knows the shell's exact
 * quoting rule — so `failed`, never `internal`. Nothing is broken in any of
 * them.
 *
 * `no-profile` / `no-workspace` are unreachable from here: this handler
 * resolves both itself, with messages that say which rung failed. They are
 * mapped anyway, because the service re-checks them and a silent `internal`
 * would be the wrong answer if it ever won that race.
 */
function refusalResult(
  refusal: PromptRefusal | "no-profile" | "no-workspace",
  profileId: string,
): ControlResult {
  switch (refusal) {
    case "too-large":
      // The client already rejects an oversized `--prompt` as `invalid-args`
      // without connecting, which is the right answer for a bad argument. This
      // arm is the narrow remainder: sanitizing expands each tab to two spaces,
      // so a prompt just under the cap can cross it here. `invalid-args` is out
      // of a handler's reach by design (see `ControlErrorCode`), and `failed` is
      // the honest code for a limit only the sanitizer could discover.
      return fail(
        "failed",
        "--prompt crosses Silo's opening-prompt size limit once sanitized (tabs become two spaces).",
      );
    case "no-agent":
      return fail(
        "failed",
        `Agent profile "${profileId}" resolves to no known agent, so Silo cannot tell whether its CLI takes an opening prompt.`,
      );
    case "agent-takes-none":
      return fail(
        "failed",
        `The agent behind profile "${profileId}" has no way to take an opening prompt and stay interactive.`,
      );
    case "unsupported-shell":
      return fail(
        "failed",
        "Silo has no exact quoting rule for this terminal's shell and will not approximate one — set a supported shell in Settings → Terminal.",
      );
    case "no-profile":
    case "no-workspace":
      return fail("not-found", `The ${refusal.slice(3)} went away mid-launch.`);
  }
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

  // Delegate the launch itself to the same service `ctx.agents.profiles` is
  // built from. It owns the prompt precheck, the dialect decision, and the
  // activate/focus that follow a successful launch — so the CLI and an
  // extension cannot drift on any of them, and a prompt Silo cannot quote
  // exactly aborts before anything is created (R11: no half-created terminal).
  const result = createAgentProfilesService().launch({
    profileId: profile.id,
    workspaceId: workspace.id,
    cwd: launchCwd(workspace, req.cwd, target?.namedFolder),
    ...(req.prompt === undefined ? {} : { prompt: req.prompt }),
  });

  if (!result.ok) return refusalResult(result.refusal, profile.id);

  return ok({
    terminalId: result.terminalId,
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    profileId: profile.id,
  } satisfies AgentRunData);
}
