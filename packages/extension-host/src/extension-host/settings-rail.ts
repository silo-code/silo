import type { PhosphorIconName, SettingsPage } from "@silo-code/sdk";
import { EXTENSIONS_SETTINGS_GROUP } from "./settings-pages";

// The Settings rail: how the registered settings pages become an icon list
// split into two sections.
//
// The rail asks one coarse question — **is this Silo, or is this something
// installed?** That's two sections, always, which is what lets each one carry a
// heading rather than the divider-per-`group` the previous rail drew (whose
// shape followed however many groups happened to be registered).
//
// Everything here is pure so the split and the icon mapping can be tested
// without a DOM. The rendering half lives in components/SettingsSheet.tsx.

/** One headed group in the sheet's rail. */
export interface RailSection {
  key: "application" | "extensions";
  /** Heading shown above the section. */
  label: string;
  pages: SettingsPage[];
}

/**
 * Icon per known settings page. A local map rather than a field on
 * {@link SettingsPage}, so contributed pages can't name their own yet: adding
 * `icon?: PhosphorIconName` to the public type is the real answer, and it's a
 * deliberate deferral rather than an oversight. Same call as the Extensions
 * catalog's own icon map (`extension-icons.ts`).
 */
const PAGE_ICONS = new Map<string, PhosphorIconName>(
  Object.entries({
    keybindings: "Keyboard",
    editor: "Code",
    terminal: "TerminalWindow",
    layout: "Layout",
    agents: "Robot",
    about: "Info",
    extensions: "PuzzlePiece",
  }),
);

/**
 * Stand-in for any page this build doesn't know by id — every third-party
 * settings page, today. Neutral on purpose: a wrong-but-specific glyph reads as
 * a bug, while a parcel reads as "something installed, unlabelled".
 */
export const PLACEHOLDER_ICON: PhosphorIconName = "Package";

/** The rail glyph for a page — its own, or the placeholder. */
export function railIconFor(page: SettingsPage): PhosphorIconName {
  // A `Map`, not a plain object: `obj[id]` on a page id of "toString" would
  // resolve to an inherited `Object.prototype` member — truthy, so the `??`
  // wouldn't fire and a function would be returned where a name is expected.
  return PAGE_ICONS.get(page.id) ?? PLACEHOLDER_ICON;
}

/**
 * Order pages the way the rail lists them: by group, then by explicit order,
 * then alphabetically. `group` is still the registration-level ordering key
 * even though the rail no longer draws a divider per group — it's what decides
 * the sequence inside a section.
 */
export function sortSettingsPages(pages: SettingsPage[]): SettingsPage[] {
  return [...pages].sort((a, b) => {
    const g = (a.group ?? "").localeCompare(b.group ?? "");
    if (g !== 0) return g;
    const o = (a.order ?? 0) - (b.order ?? 0);
    return o !== 0 ? o : a.title.localeCompare(b.title);
  });
}

/**
 * Pages that head the Application section, in this order, ahead of whatever the
 * natural sort produces — the ones you reach for often enough that hunting for
 * them in a `group`-ordered list is the wrong ergonomics.
 *
 * Expressed here rather than by changing each page's registered `group`/`order`
 * so the ordering the rail wants stays a rail concern — the registrations are a
 * contribution point several extensions write to, and bending them to one
 * surface's layout would put presentation in the wrong place.
 *
 * `extensions` is also the one page filed under
 * {@link EXTENSIONS_SETTINGS_GROUP} that didn't come from an extension — it's
 * Silo's own browse/install surface, filed there so it sorts above the pages it
 * manages. Leading Application is the rail's reading of it.
 */
const RAIL_LEAD_PAGE_IDS = ["extensions", "agents", "layout"];

/**
 * Split the registered pages into the rail's two headed sections: everything
 * Silo ships, then everything that arrived with an extension. A section with no
 * pages is omitted rather than rendered as an empty heading.
 */
export function railSections(pages: SettingsPage[]): RailSection[] {
  const sorted = sortSettingsPages(pages);
  const isLead = (p: SettingsPage) => RAIL_LEAD_PAGE_IDS.includes(p.id);

  // Lead pages in the order this module names them, skipping any that aren't
  // registered in this build.
  const lead = RAIL_LEAD_PAGE_IDS.map((id) =>
    sorted.find((p) => p.id === id),
  ).filter((p): p is SettingsPage => p != null);

  // The host forces every non-core page into this group (see `createContext`'s
  // `registerSettingsPage`), so membership is the same question as "did this
  // come from an extension?" — no need to re-derive it from the page id.
  const contributed = sorted.filter(
    (p) => p.group === EXTENSIONS_SETTINGS_GROUP && !isLead(p),
  );
  const rest = sorted.filter(
    (p) => p.group !== EXTENSIONS_SETTINGS_GROUP && !isLead(p),
  );

  const sections: RailSection[] = [];
  if (lead.length + rest.length > 0)
    sections.push({
      key: "application",
      label: "Application",
      pages: [...lead, ...rest],
    });
  if (contributed.length > 0)
    sections.push({
      key: "extensions",
      label: "Extensions",
      pages: contributed,
    });
  return sections;
}

/**
 * The page the sheet should show: the selected one if it still exists, else the
 * first in the rail. `null` only when nothing is registered at all.
 */
export function resolveActivePage(
  sections: RailSection[],
  pageId: string | null,
): SettingsPage | null {
  const all = sections.flatMap((s) => s.pages);
  return all.find((p) => p.id === pageId) ?? all[0] ?? null;
}
