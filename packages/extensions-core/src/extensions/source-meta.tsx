// Presentation lookups for an install source, shared by the Extensions list,
// the Browse rows, and the detail callout so the icon and wording stay in sync.

import { Folder, LinkSimple, Package, Storefront } from "@phosphor-icons/react";
import type { InstallSource } from "@silo-code/extension-host/internal";

// The label prefix ("Folder: ", "URL: ", …) is redundant once the kind is
// legible at a glance — an icon says the same thing in less width, leaving
// more room for the (often long) path/URL/id itself.
export const SOURCE_ICON: Record<InstallSource["kind"], typeof Folder> = {
  folder: Folder,
  url: LinkSimple,
  npm: Package,
  registry: Storefront,
};

/** Short origin word for a source, e.g. "a folder", "a URL" — reads inline as
 *  "Installed from {…}". */
export function sourceOriginLabel(kind: InstallSource["kind"]): string {
  return {
    folder: "a folder",
    url: "a URL",
    npm: "npm",
    registry: "the registry",
  }[kind];
}

/**
 * Origin as a standalone noun phrase, for a badge. Separate from
 * {@link sourceOriginLabel} because that one is a sentence fragment: "a folder"
 * only works after "Installed from", and reads as a typo on its own in a pill.
 */
export function sourceBadgeLabel(kind: InstallSource["kind"]): string {
  return {
    folder: "Folder Install",
    url: "URL Install",
    npm: "npm Install",
    registry: "Registry Install",
  }[kind];
}
