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

| Need                                   | Component                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Action buttons                         | `Button` (`variant`: default/primary/danger)                                                                                                                                                                                                                                                                                      |
| Icon-only action                       | `IconButton` + `Tooltip` (label alone isn't enough for sighted users)                                                                                                                                                                                                                                                             |
| Button that opens a menu               | `MenuButton` (labelled + chevron) — see below                                                                                                                                                                                                                                                                                     |
| Text field                             | `Input`, `Textarea`                                                                                                                                                                                                                                                                                                               |
| Label above one field / group          | `Section` (`label` prop — the uppercase `NAME`/`FOLDERS` header; the only place uppercase is allowed, per typography.md). One `Section` per field, `Input`/`Select` + any hint as its children. **Not** a hand-rolled `<label>` or the undocumented `.silo-modal-label` class (a few older git dialogs use it — don't copy them). |
| Label + control on one row             | `SettingRow` (horizontal: label/hint left, control right)                                                                                                                                                                                                                                                                         |
| Filter-as-you-type over a list         | `SearchInput` + `List` (compose them — no combined `FilterList`)                                                                                                                                                                                                                                                                  |
| Click-to-edit a value in place         | `InlineEdit`                                                                                                                                                                                                                                                                                                                      |
| On/off, pick-one-of-few                | `Switch`, `Select`, `CheckboxRow`, `RadioGroup`. When the options need icons or checks, `MenuButton variant="field"` + `ctx.ui.showMenu` (a native `<select>` can't render either).                                                                                                                                               |
| Switch between views                   | `Tabs`, `SegmentedTabs`                                                                                                                                                                                                                                                                                                           |
| Rows of selectable things              | `List` / `ListRow`, `AddRow`                                                                                                                                                                                                                                                                                                      |
| Status/identity pill                   | `Badge` (`tone`: `ok`/`warn`/`err`/`accent`/`neutral`; `size`: `md` default / `sm` for counters)                                                                                                                                                                                                                                  |
| "Nothing here" / explanatory copy      | `EmptyState`, `Callout`                                                                                                                                                                                                                                                                                                           |
| Footer actions, scroll areas           | `ModalActions`, `.silo-scroll`                                                                                                                                                                                                                                                                                                    |
| Sub-settings gated on a sibling toggle | `SettingRow`'s `enabled`/`dependent` props — never a hand-rolled nested row                                                                                                                                                                                                                                                       |

All exported from `@silo-code/sdk`. Full prop reference:
[Design System → Components](https://getsilo.dev/design/#the-component-inventory).

### `MenuButton` vs. a `⋮` `IconButton`

Both open a menu; they differ in who is expected to find it.

- **`MenuButton`** — a label plus a chevron. Use it when the menu is somewhere
  a user is _meant_ to go: the actions behind it are part of the job, not an
  escape hatch. A bare `⋮` is discoverable only by people who already know to
  look, so anything a first-time user needs belongs behind a labelled trigger.
- **`IconButton`** (with `⋮` and a `Tooltip`) — for dense rows and toolbars
  where a label genuinely won't fit, and the actions are secondary.

Neither owns the menu. Open one from `onClick` with `ctx.ui.showMenu`,
anchoring `at: e.currentTarget` so it lines up under the trigger.

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
  `neutral` are the only tones — closest fit wins, not a new tint. Prefer
  `Badge size="sm"` for section/workspace counts; both sizes are absolute
  chrome tokens (not surrounding `em`) so they stay consistent across panes.
- **Don't build a settings rail, tab strip, or page title inside a settings
  page or property tab.** That chrome is host-owned; your component is the
  body content only.
- **Don't hand-roll a nested "only while a sibling toggle is on" row** (a raw
  `.silo-setting-row` div with a manually-indented sub-control, manually
  threading `disabled` into each child). Use `SettingRow`'s `enabled`/
  `dependent` props — the fieldset auto-disables and dims for you.

## Stability gate

Before depending on any of the above, confirm it shows **stable** (not
`experimental`) on the [Roadmap](https://getsilo.dev/roadmap) — same rule as
every other `ctx` surface.
