// Pure list logic for the Extensions page — search and the built-in split —
// factored out of the component so the rules are unit-testable (the component
// stays thin glue). See ExtensionsPage.tsx.

import type {
  InstalledExtension,
  InstallSource,
} from "@silo-code/extension-host/internal";

export interface ExtensionsFilter {
  /** Free-text search; matched against name, id, publisher, and description. */
  query: string;
}

/** Filter the merged extension list by search query. */
export function filterExtensions(
  extensions: readonly InstalledExtension[],
  { query }: ExtensionsFilter,
): InstalledExtension[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...extensions];
  return extensions.filter(
    (e) =>
      e.name.toLowerCase().includes(q) ||
      e.id.toLowerCase().includes(q) ||
      e.publisher.toLowerCase().includes(q) ||
      (e.description?.toLowerCase().includes(q) ?? false),
  );
}

/**
 * Split the list into what the user installed and what ships with Silo, in
 * that order.
 *
 * Built-ins used to be hidden behind a "Show built-in" toggle, which made a
 * chunk of what's actually running invisible unless you knew to go looking —
 * and left the page unable to answer "what's installed?" without a setting
 * change. They're always listed now, under their own heading, so the answer is
 * complete and the distinction is still obvious.
 */
export function partitionBuiltins(extensions: readonly InstalledExtension[]): {
  installed: InstalledExtension[];
  builtin: InstalledExtension[];
} {
  return {
    installed: extensions.filter((e) => !e.builtin),
    builtin: extensions.filter((e) => e.builtin),
  };
}

/**
 * Whether to surface the "reload to finish disabling" hint for a row: only once
 * it's disabled but contributed something (a dock panel kind) that can't be
 * unmounted from an already-mounted dock.
 */
export function showsReloadHint(ext: InstalledExtension): boolean {
  return !ext.enabled && ext.reloadRequired === true;
}

/**
 * Whether to offer the Update action: third-party rows whose install source was
 * recorded. Records from before source tracking have nothing to re-fetch from,
 * so the action is hidden until a one-time reinstall records it.
 */
export function showsUpdateAction(ext: InstalledExtension): boolean {
  return !ext.builtin && ext.source !== undefined;
}

/**
 * Human-readable "where this came from" line for a row, e.g. `Folder:
 * /path/to/ext` or `Registry: acme.weather`. `undefined` for built-ins and
 * legacy records with no recorded source — the row hides the line entirely
 * rather than showing a label with nothing after it.
 */
export function describeSource(
  source: InstallSource | undefined,
): string | undefined {
  if (!source) return undefined;
  const label = {
    folder: "Folder",
    url: "URL",
    npm: "npm",
    registry: "Registry",
  }[source.kind];
  return `${label}: ${source.value}`;
}

/**
 * The install source when an extension came from somewhere other than the
 * registry (a folder, URL, or npm) — the case worth calling out explicitly,
 * because the registry download count then describes a different artifact than
 * the one installed. `null` for registry installs, built-ins, and legacy
 * source-less records (nothing reliable to surface).
 */
export function localInstallSource(
  ext: Pick<InstalledExtension, "source"> | undefined,
): InstallSource | null {
  const source = ext?.source;
  return source && source.kind !== "registry" ? source : null;
}
