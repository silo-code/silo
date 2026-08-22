/**
 * Pi's session-capture hook, as a TypeScript **extension** — pure template.
 *
 * Every other agent Silo supports configures hooks as a *shell command* in a
 * JSON config file, so installing one is a data edit (see
 * `agent-hook-script.ts` for the one script they all run). Pi has no such
 * mechanism: its hooks are TypeScript modules auto-loaded from
 * `~/.pi/agent/extensions/`, which means Silo's install has to write a small
 * piece of **code** into the user's agent config. ADR 0041 records why that
 * trade is worth making and the constraints it carries.
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
 * - It passes pi's own pid via `SILO_AGENT_PID`, so the script skips its
 *   parent walk entirely (see `agent-hook-script.ts`). Running *inside* the
 *   agent process is the one case where the walk is pure downside: pi's
 *   argv0 is `node`, and `pi` is a two-character substring that the walk's
 *   fallback pass would happily match against an unrelated ancestor's path.
 * - Every failure is swallowed. Session tracking must never break a pi turn.
 */

export interface PiExtensionParams {
  marker: string;
  /** `$HOME`-relative path to the shared capture script. */
  trackScriptRel: string;
  /** Catalog id passed to the script as its agent tag (`pi`). */
  agentId: string;
}

/**
 * Build the source of Silo's pi extension. Catalog stays the SSOT for the
 * marker, the script path, and the agent tag; this module only packages the
 * TypeScript.
 */
export function renderPiTrackSessionExtension(
  params: PiExtensionParams,
): string {
  const { marker, trackScriptRel, agentId } = params;
  return [
    "// Silo session tracking (getsilo.dev) — records which pi session is running",
    "// in a terminal so Silo can offer an exact resume command after a restart.",
    "// Safe to inspect: it runs one short-lived shell script and never reads or",
    "// sends your conversation. Managed by Silo; see Settings > Agents.",
    `// Marker: ${marker}`,
    'import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";',
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
    "\t\t\t\t// Skip the script's parent walk: we already know pi's pid.",
    "\t\t\t\tenv: { ...process.env, SILO_AGENT_PID: String(process.pid) },",
    '\t\t\t\tstdio: ["pipe", "ignore", "ignore"],',
    "\t\t\t});",
    '\t\t\tchild.on("error", () => {});',
    "\t\t\tchild.stdin.end(",
    "\t\t\t\tJSON.stringify({ session_id: sessionId, cwd: ctx.cwd }),",
    "\t\t\t);",
    "\t\t} catch {",
    "\t\t\t// Never let session tracking break a pi session.",
    "\t\t}",
    "\t});",
    "}",
    "",
  ].join("\n");
}
