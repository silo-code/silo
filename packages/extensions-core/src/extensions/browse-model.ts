// Pure logic for the registry Browse view — search/category filtering and the
// installed/update state of a registry entry — factored out of the component
// so the rules are unit-testable (see extensions-list-model.ts for the same
// pattern on the Installed view).

import type {
  InstalledExtension,
  RegistryExtension,
  RegistryUpdate,
} from "@silo-code/extension-host/internal";

/**
 * The publisher shown on a catalog card, taken from the id's namespace
 * (`acme.linter` → `Acme`). Registry entries carry no publisher field of their
 * own — unlike an installed extension, whose manifest has one — so the id is
 * the only place the name exists. `null` for an unnamespaced id rather than
 * a made-up one.
 */
export function publisherOf(id: string): string | null {
  const dot = id.indexOf(".");
  if (dot <= 0) return null;
  const publisher = id.slice(0, dot);
  return publisher[0].toUpperCase() + publisher.slice(1);
}

export interface BrowseFilter {
  /** Free-text search; matched against id, description, and categories. */
  query: string;
  /** Category facet; empty string = all. */
  category: string;
}

/** Filter registry entries by search text and category facet. */
export function filterRegistry(
  entries: readonly RegistryExtension[],
  { query, category }: BrowseFilter,
): RegistryExtension[] {
  const q = query.trim().toLowerCase();
  return entries.filter((e) => {
    if (e.status === "removed") return false;
    if (category && !e.categories.includes(category)) return false;
    if (!q) return true;
    return (
      e.id.toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q) ||
      e.categories.some((c) => c.includes(q))
    );
  });
}

/** Sorted unique categories present in the catalog (drives the facet chips). */
export function registryCategories(
  entries: readonly RegistryExtension[],
): string[] {
  return [...new Set(entries.flatMap((e) => e.categories))].sort();
}

/** How a registry entry relates to this install of Silo. */
export type BrowseInstallState =
  | "not-installed"
  | "installed"
  | "update-available";

export function browseInstallState(
  entry: Pick<RegistryExtension, "id">,
  installed: readonly InstalledExtension[],
  updates: readonly RegistryUpdate[],
): BrowseInstallState {
  if (updates.some((u) => u.id === entry.id)) return "update-available";
  if (installed.some((e) => e.id === entry.id)) return "installed";
  return "not-installed";
}

/**
 * Whether the Install action is offered: there must be a published release,
 * and a `removed` entry is filtered out before this is asked. `unavailable`
 * stays installable — the tarball may still resolve (or a mirror exists), and
 * the manager surfaces a clear error if not.
 */
export function isInstallable(
  entry: Pick<RegistryExtension, "latest">,
): boolean {
  return entry.latest !== null;
}
