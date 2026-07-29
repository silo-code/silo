/**
 * Fail-closed JSON settings reads for Agents → Install / Uninstall.
 *
 * A missing file is fine (treat as empty on write). A file that exists but
 * fails to parse must never be rewritten as `{}` + Silo's hook — that would
 * wipe the user's other hooks. Callers distinguish the two via
 * {@link SettingsJsonRead}.
 */

/** Result of reading a settings JSON file that may be absent or corrupt. */
export type SettingsJsonRead<T extends object> =
  | { kind: "missing" }
  | { kind: "ok"; value: T }
  | { kind: "invalid"; message: string };

/** Thrown when Install / refresh would overwrite an unreadable settings file. */
export class UnreadableSettingsError extends Error {
  constructor(
    readonly path: string,
    detail?: string,
  ) {
    super(
      detail ??
        `Settings file is not valid JSON: ${path}. Fix or remove it before installing Silo's session hook.`,
    );
    this.name = "UnreadableSettingsError";
  }
}

/** Pure parse of settings text. `null` text means the file was missing. */
export function parseSettingsJsonText<T extends object>(
  text: string | null,
  path: string,
): SettingsJsonRead<T> {
  if (text == null) return { kind: "missing" };
  try {
    const parsed: unknown = JSON.parse(text);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return {
        kind: "invalid",
        message: new UnreadableSettingsError(
          path,
          `Settings file is not a JSON object: ${path}. Fix or remove it before installing Silo's session hook.`,
        ).message,
      };
    }
    return { kind: "ok", value: parsed as T };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      kind: "invalid",
      message: new UnreadableSettingsError(
        path,
        `Settings file is not valid JSON (${detail}): ${path}. Fix or remove it before installing Silo's session hook.`,
      ).message,
    };
  }
}

/**
 * Value to merge into when writing. Missing → empty object. Invalid → throw
 * so callers never clobber the on-disk file.
 */
export function writableSettingsOrThrow<T extends object>(
  read: SettingsJsonRead<T>,
  path: string,
): T {
  if (read.kind === "missing") return {} as T;
  if (read.kind === "ok") return read.value;
  throw new UnreadableSettingsError(path, read.message);
}
