---
status: accepted
date: 2026-07-21
---

# 0027. Unified terminal link policy: modifier-click to open, right-click to select

## Context

Terminals in Silo render links from three independent mechanisms that had each
grown their own — or no — activation behavior:

1. xterm's native OSC-8 hyperlink handler, which fires for the protocol-level
   hyperlinks CLIs like Claude Code emit (visible text can differ from the
   actual URI, e.g. "Learn more").
2. `WebLinksAddon`, which regex-detects bare URLs typed as plain text.
3. Silo's own file-path link provider (`terminal-links.ts`), which
   regex-detects path-like spans and opens them in the editor.

A recent bug report showed why "each provider does its own thing" is fragile:
xterm's built-in OSC-8 fallback opens links via `window.open()`, which the
Tauri webview doesn't hand off to the OS the way a real browser does — so
Claude Code's links silently stopped opening on click or Cmd-click, and only
right-click (native context menu → "Open") still worked. The fix was to give
xterm a custom `linkHandler` that routes through `ctx.ui.openExternal` (the
same Tauri-shell opener already used by menu items and extensions).

That fix only covered the OSC-8 path. `WebLinksAddon` had the same
`window.open()` problem and no modifier gating (any click activated it); the
file-path provider had its own independently-written modifier check and no
hover/tooltip or right-click behavior at all. Fixing one provider without a
shared contract just relocates the next drift — the bug class here is
"behavior specified per-provider" itself, not any single provider's code.

## Decision

Every link in every terminal — regardless of which of the three mechanisms
found it — follows the same contract, enforced by one shared, pure policy
module (`terminal-link-policy.ts`) that all three providers call into for the
modifier check, tooltip text, and context-menu labels:

- **Activation**: Cmd+click on macOS / Ctrl+click on Windows & Linux opens the
  link — URLs via `ctx.ui.openExternal` (system browser), paths via the
  editor (`ctx.editors.open`). A plain click is a no-op for navigation; it
  doesn't suppress the terminal's normal text-selection/cursor behavior.
- **Right-click**: landing directly on a link always selects its full
  underlined span (`Terminal.select`) and shows the context menu with
  link-specific actions ("Open Link"/"Open File", "Copy Link"/"Copy Path")
  prepended to the terminal's generic menu (Copy, Paste, Select All, …). This
  is true even when the `pasteOnRightClick` setting is on — landing on a
  specific, unambiguous target overrides the blanket paste-on-right-click
  behavior.
- **Hover**: any hover (no modifier needed) shows a tooltip naming the action
  and the modifier, e.g. `Open link (⌘ + click)` / `Open file (⌘ + click)`.

## Consequences

- Consistent, predictable link behavior across Claude Code's OSC-8 links,
  plain-text URLs, and file paths — the thing the original bug report asked
  for.
- One place (`terminal-link-policy.ts`) to change the modifier, wording, or
  add a link kind later, instead of three.
- `WebLinksAddon` reports hover position in viewport-relative, 0-based
  coordinates while the OSC-8 handler and the file-path provider use
  buffer-absolute, 1-based coordinates; `TerminalPanel.tsx` normalizes the
  former into the latter so right-click "select the link" behaves identically
  regardless of source.
- Establishes the extension point for two pieces of **future work, not built
  now**: (a) user-configurable link-activation behavior (modifier choice,
  click-to-open, etc.) — the policy module is where that would plug in; (b)
  letting extensions contribute their own context-menu entries on links
  (e.g. a `local-web-viewer`-style extension adding "Open in local web
  viewer..."), which needs its own permission/ordering design and is out of
  scope here.

## Alternatives considered

- **Keep fixing providers independently** — rejected: this is exactly the
  pattern that produced the original regression and the inconsistency, and
  would keep producing it.
- **Build user-configurability now** (a settings field for modifier/behavior)
  — deferred: no concrete requirement yet beyond "we'll want this later";
  adding an unused settings field ahead of a real UI for it doesn't earn its
  keep today.
- **Design the extension-contributed-menu-item API now** — deferred: doing it
  well needs its own design pass (trust/permission model, ordering against
  built-in items); noted as future work instead of scoped into this fix.

## References

- `packages/extensions-core/src/terminal/terminal-link-policy.ts` — the
  shared policy.
- `packages/extensions-core/src/terminal/terminal-links.ts` — file-path link
  provider.
- `packages/extensions-core/src/terminal/TerminalPanel.tsx` — xterm wiring
  (OSC-8 `linkHandler`, `WebLinksAddon`, right-click menu, tooltip).
- [0011](./0011-editor-and-terminal-are-core.md) — terminal is a core surface.
