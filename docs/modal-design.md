# Modal & extension UI design

Checklist for building modal content, settings pages, or workspace property
tabs. Model: `apps/docs/guide/extension-checklist.md`. Full narrative docs are
the [Design System](https://getsilo.dev/design/) site
(`apps/docs/design/`); this file is the terse decision table for an agent
mid-task, not a replacement for reading it.

Applies to **building Silo too**, not just third-party extensions: the kit has
one source (`@silo-code/sdk`) that the host and bundled `core.*`/`silo.*`
extensions consume directly — same components, same rules. Only host **chrome**
(the modal shell, Settings rail, status-bar container, panels, title bar) stays
bespoke; everything below is the content you put inside it. See ADR 0026's chrome
line.

## Which surface

- Transient task the user completes and leaves → **standalone modal**
  (`ctx.ui.showModal`).
- How the extension behaves everywhere → **settings page**
  (`ctx.registerSettingsPage`).
- How the extension behaves _for this workspace_ → **workspace property tab**
  (`ctx.workspaces.registerPropertyPage`).

Settings pages and property tabs persist **immediately** (no footer, no Save).
Standalone modals persist **explicitly** (`ModalActions` with Cancel + one
primary action).

## Need X → use component Y

| Need                                 | Component                                                             |
| ------------------------------------ | --------------------------------------------------------------------- |
| Action buttons                       | `Button` (`variant`: default/primary/danger)                          |
| Icon-only action                     | `IconButton` + `Tooltip` (label alone isn't enough for sighted users) |
| Text field                           | `Input`, `Textarea`                                                   |
| Filter-as-you-type over a list       | `SearchInput` + `List` (compose them — no combined `FilterList`)      |
| Click-to-edit a value in place       | `InlineEdit`                                                          |
| On/off, pick-one-of-few              | `Switch`, `Select`, `CheckboxRow`, `RadioGroup`                       |
| Switch between views                 | `Tabs`, `SegmentedTabs`                                               |
| Rows of selectable things            | `List` / `ListRow`, `AddRow`                                          |
| Status/identity pill                 | `Badge` (`tone`: `ok`/`warn`/`err`/`accent`/`neutral`)                |
| "Nothing here" / explanatory copy    | `EmptyState`, `Callout`                                               |
| Group settings, footer, scroll areas | `Section`, `SettingRow`, `ModalActions`, `.silo-scroll`               |

All exported from `@silo-code/sdk`. Full prop reference:
[Design System → Components](https://getsilo.dev/design/#the-component-inventory).

## The class contract (host-styled, don't restyle)

Every component above renders `.silo-*` classes the **host** styles via CSS
custom properties (`--silo-color-*`, `--silo-font*`, `--silo-radius-*`,
`--silo-button-*`). A color/spacing restyle ships in a Silo app update and
applies automatically — your extension never bundles this CSS.

## Forbidden

- **Don't restyle a kit component locally** (override its `.silo-*` classes,
  wrap it to force different padding/colors). Freezes today's look, breaks
  the automatic-restyle contract. If it can't do what you need, that's a gap
  to report, not CSS to write.
- **Don't hand-roll focus styles.** One shared `:focus-visible` ring covers
  every interactive element; a local `:focus` rule stacks a second ring on
  top of it.
- **Don't intercept Escape or attach key handlers to `List`.** Keyboard
  behavior (roving tabindex, Escape-to-close, `InlineEdit`'s two-stage
  Escape) is built in and coordinated with the host shell.
- **Don't build your own modal title, close button, or footer flex row.**
  `showModal`'s `title` option is the heading; the ✕ and Escape are
  host-owned; `ModalActions` (with its `start` slot) is the only footer.
- **Don't invent a badge/status color.** `ok` / `warn` / `err` / `accent` /
  `neutral` are the only tones — closest fit wins, not a new tint.
- **Don't build a settings rail, tab strip, or page title inside a settings
  page or property tab.** That chrome is host-owned; your component is the
  body content only.

## Stability gate

Before depending on any of the above, confirm it shows **stable** (not
`experimental`) on the [Roadmap](https://getsilo.dev/roadmap) — same rule as
every other `ctx` surface.
