import type { ComponentType } from "react";
import {
  Article,
  Browsers,
  Cards,
  CloudArrowDown,
  Code,
  Command,
  Compass,
  Folder,
  Gear,
  GitBranch,
  GitCommit,
  Image,
  Info,
  Keyboard,
  Layout,
  ListBullets,
  MagnifyingGlass,
  MarkdownLogo,
  Palette,
  PuzzlePiece,
  Robot,
  SidebarSimple,
  Swatches,
  TerminalWindow,
  type IconProps,
} from "@phosphor-icons/react";

// PROTOTYPE — icons for the **bundled** extensions only.
//
// Deliberately a host-side map keyed by id rather than a manifest field:
// letting third-party extensions declare an icon means threading it through the
// registry index (an external repo, with a schemaVersion bump) before Browse
// could ever show one, and that's a separate project. Silo's own extensions
// need none of that — their ids are known at build time — so this gets the
// catalog looking finished without committing the manifest schema to anything.
//
// Mapping to the icon *components* rather than to Phosphor name strings keeps
// this type-checked (a typo won't compile) and lets the bundler drop the ~1200
// icons nothing references. If `silo.icon` lands later it'll carry names
// instead, and resolving those is the point at which a lookup helper earns its
// place — not before.

/** A bundled extension's tile: which glyph, on which fill. */
export interface ExtensionIconSpec {
  glyph: ComponentType<IconProps>;
  /** Solid tile fill; the glyph is drawn white on top of it. */
  tint: string;
}

/**
 * The tile palette. Fixed hexes rather than design tokens, deliberately: a tile
 * is *identity*, the way a logo is, so it should look the same in light and dark
 * rather than re-deriving per theme. Every value is mid-saturation enough to
 * carry a white glyph at contrast in either.
 *
 * A closed palette rather than a free color per extension — reusing hues across
 * related extensions is what keeps the grid reading as one product instead of a
 * bag of stickers.
 */
const TINT = {
  indigo: "#4f46e5",
  blue: "#2563eb",
  cyan: "#0891b2",
  teal: "#0d9488",
  green: "#16a34a",
  amber: "#d97706",
  orange: "#ea580c",
  rose: "#e11d48",
  purple: "#7c3aed",
  slate: "#475569",
} as const;

function spec(
  glyph: ComponentType<IconProps>,
  tint: string,
): ExtensionIconSpec {
  return { glyph, tint };
}

/**
 * Glyph + tile fill per bundled extension id. Anything absent — every
 * third-party extension, today — falls back to the placeholder in
 * `ExtensionCard`.
 *
 * The glyph says what the extension *does* rather than which tier it's in: two
 * extensions that both "manage panels" are only worth distinguishing if their
 * icons differ, so the Navigator gets a compass and Layout gets a layout. The
 * tint groups by domain instead — every git surface orange, every file surface
 * amber — so color carries family and the glyph carries identity.
 */
const BUILTIN_ICONS = new Map<string, ExtensionIconSpec>(
  Object.entries({
    // Core — the workbench itself.
    "core.about": spec(Info, TINT.slate),
    "core.agents-settings": spec(Robot, TINT.teal),
    "core.cli-install": spec(Command, TINT.slate),
    "core.editor": spec(Code, TINT.indigo),
    "core.extensions": spec(PuzzlePiece, TINT.purple),
    "core.keybindings": spec(Keyboard, TINT.slate),
    "core.layout": spec(Layout, TINT.blue),
    "core.menu": spec(ListBullets, TINT.slate),
    "core.navigator": spec(Compass, TINT.blue),
    "core.output": spec(Article, TINT.slate),
    "core.panel-toggles": spec(SidebarSimple, TINT.blue),
    "core.settings-button": spec(Gear, TINT.slate),
    "core.sheet-lab": spec(Browsers, TINT.purple),
    "core.terminal": spec(TerminalWindow, TINT.green),
    "core.themes": spec(Palette, TINT.purple),
    "core.updates": spec(CloudArrowDown, TINT.cyan),
    "core.workspaces": spec(Cards, TINT.indigo),

    // Silo — first-party features built as extensions.
    "silo.file-explorer": spec(Folder, TINT.amber),
    "silo.file-search": spec(MagnifyingGlass, TINT.amber),
    "silo.git": spec(GitCommit, TINT.orange),
    "silo.git-explorer": spec(GitBranch, TINT.orange),
    "silo.image-viewer": spec(Image, TINT.rose),
    "silo.markdown-preview": spec(MarkdownLogo, TINT.blue),
    "silo.theme-presets": spec(Swatches, TINT.purple),
  }),
);

/**
 * The tile for an extension, or `null` when Silo doesn't ship one for it —
 * which is every extension the user installed themselves.
 */
export function extensionIconFor(id: string): ExtensionIconSpec | null {
  // A `Map`, not a plain object: bare `obj[id]` would resolve an id of
  // "toString" or "constructor" to an inherited `Object.prototype` member,
  // which is truthy — so `?? null` wouldn't fire and the card would try to
  // render `Object.prototype.toString` as a component.
  return BUILTIN_ICONS.get(id) ?? null;
}

/** Ids this build ships an icon for — for tests and coverage checks. */
export function iconedExtensionIds(): string[] {
  return [...BUILTIN_ICONS.keys()];
}
