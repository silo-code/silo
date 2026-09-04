import { createHostChannel } from "@silo-code/extension-host";

/**
 * `silo agent` / `silo ws` with no verb, or a verb that is not one Silo knows.
 *
 * `agent` and `ws` are **reserved nouns** (ADR 0047): they never open a folder,
 * whatever follows. That reservation is what stopped `silo agent list` from
 * silently opening a directory — but it leaves the bare and unknown forms
 * needing an answer, and this is it.
 *
 * These stay in **Forward** mode on purpose. The working verbs (`agent run`,
 * `ws list`) are Control commands that report on the caller's own stdout, so
 * what reaches here is only a usage mistake — and a usage report has no result
 * to return. Converting it would mean building a Control op whose entire payload
 * is a string the client already knows how to print.
 */
const log = createHostChannel("silo:application", "Application");

/** What each reserved noun can actually do today. */
const USAGE: Record<string, string> = {
  agent:
    "silo agent run [--profile <id>] [--ws <folder|.|id>] [--prompt <text>]",
  ws: "silo ws list [--json]",
};

/**
 * Report usage for a reserved noun. `verb` is the unrecognized verb when there
 * was one; absent for a bare `silo agent` / `silo ws`.
 */
export function applyCliUsage(noun: string, verb?: string): void {
  const usage = USAGE[noun] ?? `silo ${noun}`;
  log.warn(
    verb
      ? `silo ${noun}: unknown command "${verb}". Usage: ${usage}`
      : `silo ${noun}: missing command. Usage: ${usage}`,
  );
}
