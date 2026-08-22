/**
 * Pure logic for installing/uninstalling Silo's session hook into pi, whose
 * hooks are **TypeScript extensions**, not shell commands in a config file
 * (ADR 0041).
 *
 * That makes this the simplest installer of the four and the one with the
 * highest bar: there is no schema to merge, just a Silo-owned file at
 * `~/.pi/agent/extensions/silo-track-session.ts` — created wholesale on
 * install, deleted on uninstall, exactly like Copilot's dedicated hooks file.
 * Nothing else in pi's config is read or written, so a user's own extensions
 * (and the `extensions`/`packages` lists in `~/.pi/agent/settings.json`) are
 * never touched: pi auto-discovers every `*.ts` in that directory, so no
 * registration step is needed.
 *
 * The file's *contents* come from the catalog
 * (`buildPiExtensionSource()`) — this module only decides whether a given
 * text is Silo's and what to write.
 */

export interface PiExtensionInstallSpec {
  /** Marker embedded in the extension source, used to recognize Silo's file. */
  marker: string;
}

/**
 * Whether the text at pi's extension path is Silo's own hook.
 *
 * Keyed on the marker rather than on an exact source match so that a file
 * written by an older Silo version still reads as installed — drift-refresh
 * is what brings it up to date, and a version skew should not present as
 * "not installed" and tempt the user into a redundant install.
 */
export function isPiExtensionInstalled(
  text: string | null | undefined,
  spec: PiExtensionInstallSpec,
): boolean {
  return typeof text === "string" && text.includes(spec.marker);
}

/**
 * Whether an existing file should be rewritten to match the current source.
 *
 * Only true for a file that is already Silo's: a path collision with a file
 * we don't own is reported by {@link isForeignPiExtension} instead of being
 * silently overwritten.
 */
export function needsPiExtensionRefresh(
  existing: string | null | undefined,
  next: string,
  spec: PiExtensionInstallSpec,
): boolean {
  if (existing == null) return false;
  if (!isPiExtensionInstalled(existing, spec)) return false;
  return existing !== next;
}

/**
 * Whether something that isn't Silo's extension already occupies the path.
 *
 * Writing an arbitrary file into a user's agent config would be bad enough;
 * silently *replacing* one they wrote themselves is worse. Install refuses in
 * this case and the settings page surfaces the error.
 */
export function isForeignPiExtension(
  existing: string | null | undefined,
  spec: PiExtensionInstallSpec,
): boolean {
  return existing != null && !isPiExtensionInstalled(existing, spec);
}
