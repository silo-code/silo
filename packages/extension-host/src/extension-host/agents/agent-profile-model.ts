// Pure model helpers for Agent Profiles (RFC 0033 phase 1). No store, no I/O —
// slugify, validation, launch-line building, POSIX quoting, tilde expansion,
// and the catalog-agent auto-detect match. The bulk of the phase's risk lives
// here, so the bulk of the coverage does too (`agent-profile-model.test.ts`).

import { AGENT_CATALOG, agentById, leaderBasename } from "./agent-catalog";
import type { AgentProfile } from "../../state/types";

/** The id shape a profile must match. Exported so the editor and validation
 *  reference one source. */
export const PROFILE_ID_RE = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Prefill an id from a label: lowercase, strip non-alphanumerics, collapse runs
 * to a single hyphen, trim leading/trailing hyphens. `"Claude (work)"` →
 * `"claude-work"`. An all-punctuation label slugs to `""` — the caller treats an
 * empty result as "user must type one".
 */
export function slugifyProfileId(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface ProfileDraft {
  id: string;
  label: string;
  command: string;
}

export interface ProfileDraftErrors {
  label?: string;
  id?: string;
  command?: string;
}

/**
 * Validate a draft against the existing profiles. `editingId` is the id of the
 * profile being edited (so it does not collide with itself); omit when creating.
 * Returns an errors object — empty (`{}`) means valid.
 */
export function validateProfileDraft(
  draft: ProfileDraft,
  existing: readonly AgentProfile[],
  editingId?: string,
): ProfileDraftErrors {
  const errors: ProfileDraftErrors = {};

  if (!draft.label.trim()) errors.label = "Label is required.";
  if (!draft.command.trim()) errors.command = "Command is required.";

  const id = draft.id.trim();
  if (!id) {
    errors.id = "Id is required.";
  } else if (!PROFILE_ID_RE.test(id)) {
    errors.id =
      "Use lowercase letters, digits, and hyphens; must start with a letter or digit.";
  } else if (existing.some((p) => p.id === id && p.id !== editingId)) {
    errors.id = `Another profile already uses the id “${id}”.`;
  }

  return errors;
}

/** True when a validation result has no errors. */
export function draftIsValid(errors: ProfileDraftErrors): boolean {
  return !errors.label && !errors.id && !errors.command;
}

/**
 * POSIX single-quote a string for safe interpolation into a shell command line:
 * wrap in `'…'`, and render an embedded `'` as `'\''`. Safe for every
 * POSIX-family shell (bash/zsh/sh); fish/nu are a phase-3 concern.
 */
export function posixSingleQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/**
 * Expand a leading `~` (bare, or `~/…`) to `home`. A `~user` form is left
 * untouched — resolving another user's home is out of scope and better left to
 * the shell. An already-absolute path is returned unchanged.
 */
export function expandTilde(path: string, home: string): string {
  if (path === "~") return home;
  if (path.startsWith("~/")) return `${home}/${path.slice(2)}`;
  return path;
}

/**
 * The exact line Silo types into the terminal's interactive shell for a
 * profile. With a `configDir` **and** a `configDirEnvVar` for the resolved
 * agent, the line is `<VAR>='<abs path>' <command>`; otherwise it is the
 * profile's `command` verbatim (a `configDir` with no env var emits no
 * prefix — R3 clears such a value rather than letting it rot).
 */
export function buildLaunchLine(
  profile: Pick<AgentProfile, "command" | "configDir">,
  configDirEnvVar: string | undefined,
): string {
  const command = profile.command;
  if (profile.configDir && configDirEnvVar) {
    return `${configDirEnvVar}=${posixSingleQuote(profile.configDir)} ${command}`;
  }
  return command;
}

/**
 * {@link buildLaunchLine} with the config-dir env var resolved from the
 * profile's own `assumedAgentId` against the sealed catalog — the line to type
 * given just a profile. The single source both the pending-launch drain and
 * the terminal context menu's "run here" use.
 */
export function profileLaunchLine(
  profile: Pick<AgentProfile, "command" | "configDir" | "assumedAgentId">,
): string {
  const envVar = profile.assumedAgentId
    ? agentById(profile.assumedAgentId)?.configDirEnvVar
    : undefined;
  return buildLaunchLine(profile, envVar);
}

/** The first shell token of a command string (whitespace-split). */
export function firstToken(command: string): string {
  return command.trim().split(/\s+/)[0] ?? "";
}

/**
 * Auto-detect the catalog agent from a profile's command text: take the
 * leading token up to the first `-`/`_` boundary and match it **exactly**
 * (never as a substring) against catalog `leaderNames`. `claude-work` →
 * `claude`. Skipped for tokens shorter than three characters, so `pi` never
 * matches `pip` and `copilot` never matches via `pilot`.
 */
export function fallbackAgentForCommand(command: string): string | undefined {
  const token = leaderBasename(firstToken(command));
  const head = token.split(/[-_]/)[0] ?? "";
  if (head.length < 3) return undefined;
  return AGENT_CATALOG.find((a) => a.leaderNames.includes(head))?.id;
}
