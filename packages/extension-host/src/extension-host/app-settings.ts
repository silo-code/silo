// Host seam for app-wide UI settings the menu drives — currently just the UI
// font scale (zoom). Surfaced to `core.menu` through `@silo-code/extension-host/internal`,
// mirroring the editor-core / terminal-core seams, so the extension reaches it
// through the gated barrel rather than `state/store` directly.
//
// This is core-only **by design**, not a stopgap: UI-font scale is app-shell
// chrome driven by `core.menu`, and no `silo.*`/third-party extension needs to
// set it — so `@silo-code/extension-host/internal` is its correct permanent home (public-first
// rule, ctx-domains.md → "Extension trust tiers"). A public `ctx.settings` is
// deferred until a real public consumer exists (a `silo.*`/third-party extension
// wanting its own user config); we don't expand the `ctx` surface ahead of a
// requirement.

export { bumpUiFontSize, resetUiFontSize } from "../state/store";
