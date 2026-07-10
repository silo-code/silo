// Pure list logic for the Extensions page — search + the built-in visibility
// filter — factored out of the component so the rules are unit-testable (the
// component stays thin glue). See ExtensionsPage.tsx.

import type {
  InstalledExtension,
  InstallSource,
} from "@silo-code/extension-host/internal";

export interface ExtensionsFilter {
  /** Free-text search; matched against name, id, publisher, and description. */
  query: string;
  /** When false, first-party built-ins are hidden (third-party only). */
  showBuiltins: boolean;
}

/** Filter the merged extension list by search query and the built-in toggle. */
export function filterExtensions(
  extensions: readonly InstalledExtension[],
  { query, showBuiltins }: ExtensionsFilter,
): InstalledExtension[] {
  const q = query.trim().toLowerCase();
  return extensions.filter((e) => {
    if (!showBuiltins && e.builtin) return false;
    if (!q) return true;
    return (
      e.name.toLowerCase().includes(q) ||
      e.id.toLowerCase().includes(q) ||
      e.publisher.toLowerCase().includes(q) ||
      (e.description?.toLowerCase().includes(q) ?? false)
    );
  });
}

/** Whether the list contains any built-in rows (gates showing the toggle). */
export function hasBuiltins(
  extensions: readonly InstalledExtension[],
): boolean {
  return extensions.some((e) => e.builtin);
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
 * /path/to/ext` or `URL: https://example.com/ext.tgz`. `undefined` for
 * built-ins and legacy records with no recorded source — the row hides the
 * line entirely rather than showing a label with nothing after it.
 */
export function describeSource(
  source: InstallSource | undefined,
): string | undefined {
  if (!source) return undefined;
  const label = { folder: "Folder", url: "URL", npm: "npm" }[source.kind];
  return `${label}: ${source.value}`;
}
