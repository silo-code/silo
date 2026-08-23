/**
 * Terminal identity in the session environment (RFC 0028).
 *
 * Every session Silo spawns carries a small set of host-stamped facts about
 * itself — that it is a Silo session, which tab it is, which workspace it
 * belongs to, and where Silo's own `silo` binary lives. Anything running
 * inside can read them: a coding agent's hook, a script, the `silo` CLI.
 *
 * This module stamps the facts the webview knows — `SILO`, the tab, the
 * workspace. `SILO_BIN` and the `PATH` prepend are stamped natively, in the
 * forkpty child, because only the Rust side knows the app's data directory and
 * the daemon's inherited `PATH`. Each layer stamps what it actually knows.
 *
 * Two rules make this a contract rather than a convention, and both live here:
 *
 * 1. **`SILO_*` is reserved.** Callers cannot write it — see
 *    {@link stripReservedEnv}. A guard keyed on a value any extension could set
 *    is not a guard (RFC 0028 → "Prior art").
 * 2. **Only immutable facts go in.** Environment is set once, when the session
 *    is created, and never revisited — a session outlives app restarts, and
 *    reattaching does not re-create it. A fact that changes over a terminal's
 *    life (what is *running* right now, say) would start lying immediately;
 *    it belongs on the launch line instead.
 *
 * The public contract is documented at `apps/docs/api/terminal-environment.md`.
 */

/**
 * Host-owned environment prefix. Matches the bare `SILO` too, so `SILO=1`
 * itself can't be forged.
 *
 * **Case-insensitive on purpose.** Windows looks environment variables up
 * without regard to case, so letting `silo_terminal_id` through would hand a
 * caller the very key the guard reads — and, with both spellings present, make
 * it non-deterministic which one the child sees. Matching case-insensitively
 * everywhere keeps one rule on every platform rather than a Windows-only branch
 * that the non-Windows tests would never exercise.
 */
const RESERVED = /^SILO(_|$)/i;

/** The identity facts the host stamps onto a session it owns. */
export interface SessionIdentity {
  /** The terminal record's id — the **tab**, not the session (RFC 0028). */
  terminalId?: string;
  /** The owning workspace's id. */
  workspaceId?: string;
  /** The workspace folder, absolute. */
  workspacePath?: string;
}

/**
 * Drop every reserved key from a caller-supplied env map, returning the
 * surviving entries plus the names that were dropped so the caller can log
 * them. Pure — the logging is deliberately not done here so this stays
 * trivially testable.
 */
export function stripReservedEnv(env: Record<string, string> | undefined): {
  env: Record<string, string>;
  dropped: string[];
} {
  const kept: Record<string, string> = {};
  const dropped: string[] = [];
  for (const [key, value] of Object.entries(env ?? {})) {
    if (RESERVED.test(key)) dropped.push(key);
    else kept[key] = value;
  }
  return { env: kept, dropped };
}

/**
 * Assemble the environment for a session: the caller's variables with reserved
 * keys removed, then Silo's identity stamped on top.
 *
 * Identity always wins over caller input — that is the whole point of the
 * reservation — but the strip has already removed those keys, so the merge
 * order here is belt-and-braces rather than load-bearing.
 *
 * Absent identity fields are simply not set. A session spawned through the
 * public `ctx.process.spawn` has no terminal id to claim (only `core.terminal`
 * can supply one, via the privileged barrel), so it gets `SILO=1` and the
 * workspace facts and nothing more — which is the correct trust level, not a
 * gap.
 */
export function buildSessionEnv(
  identity: SessionIdentity,
  callerEnv?: Record<string, string>,
): { env: Record<string, string>; dropped: string[] } {
  const { env, dropped } = stripReservedEnv(callerEnv);

  env.SILO = "1";
  if (identity.terminalId) env.SILO_TERMINAL_ID = identity.terminalId;
  if (identity.workspaceId) env.SILO_WORKSPACE_ID = identity.workspaceId;
  if (identity.workspacePath) env.SILO_WORKSPACE_PATH = identity.workspacePath;

  return { env, dropped };
}
