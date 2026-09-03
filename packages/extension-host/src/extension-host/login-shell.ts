// The user's login shell, resolved once at host init (RFC 0033 phase 3).
//
// Why cached rather than awaited per call: the value cannot change for the life
// of the process, and every consumer that needs it is synchronous.
// `ctx.agents.profiles.launch()` returns a result rather than a promise
// precisely so an extension can act on a refusal inline, and RFC 0034's
// `agent.run` handler will read the same value from a synchronous path. Making
// either async to fetch a constant would push a signature change through both
// for nothing.
//
// This is what lets the shell **dialect** be decided once per launch and
// carried on the pending launch, instead of being re-derived at drain time
// against a terminal record that did not exist at precheck.
//
// Known limitation, accepted: `$SHELL` is read in the app process, while the
// session host resolves its own. They are the same value in every normal
// launch — the daemon inherits the app's environment — and the Terminal
// setting's explicit shell takes precedence over this anyway. If it ever bites,
// the escalation is to read the session's foreground leader (authoritative, no
// new IPC, but it makes the drain async), not to guess harder.

import { defaultShell } from "../services/tauri-system";

let loginShell: string | undefined;

/**
 * Resolve the login shell into module state. Called once from the app's boot
 * sequence, before any launch can be requested. Failure is not fatal: the shell
 * stays unknown, {@link getLoginShell} keeps returning `undefined`, and a
 * prompt is then refused with `unsupported-shell` rather than typed into a
 * shell Silo cannot identify.
 */
export async function initLoginShell(): Promise<void> {
  try {
    const shell = (await defaultShell()).trim();
    if (shell) loginShell = shell;
  } catch {
    // Left undefined on purpose — see the doc comment.
  }
}

/** The resolved login shell, or `undefined` when it could not be read. */
export function getLoginShell(): string | undefined {
  return loginShell;
}

/** Test seam — reset (or preset) the cached value. */
export function setLoginShellForTests(shell: string | undefined): void {
  loginShell = shell;
}
