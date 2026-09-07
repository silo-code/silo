/**
 * The TypeScript body of Silo's session-tracking **extension** — the one
 * install shape that isn't a shell command in a JSON config file (ADR 0041).
 *
 * It lives in its own module rather than inside `catalog/pi.ts` because two
 * catalog agents now emit it: pi and OMP (RFC 0037), a pi fork with the same
 * extension API and its own config home. A catalog module must not import
 * another agent's module (ADR 0042 decision 2), so the template both share
 * sits beside them, parameterized, with no runtime import back into
 * `agent-catalog.ts`.
 *
 * Every other agent Silo supports configures hooks as a *shell command* in a
 * JSON config file, so installing one is a data edit (see
 * `agent-hook-script.ts` for the one script they all run). Pi and OMP have no
 * such mechanism: their hooks are TypeScript modules auto-loaded from
 * `~/.pi/agent/extensions/` / `~/.omp/agent/extensions/`, which means Silo's
 * install has to write a small piece of **code** into the user's agent
 * config. ADR 0041 records why that trade is worth making and the constraints
 * it carries.
 *
 * The constraints, all visible in the source below:
 *
 * - It runs the *same* shared capture script every other agent runs — the
 *   extension is a thin adapter (read the session id, spawn, write the JSON
 *   payload to stdin), never a second implementation of the capture logic.
 * - It carries {@link SILO_HOOK_MARKER} in a comment, so install-state
 *   detection, drift-refresh, and uninstall can recognize Silo's own file.
 * - It leads with a plain-language header saying what it does and who owns
 *   it, for the same reason the shell script does (RFC 0019).
 * - It passes the agent's own pid via `SILO_AGENT_PID`, so the script skips
 *   its parent walk entirely (see `agent-hook-script.ts`). Running *inside*
 *   the agent process is the one case where the walk is pure downside: the
 *   argv0 is an interpreter (`node` for pi, `bun` for OMP), and `pi` is a
 *   two-character substring that the walk's fallback pass would happily match
 *   against an unrelated ancestor's path.
 * - Every failure is swallowed. Session tracking must never break a turn.
 */

/**
 * Catalog-owned data a pi-extension agent's `AgentDefinition` needs but does
 * not own — supplied by `agent-catalog.ts`, the SSOT, so neither agent module
 * carries a runtime import back into it.
 *
 * It lives here, beside the template both agents render, rather than in
 * either agent's own module: a catalog module must not import a sibling's
 * (ADR 0042 decision 2), and typing OMP's factory as a `PiAgentDeps` would
 * have said its dependencies are pi's. They are the same *shape* because both
 * install the same kind of hook, not because one belongs to the other.
 *
 * The `trackScriptRel` field is what separates this from `agent-catalog.ts`'s
 * `HookAgentDeps`: only an agent whose hook is a rendered extension file needs
 * the script path, because only it templates the path into source.
 */
export interface PiExtensionAgentDeps {
  /** {@link SILO_HOOK_MARKER} — passed through, not reimported. */
  marker: string;
  /** {@link TRACK_SCRIPT_REL} — passed through, not reimported. */
  trackScriptRel: string;
  /** `agent-catalog.ts`'s shared hook-command builder. */
  buildHookCommand: (agentId: string) => string;
}

export interface PiExtensionParams {
  marker: string;
  /** `$HOME`-relative path to the shared capture script. */
  trackScriptRel: string;
  /** Catalog id passed to the script as its agent tag (`pi`, `omp`). */
  agentId: string;
  /**
   * How the agent is named in the file's plain-language header — the user
   * reads this in their own config directory, so it must name the CLI they
   * actually run. Defaults to pi's, whose emitted source predates this
   * parameter and must stay byte-identical.
   */
  displayName?: string;
  /**
   * The indefinite article that reads correctly before {@link displayName} in
   * the one sentence that needs one ("never let session tracking break **a**
   * pi session" / "**an** OMP session"). A parameter rather than something
   * derived from the name, because English articles follow the *sound* of the
   * next word, not its spelling — "OMP" is spelled with a consonant and said
   * with a vowel. Defaults to pi's.
   */
  indefiniteArticle?: string;
  /**
   * The package the type-only import resolves against. Erased before the
   * agent's jiti loader ever runs, so this only matters when the user opens
   * the file in an editor — but it should name the package that is actually
   * installed for that agent. Defaults to pi's upstream package; OMP passes
   * its own (`@oh-my-pi/pi-coding-agent`, which its own bundled extension
   * examples import).
   */
  typeImportSpecifier?: string;
}

/**
 * Build the source of Silo's session-tracking extension for a pi-shaped
 * agent. Catalog stays the SSOT for the marker, the script path, and the
 * agent tag; this module only packages the TypeScript.
 */
export function renderPiTrackSessionExtension(
  params: PiExtensionParams,
): string {
  const {
    marker,
    trackScriptRel,
    agentId,
    displayName = "pi",
    indefiniteArticle = "a",
    typeImportSpecifier = "@earendil-works/pi-coding-agent",
  } = params;
  return [
    `// Silo session tracking (getsilo.dev) — records which ${displayName} session is running`,
    "// in a terminal so Silo can offer an exact resume command after a restart.",
    "// Safe to inspect: it runs one short-lived shell script and never reads or",
    "// sends your conversation. Managed by Silo; see Settings > Agents.",
    `// Marker: ${marker}`,
    `import type { ExtensionAPI, ExtensionContext } from "${typeImportSpecifier}";`,
    'import { spawn } from "node:child_process";',
    'import { homedir } from "node:os";',
    'import { join } from "node:path";',
    "",
    "export default function (pi: ExtensionAPI) {",
    '\tpi.on("session_start", (_event, ctx: ExtensionContext) => {',
    "\t\ttry {",
    "\t\t\tconst sessionId = ctx.sessionManager.getSessionId();",
    "\t\t\tif (!sessionId) return;",
    `\t\t\tconst script = join(homedir(), "${trackScriptRel}");`,
    `\t\t\tconst child = spawn("sh", [script, "${agentId}"], {`,
    `\t\t\t\t// Skip the script's parent walk: we already know ${displayName}'s pid.`,
    "\t\t\t\tenv: { ...process.env, SILO_AGENT_PID: String(process.pid) },",
    '\t\t\t\tstdio: ["pipe", "ignore", "ignore"],',
    "\t\t\t});",
    '\t\t\tchild.on("error", () => {});',
    "\t\t\tchild.stdin.end(",
    "\t\t\t\tJSON.stringify({ session_id: sessionId, cwd: ctx.cwd }),",
    "\t\t\t);",
    "\t\t} catch {",
    `\t\t\t// Never let session tracking break ${indefiniteArticle} ${displayName} session.`,
    "\t\t}",
    "\t});",
    "}",
    "",
  ].join("\n");
}
