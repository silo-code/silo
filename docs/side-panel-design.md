# Side panel & sheet UI design

Checklist for building **side panels** (`ctx.registerSidePanel`) and
**dock-anchored sheets** that grow out of them. Companion to
[`docs/modal-design.md`](./modal-design.md) — same kit components, different
chrome and navigation rules.

Narrative Design System pages live under `apps/docs/design/` (side panels are
still sparse there). This file is the terse decision table for an agent
mid-task. Iterate it whenever a panel build forces a styling/UX tweak so the
next panel doesn't rediscover the same rules.

Applies to building Silo too (`core.*` / `silo.*`), not just third-party
extensions. Kit components come from `@silo-code/sdk`. Host **chrome** (the
SideDock tab strip, sheet shell, Navigator) stays bespoke.

**Reference panels.** Three implementations are the canon this doc is
reverse-engineered from — when a rule here is ambiguous, match what they do:
Silo's built-in **git-explorer** (`packages/extensions-silo/src/git-explorer/`),
and the **skills-manager** and **`silo.tasks`** extensions in
`silo-code/silo-extensions`. Their list geometry (container inset, header/row
padding, the staircase) is deliberately byte-identical; keep it that way.

## Which surface

| Need                                                                     | Surface                                                                                                                                                                                                 |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Always-on inventory / tree for the active workspace                      | **Side panel**                                                                                                                                                                                          |
| Temporary browse / detail / install that needs more width than the panel | **Dock sheet** — `ctx.layout.openPanelSheet(panelId, render, opts)` (public SDK; prefer `mode: "push"`), or the internal `<Sheet anchor="dock">` for `core.*` chrome not anchored to a registered panel |
| App-wide modal settings or a one-shot decision                           | **Modal / settings** — see `docs/modal-design.md`                                                                                                                                                       |

A sheet is a **companion** to a panel, not a second panel. Don't put the
primary inventory only in a sheet.

## Typography (the #1 panel smell)

The host owns absolute size. Extensions inherit and step relatively.

At default `uiFontSize` (13px):

| Slot              | Host rule                                            | Computed |
| ----------------- | ---------------------------------------------------- | -------- |
| App / editor base | `--silo-font-size-base`                              | 13px     |
| Left side pane    | `--silo-internal-font-size-left-panel` = base + 1px  | 14px     |
| Right side pane   | `--silo-internal-font-size-right-panel` = base + 2px | 15px     |

Applied in `SideColumn.css` on `.side-pane[data-location]`. Files / Git / Search
**do not pin a root `font-size`** — they inherit the pane. Primary row labels
are `1em` (15px on the right); secondary lines use `calc(1em - 1px)` (14px) or
`calc(1em - 2px)` for denser chrome (file-tree roots).

| Role                       | Rule                                                                    |
| -------------------------- | ----------------------------------------------------------------------- |
| Panel root                 | `font-family: var(--silo-font-ui)` only — **no** root `font-size`       |
| Primary row / detail title | `font-size: 1em; font-weight: 500–600`                                  |
| Secondary line             | `font-size: calc(1em - 1px)` (→ 14px when pane is 15px)                 |
| Mono facts                 | `font-family: var(--silo-font-mono)` + secondary size unless emphasized |
| Section labels             | SDK `Section` (host uppercase chrome)                                   |
| Icons                      | Phosphor `size="1em"`                                                   |

**Kit `List` gotcha:** `.silo-list-row` is styled with
`font-size: var(--silo-font-size-sm)` (absolute — 12px at default), so a List
inside a right pane renders ~3px smaller than Files/Git trees. Until the kit
inherits, override in the panel:

```css
.my-panel .silo-list-row {
  font-size: 1em;
}
```

**Sheets** portal outside the pane, so they lose inheritance. Re-apply the
matching slot formula on the sheet body (right-dock companion →
`calc(var(--silo-font-size-base) + 2px)`), and pull `.silo-sheet-title` up to
`1em` under a sheet className so the header matches.

Avoid `--silo-font-size-sm` as a blanket secondary size in panels — it is an
absolute token off app base, not off the pane.

**`Badge` font-size never cascades.** Both sizes pin
`--silo-font-size-chrome` (`md` = chrome−1 + roomier pad, `sm` = chrome +
`0 5px` / `line-height: 1.5`). Do **not** use surrounding `em`. Details:
[Badges](../apps/docs/design/components/badges.md).

## Layout chrome

- **Toolbar** (filter + actions): actions row **above** the filter, trailing-
  aligned (`justify-content: flex-end`), then `SearchInput`. Pad
  `8px 10px` (chrome tier — see the horizontal-inset table below),
  bottom border `1px solid var(--silo-color-border)`, `flex-shrink: 0`. Match
  git `.git-root-actions` / `.branch-action`: **26×26** icon hits, `gap: 2px`,
  transparent + hover fill — not kit `Button size="sm"` (reads oversized next
  to Git).
- **Collapsed dropdown (the toolbar's filter / arrange / group control).** One
  shape everywhere:
  - Kit **`<MenuButton size="sm">`** (`@silo-code/sdk`) — the trigger only;
    open the menu from `onClick` with `ctx.ui.showMenu({ items, at:
e.currentTarget })`.
  - **Labelled by its current value** — the active filter / grouping itself
    (`"My PRs"`, `"Status"`, `"None"`), **never** a `"Filter:"` / `"Group:"`
    prefix. The value + trailing chevron already reads as "picker for X", and
    two prefixed labels eat a narrow toolbar.
  - **Font: `--silo-font-size-base`.** `size="sm"` ships
    `--silo-font-size-chrome`; override it back up so the label sits at the
    app base (13px) — a touch under the pane scale, reading as chrome. Do this
    with a one-line panel class (`.tasks-menu-btn`, `.ghpr-menu-btn`).
  - Everything else — padding `3px 6px 3px 10px`, transparent border, quiet
    `text-lo` chevron, `bg-hover` + `text-hi` on hover — comes from the host
    `.silo-menu-button-sm`; don't re-declare it.
  - Reference: `silo.tasks` `TasksToolbar` (arrange + filter). github-prs /
    github-issues hand-roll the identical geometry in CSS
    (`.ghpr-menu-btn` / `.ghi-menu-btn`) **only** because their published
    `@silo-code/sdk` predates `MenuButton` — swap to the component on the next
    SDK bump.
- **Toolbar → list gap:** the distance from the filter field to the first
  section header comes from the **toolbar's bottom pad alone** (`8px`) plus
  the header's own `4px` top pad — **~12px effective**. The scroll body's
  **top pad is `0`** and the section header carries **no `margin-top`**, so
  the first header sits close under the filter. Inter-group spacing lives on
  the list wrapper's `gap` (**`14px`**), which doesn't apply before the first
  group. Model: skills-manager `.skills-body` (`padding: 0 4px 16px;
gap: 14px`) + `.skills-section-head` (no margin). Don't add body top pad or a
  header `margin-top` to "space it out" — that stacks with the toolbar pad and
  the gap balloons (the bug tasks had: `8 + 8 + 6 + 4 ≈ 26px`).
- **Refresh (panel toolbar):** Phosphor **`ArrowsClockwise`** at **`size={14}`**
  inside the 26×26 hit — same glyph and scale as git’s multi-root header
  refresh (`GitHeaderActions size={14}`). Do **not** use single-arrow
  `ArrowClockwise` or `size={16}` / `1em` here.
- **Branded registry entry** (Skills → skills.sh): prefer a compact host
  wordmark (`skills.sh` mono + offset ghost) over a generic “Browse” + search
  icon — same language as the sheet title mark, density `toolbar`.
- **Scroll body**: `flex: 1; min-height: 0` plus the host **`.silo-scroll`**
  class on the overflow element — never let the toolbar scroll away with the
  list unless the design is intentionally single-scroll (rare).
- **Panel horizontal inset — two tiers, not one.** Chrome and the list sit at
  different edges on purpose; a flat single inset (every region at one
  `--pad-x`) makes the list "line up along the left" and reads worse. The
  reference model is git-explorer + skills-manager + `silo.tasks` — match
  those **to the pixel**:

  | Region                                                                            | Rule                                               | Lands at (from pane edge) |
  | --------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------- |
  | **Chrome** — toolbar, bottom-docked input, drill-in detail page, empty-state line | horizontal `10px`                                  | 10px                      |
  | List **scroll body** (the container)                                              | horizontal `4px` (`padding: 0 4px …`; **top `0`**) | 4px                       |
  | Group / section **header** (on the 4px body)                                      | `padding: 4px 8px`                                 | 12px                      |
  | List **row** (on the 4px body)                                                    | `padding: 4px 2px 4px 10px`, `gap: 4px`            | 14px left · ~6px right    |

  So the list is a gentle **staircase**: body 4 → header label 12 → row content
  14, with rows' right edge pulled tight (`2px`) so a trailing ⋮ / glyph sits
  near the edge, not in a second gutter. Put the inset on the leaf elements
  (rows, headers, toolbar content) and the `4px` on the scroll body — never a
  `--pad-x` on the scroll body _and_ the leaves, or it doubles.
  - `silo.tasks` keeps a `--tasks-pad-x: 10px` custom property for the **chrome**
    tier only; its list uses the literal `4px` / `4px 8px` / `4px 2px 4px 10px`
    above, byte-identical to skills / git.
  - Don't push the list past `~14px` or chrome past `~10px` — it wastes width
    in a narrow dock.

- **Group / section headers — the shared pattern.** Every list panel that
  buckets its rows uses the **same** header, the one skills-manager
  (`.skills-section-head`), git-explorer (`.section-head`) and `silo.tasks`
  (`.tasks-section-head`) now share verbatim. Bespoke, **not** kit `Section`
  (`.silo-section-header` has no padding, so its label won't sit on the list
  edge):

  ```
  <div class="…-section-head" role="button" tabindex="0" aria-expanded>
    <span class="…-section-chev">   ⟵ CaretDown / CaretRight @ 0.85em, width 12px, text-lo
    <span class="…-section-title">  ⟵ the label
    <span class="…-section-count">  ⟵ margin-left: auto; <Badge size="sm">{n}</Badge>
  ```

  - Head: `display:flex; align-items:center; gap:6px; width:100%;
padding: 4px 8px; text-transform:uppercase; letter-spacing:0.06em;
font-size: var(--silo-font-size-chrome); font-weight:600;
color: var(--silo-color-text-lo); border-radius: var(--silo-radius-sm);
cursor:pointer` (the `4px 8px` is the list-tier inset above — lands at
    12px on the `4px` body).
  - **The header is muted (`--silo-color-text-lo`), not full-strength text** —
    it must read _quieter_ than the rows it groups, not louder. It's already
    smaller and uppercase; keeping it at `--silo-color-text` + `600` made the
    bucket label out-shout its own contents. Matches agent-monitor's
    `.ap-section-title`.
  - Hover (it's a collapse toggle): `background: var(--silo-color-bg-hover);
color: var(--silo-color-text-hi)` — the one place it brightens.
  - The count is a `Badge size="sm"` pushed right with `margin-left:auto`,
    never inline right after the label.
  - **Collapsible by default.** The chevron toggles the section; persist the
    collapsed set (keyed by section id) in `ctx.storage` so it survives a
    restart, the way skills-manager does (`collapsedSections`).

- **Rows.** Kit `.silo-list-row` defaults to `6px 10px` and pins
  `--silo-font-size-sm` — override both in the panel (`font-size: 1em` +
  `padding: 4px 2px 4px 10px`). Bespoke rows (`div[role="button"]`, like
  `.tasks-row` / agent-monitor `.ap-row`) use the same padding directly. The
  tight `2px` right pad is deliberate — see the staircase table above.
- **Files / Git chrome** predates the `10px` chrome tier: `.git-panel` is a
  `4px` container with a `4 / 10 / 12`px internal staircase (`.git-root-actions`
  / `.commit-area` / `.git-file-row`). Its **list** (`.section-head` `4px 8px`,
  `.git-file-row` `…8px` → both 12px) already matches the table; only its
  toolbar/commit-box sit tighter than `10px`. Leave that alone when extending
  Git; don't copy the tighter chrome into a new panel.
- **Kit only for content**: `SearchInput`, `List`/`ListRow`, `Section`,
  `Badge`, `Button`, `IconButton`, `EmptyState`, `SegmentedTabs`, `Tooltip`.
  Panel chrome action rows may use bespoke 26px hits when matching Git.

## Scrollbars

Put **`.silo-scroll`** on every overflow container you own (panel body, sheet
list, detail page). It is a host class (not a React component) — same contract
as modals (`docs/modal-design.md`).

| Do                                                   | Don't                                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------------- |
| `className="… silo-scroll"` on the scrolling element | Hand-roll `::-webkit-scrollbar` rules in extension CSS                    |
| Let `.silo-scroll` own `overflow-y`                  | Pin only `overflow: auto` and inherit the app's thick outlined-pill thumb |
| Rely on the thin text-derived thumb (theme-safe)     | Use `--silo-color-border` / surface tokens for the thumb (fails in Light) |

Side-dock tab panes get a hover-reveal thin scrollbar from the host
(`.side-tab-host`). Sheets and nested scroll regions **do not** — they need
`.silo-scroll` explicitly. Model: git branch lists, Extensions grid, settings
pages.

## Drill-in / paging ("Back")

When a list row opens a detail view, treat it as a **page**, not an inset
panel under the list chrome.

**Do**

- Replace the list page entirely (unmount or cover search + tabs + list).
- Lead with a quiet accent **Back** control — `CaretLeft` + label `"Back"`,
  not a filled `Button`. Model: git commits takeover, Extensions detail,
  github-prs style.
- Name it **Back** (not "Back to list") — the drill-in may be reachable from
  more than one list.
- Put secondary tools (refresh, open external, ⋮) on the **same row** as
  Back, right-aligned.
- Put the primary action (`Install`, `Merge`, `Complete`, …) on the **title
  row**, right-aligned. Geometry + title spec: **Detail header** below.
- `Escape` pops one page when a drill-in is open; only closes the sheet/panel
  at the root page. **But** a mid-edit `InlineEdit` takes the first Escape —
  see **Detail header › Escape while editing**.
- Sheet title may update to the entity name while drilled in.

**Don't**

- Nest detail under persistent search / segmented tabs / "Showing N of M".
- Use a primary `Button` labeled "← Back to list".
- Leave the user with no full-width reading column for description / metadata.

Reference implementations in-repo:

- `packages/extensions-silo/src/git-explorer/CommitsTakeover.tsx` (+ `.git-takeover-*`)
- `packages/extensions-core/src/extensions/ExtensionDetail.tsx` (+ `.ext-detail-back`)
- `packages/extensions-core/src/skills/BrowseSheet.tsx` (+ `.skills-back` / `.skills-detail`)

For the **Detail header** specifically (two-row toolbar + title, action
buttons), in `silo-code/silo-extensions`: `github-prs` `PrPanel.tsx`
(+ `.ghpr-header__*` / `.ghpr-open-btn` / `.ghpr-merge-btn`), `github-issues`
`IssuePanel.tsx`, and `tasks` `TaskDetail.tsx` (+ `.tasks-detail-*`).

### Back control CSS contract

```css
.panel-back {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  background: transparent;
  border: none;
  color: var(--silo-color-accent);
  font-family: var(--silo-font-ui);
  font-size: var(--silo-font-size-sm);
  font-weight: 600;
  padding: 3px 6px;
  margin-left: -6px; /* optically flush caret with content below */
  border-radius: var(--silo-radius-sm);
  cursor: pointer;
}
.panel-back:hover:not(:disabled) {
  background: var(--silo-color-bg-hover);
  color: var(--silo-color-accent);
}
```

Back is **chrome**, not body: use `--silo-font-size-sm` (and a fixed
`CaretLeft size={14}`, as in git takeover) — never `1em`, or it inflates with
the pane/sheet body scale.

### Detail header

The drill-in header is **two rows**, shared by github-prs, github-issues, and
`silo.tasks`:

1. **Toolbar row** — the `.panel-back` control (above), then secondary icon
   tools right-aligned (`margin-left: auto`, `gap: 1px`, ~22×22 hits): refresh,
   open-external, `⋮` overflow, delete.
2. **Title row** (`align-items: flex-start`, `gap: 10px`) — the entity title
   (`flex: 1`, wraps) and, right-aligned, the primary action button(s).

**Title text** is body, not chrome: `font-size: 1em` (the pane scale — 15px in
the right column), `font-weight: 600`, `line-height: 1.35`,
`color: var(--silo-color-text-hi)`. When the title is an `InlineEdit`, override
its value span — `.silo-inline-edit-value` pins itself to
`--silo-font-size-base` (13px) and would otherwise render a step small:

```css
.my-detail-titlerow .silo-inline-edit-value {
  font-size: 1em;
  font-weight: 600;
  line-height: 1.35;
}
```

**Action buttons** are hand-rolled on the `--silo-button-*` treatment tokens
(no kit button at this size yet — swap when there is). Shape = github-prs
`.ghpr-open-btn` (secondary) / `.ghpr-merge-btn` (primary):

```css
.my-detail-btn {
  padding: 5px 12px;
  border: 1px solid var(--silo-button-border, var(--silo-color-border));
  border-radius: var(--silo-radius-sm);
  font-size: 0.92em;
  font-weight: 600;
  background: var(--silo-button-bg, var(--silo-color-input-bg));
  color: var(--silo-button-text, var(--silo-color-text-hi));
}
.my-detail-btn--primary {
  background: var(--silo-button-primary-bg, var(--silo-button-bg));
  color: var(--silo-button-primary-text, var(--silo-button-text));
}
```

Two buttons max — a secondary ("Open") beside a primary ("Merge" / "Complete");
one primary alone is fine.

**Form fields below the header.** Every field label uses the SDK `Section`
label style — `.silo-section-label`: `calc(var(--silo-font-size-chrome) - 1px)`,
`font-weight: 600`, `letter-spacing: 0.07em`, `text-transform: uppercase`,
`color: var(--silo-color-text-lo)` — the same uppercase `NAME` / `FOLDERS`
headers Silo modals use. Order fields by **reading priority, not by
core-vs-provider origin**: `silo.tasks` renders its core `Labels` field right
under the provider's free-form `Description`, and drops task identity
(`List` / `Workspace` / `ID`) to read-only labeled rows at the **foot**, beside
the provider's `Created` — not a subtitle under the title.

**Escape while editing.** A panel that renders `InlineEdit` (or any field that
registers `setActiveInlineEditCancel`, e.g. `silo.tasks`' `LabelsField`) **and**
owns its own document-level Escape handler must call `yieldEscapeToInlineEdit()`
first and stop there if it returns `true` — otherwise the first Escape pops the
whole detail page instead of cancelling the edit. `Modal.tsx` wires this for
modal content; a hand-rolled side panel does not get it for free.

## Sheets specifically

- **Anchored to a registered side panel** (browse/install flows like Skills'
  skills.sh sheet): use the public `ctx.layout.openPanelSheet(panelId, render,
opts)` (RFC 0029) — imperative, dock-only, reveals `panelId` first (unhides
  it, expands a collapsed column, activates its tab) so the sheet always opens
  on the panel's actual current side, even when triggered from a command
  palette / keybinding rather than a click inside the panel. `opts` is a
  [`SheetOptions`](/api/state/layout#types) (`title`, `width`, `bare`,
  `className`, `ariaLabel`, `mode`) — no `anchor`/`side`/`align`/`dismissible`;
  those don't apply to this dock-only, non-modal form.
- **Not anchored to any registered panel**, or an `anchor="app"` modal sheet
  (Settings, Sheet Lab's app-sheet demos): the declarative
  `@silo-code/extension-host/internal` `<Sheet>` — `core.*` only.
- Prefer **dock + push** for browse/install flows tied to a side panel.
- Sheet body owns list vs detail paging; the sheet shell owns close / Escape
  at the root page only.
- `<Sheet bare>` only when you must own the entire chrome (including close) —
  default padded sheet is fine for catalog browse.
- Width: dock default (~520) or slightly wider (~560) for catalogs with
  trailing badges/sparklines — don't jump to app-sheet width without cause.
- **Caption (sheet header title):** no global standard yet. Host default is
  `.silo-sheet-header { padding: 10px 10px 10px 16px }`. For a branded /
  wordmark caption (skills.sh), tighten toward **`6–7px` vertical** so it
  reads as a title bar, not a padded card header — see `.skills-sheet`. Prefer
  a skills-scoped override until a second sheet wants the same and we promote
  it into `Sheet.css`.

## Inputs

Filter fields are identifiers / queries, not prose:

- `SearchInput` already sets `autoCapitalize="off"`, `autoCorrect="off"`,
  `spellCheck={false}` (same idea as `InlineEdit`).
- Don't reintroduce autocapitalize on custom panel inputs. A **hand-rolled**
  edit field built on bare `Input` (not `SearchInput` / `InlineEdit`) must set
  the three attributes itself — `silo.tasks`' comma-separated Labels input was
  missing them.

### Label / tag chips

A string tag with no color of its own — a `silo.tasks` label, unlike a GitHub
issue label that ships a hex — renders as a **filled** chip with a color
**derived from the text**: hash the string to a hue, `hsl(h 65% 45%)`, and pick
`#161616` / `#fff` text by luma (`labelChipStyle`,
`silo-extensions/tasks/src/lib/labels.ts`). Shape: `border-radius:
var(--silo-radius-sm)` — a rectangle like github-issues' `.ghi-chip--label`,
not the kit `Badge` pill. `Badge`'s `color` prop paints a 20% **tint**, which
reads as too faint for a primary content chip; keep `Badge` (tinted) for
identity / status pills elsewhere.

## Overlap with modal design

Reuse from `docs/modal-design.md`:

- Kit component table (`Button`, `List`, `Badge`, `EmptyState`, …)
- Forbidden: restyle `.silo-*`, hand-rolled focus, invent badge tones
- Stability gate on the roadmap

Side-panel-specific (this doc):

- Inherit column font size
- Drill-in page replaces chrome
- Quiet Back link
- Dock sheet as companion surface

## Working log (iterate here)

Record concrete tweaks as we learn them so the table above stays honest.

| Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Why                                                                                                                                                                                                                                                                                                                             |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-24 | Skills browse detail became a full-sheet page with quiet `Back`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Nested under search/tabs felt cramped vs PR/git drill-ins                                                                                                                                                                                                                                                                       |
| 2026-08-24 | Dropped pinned small root fonts; secondary = `calc(1em - 1px)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Panel looked undersized next to Files/Git                                                                                                                                                                                                                                                                                       |
| 2026-08-24 | Icons `size="1em"`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Track `uiFontSize` / column zoom                                                                                                                                                                                                                                                                                                |
| 2026-08-24 | `SearchInput` disables autocapitalize                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Skill ids / filters aren't sentence case                                                                                                                                                                                                                                                                                        |
| 2026-08-24 | Added `.silo-scroll` to Skills panel body + browse/detail sheet regions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Bare `overflow: auto` picked up the app's thick outlined-pill scrollbar                                                                                                                                                                                                                                                         |
| 2026-08-24 | Skills lists override `.silo-list-row` to `1em`; sheet re-applies right-pane `base+2px`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Kit List pinned `--silo-font-size-sm` (12px); sheets lost pane inheritance — Files/Git stay at 15px/14px primary/secondary                                                                                                                                                                                                      |
| 2026-08-24 | Back link stays `--silo-font-size-sm` (chrome), not pane `1em`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Pane scale bump made Back oversized vs git takeover / prior look                                                                                                                                                                                                                                                                |
| 2026-08-24 | skills.sh wordmark title bar (mono + offset outline), stable on drill-in                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Brand the browse sheet subtly; skill name stays in the detail body                                                                                                                                                                                                                                                              |
| 2026-08-24 | Detail: overflow (site + install scopes) on back row; keep Install into / Command                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Match github-issues chrome; drop primary Install button only                                                                                                                                                                                                                                                                    |
| 2026-08-24 | Browse toolbar: search first, then mono view chips (ext-cats pattern)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Match Extensions registry chrome; SegmentedTabs stay for binary install scope                                                                                                                                                                                                                                                   |
| 2026-08-24 | Installed-row agent roots: quiet mono `.agents · .claude`, not outline badges                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Leading dots echo on-disk folders; pills stacked/wrapped in a narrow panel                                                                                                                                                                                                                                                      |
| 2026-08-24 | Section counts: `Badge size="sm"` beside title; drop far-right icon accessory                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Match workspaces-row counters; less chrome                                                                                                                                                                                                                                                                                      |
| 2026-08-25 | Badge sizes demo uses `.silo-demo--app-scale` + status-vs-counter layout                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Default demo chrome is modal (12px), so `sm` (chrome) looked ≥ `md` (chrome−1); digit pairs hid the pad/role difference                                                                                                                                                                                                         |
| 2026-08-25 | Skills toolbar: actions above filter, 26×26 hits (`gap: 2px`); Browse → compact `skills.sh` ghost mark; refresh = `ArrowsClockwise` @ 14                                                                                                                                                                                                                                                                                                                                                                                                                                | Match git `.branch-action` / multi-root `GitHeaderActions`; brand registry entry; standard panel-toolbar refresh glyph+size                                                                                                                                                                                                     |
| 2026-08-25 | Skills toolbar → list effective gap ~20px (design target)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Visual distance from filter/toolbar to first section header; pad split is flexible                                                                                                                                                                                                                                              |
| 2026-08-25 | skills.sh detail: summary skeleton while fetch runs; Install/Uninstall section swaps `npx skills add` ↔ `remove` per scope                                                                                                                                                                                                                                                                                                                                                                                                                                              | Drop “Loading summary…”; show remove cmd when installed in the selected scope                                                                                                                                                                                                                                                   |
| 2026-08-25 | Uninstall: no scope toggle — one remove cmd, or both when installed in project + user                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Toggle only belongs on install; dual install shows labeled command blocks                                                                                                                                                                                                                                                       |
| 2026-08-25 | Browse catalog list: row skeleton while seed pages load (same pulse as detail summary)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Match detail loading affordance; drop empty-list flash                                                                                                                                                                                                                                                                          |
| 2026-08-25 | skills sheet body `padding-right: 10px` (was 16) to match header close inset                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Content / ⋮ were inset past the title-bar X                                                                                                                                                                                                                                                                                     |
| 2026-08-25 | skills sheet caption pad `6px / 7px` vertical (was 9)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Wordmark sat a few px low vs a title-bar read; no host caption standard yet                                                                                                                                                                                                                                                     |
| 2026-08-31 | Tasks panel drill-in uses a **token-styled native `<input type="date">`** (`.tasks-date-input`): `--silo-color-input-*` + `--silo-radius-sm` + `--silo-font-ui`, `6px 8px` pad                                                                                                                                                                                                                                                                                                                                                                                          | First panel control with no kit component behind it — the design-system kit has no date picker, and hand-rolling one in an extension would fork the kit (ADR 0026). The comma-separated label `Input` and `CheckboxRow`/`AddRow` criteria list are the other two "no kit component" fields; only the date input needed new CSS. |
| 2026-08-31 | Tasks panel rows are bespoke `div[role="button"]` (not kit `List`), matching agent-monitor's `.ap-row`                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Kit `List` clones its direct `ListRow` children (`__listIndex` / `__focusProps`), so a `<TaskRow>` wrapper can't sit inside it; a grouped list with `Section` headers between row runs wants plain rows anyway                                                                                                                  |
| 2026-08-31 | Documented git's 4/10/12px horizontal "staircase" (header / docked input box / rows) — see Layout chrome. Tasks' bottom-docked quick-add sits at **10px** (`4px` dock pad + `6px`), matching `.commit-area`                                                                                                                                                                                                                                                                                                                                                             | The `4px` "panel inset" rule only covered the container; a docked input box that aligned flush to it read as under-indented next to git's commit box                                                                                                                                                                            |
| 2026-08-31 | Tasks quick-add "Add" button: square (`2.15em`), primary fill, `Plus` icon only, right of the input                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Iterated to match the git Commit button's weight without its full width; `2.15em` tracks pane font scale and reads as square next to a kit `Input`                                                                                                                                                                              |
| 2026-08-31 | Toolbar `MenuButton` dropdowns are labelled by their **current value** (no "Group:" / "Filter:" prefix), sized at `--silo-font-size-base` (13px)                                                                                                                                                                                                                                                                                                                                                                                                                        | Two prefixed labels ate the narrow toolbar width; the value + chevron already reads as "picker for X". Base size sits them as chrome vs the pane-scaled body                                                                                                                                                                    |
| 2026-08-31 | Empty / no-results state = a single muted italic left-aligned line (`calc(1em - 1px)`, `16px 12px` pad), optional inline accent link — the github-prs `.ghpr-empty` pattern, **not** a kit `EmptyState` block                                                                                                                                                                                                                                                                                                                                                           | A centered big-icon `EmptyState` is modal chrome; in a narrow always-visible panel it's heavy and competes with the list. Prefer the quiet line for "nothing here yet"                                                                                                                                                          |
| 2026-08-31 | A bottom-docked quick-add / message box needs **no top border** when it's the panel's last element                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | The panel edge already terminates it; a rule there just adds a seam. Git's `.commit-area` has none either                                                                                                                                                                                                                       |
| 2026-08-31 | ~~**Single-inset rule adopted**: one `--pad-x` (`10px`) on every region.~~ **Reverted 2026-08-31 (below).**                                                                                                                                                                                                                                                                                                                                                                                                                                                             | —                                                                                                                                                                                                                                                                                                                               |
| 2026-08-31 | **Group/section header pattern promoted to canon** — the skills-manager / git `.section-head` (uppercase chrome label + `0.85em` chevron + right-pushed `Badge` count, collapsible with persisted state). `silo.tasks` group headers now match it (`.tasks-section-head`), collapsed set persisted in `ctx.storage.global` per workspace.                                                                                                                                                                                                                               | Was drifting: tasks had a non-collapsible, `text-lo`, no-chevron header. One header shape across list panels.                                                                                                                                                                                                                   |
| 2026-08-31 | **Toolbar → first-header gap corrected to ~12px** (supersedes the "~20px design target" row above). Mechanism: scroll-body top pad `0`, section header no `margin-top`, gap = toolbar bottom pad (`8px`) + header top pad (`4px`). Inter-group spacing moved onto the list wrapper `gap: 14px` (skills-manager `.skills-body`). Applied to `silo.tasks` (`.tasks-panel-body` `0 0 12px`, `.tasks-list` `gap: 14px`, dropped `.tasks-section-head { margin-top: 6px }`).                                                                                                 | Tasks stacked body top pad + header margin-top on top of the toolbar pad → ~26px void under the filter. Skills never had the void; match it.                                                                                                                                                                                    |
| 2026-08-31 | **Two-tier horizontal inset is canon** (reverts the single-inset row above). Chrome (toolbar / docked input / detail / empty line) at `10px`; list = `4px` scroll-body container + staircase: header `4px 8px` (→12px), row `4px 2px 4px 10px` `gap:4px` (→14px left / ~6px right). `silo.tasks` list now uses the literal skills/git values (dropped `--tasks-pad-x` from rows/headers, keeps it for chrome only); skills-manager toolbar moved `4px` → `10px` to match tasks' chrome. See the rewritten "Panel horizontal inset" section.                             | Flat `10px` everywhere made the list "line up along the left" — no hierarchy between a bucket header and its rows. git + skills already had the staircase and read better; tasks + skills are now byte-identical references.                                                                                                    |
| 2026-08-31 | **Canonical group header goes muted** — `color: var(--silo-color-text-lo)` (was `--silo-color-text`), unchanged `600` / chrome size / uppercase; hover still brightens to `text-hi`. Applied to git `.section-head`, skills-manager `.skills-section-head`, tasks `.tasks-section-head`.                                                                                                                                                                                                                                                                                | The header was smaller than the rows but bolder and full-strength, so a bucket label read louder than its contents. Muted matches agent-monitor's `.ap-section-title`, which had it right.                                                                                                                                      |
| 2026-08-31 | **Collapsed-dropdown control standardized** — `MenuButton size="sm"` at `--silo-font-size-base`, labelled by current value, geometry from host `.silo-menu-button-sm`. github-prs / github-issues filter buttons rebuilt to match (`.ghpr-menu-btn` / `.ghi-menu-btn` mirror `.silo-menu-button-sm` in CSS; can't use the component yet — their published SDK predates it). Dropped the old `.ghpr-filter-btn` / `.ghi-filter-btn` (`1em`, `font-weight: 500`, no chevron-as-kit).                                                                                      | Two toolbar controls (tasks, github-prs) had drifted apart — different size, weight, chevron. One shape now; new "Collapsed dropdown" section under Layout chrome.                                                                                                                                                              |
| 2026-08-31 | **Detail header promoted to canon** — two rows: toolbar (Back + right-aligned ~22×22 icon tools) over a title row (bold `1em` / `600` / `1.35` pane-scale title + right-aligned primary action button). CTA buttons hand-rolled on `--silo-button-*` tokens (`5px 12px`, `0.92em`, `600`), shape = github-prs `.ghpr-open-btn` / `.ghpr-merge-btn`. `silo.tasks` `TaskDetail` rebuilt to match (its title `InlineEdit` needed `.silo-inline-edit-value { font-size: 1em }` — the kit span pins `--silo-font-size-base`). New "Detail header" subsection under Drill-in. | github-prs / github-issues already shared this shape; `silo.tasks` had a quiet accent-text "Complete" link and a `--silo-font-size-base` title. One drill-in header.                                                                                                                                                            |
| 2026-08-31 | **Detail-page field labels = `.silo-section-label`** (`chrome−1` / `600` / `0.07em` / uppercase / `text-lo`) — the SDK `Section` label from every modal. `silo.tasks` `.tasks-detail-label` moved onto it (was `calc(1em - 2px)` / `0.04em`, a step larger and looser).                                                                                                                                                                                                                                                                                                 | The panel form labels didn't match the identical labels in modals / settings; one label style across surfaces.                                                                                                                                                                                                                  |
| 2026-08-31 | **`silo.tasks` detail field order + identity footer** — core `Labels` field moved to sit directly under the provider's free-form `Description` (not up with the Lane / Priority pickers); the old subtitle line (lane · list · id) removed — lane duplicates the Lane control, and `List` / `Workspace` / `ID` now render as read-only `.silo-section-label` rows at the **foot**, beside the provider's `Created`.                                                                                                                                                     | Order fields by reading priority, not core-vs-provider origin; task id / list are reference facts, not header material.                                                                                                                                                                                                         |
| 2026-08-31 | **Filled derived-color label chips** — a colorless string tag (`silo.tasks` label) renders as a solid chip, hue hashed from the text (`hsl(h 65% 45%)`, `#161616` / `#fff` text picked by luma), `radius-sm` rectangle like github-issues `.ghi-chip--label`. **Not** the kit `Badge` — its `color` prop is a 20% tint, too faint for a content chip. `LabelsField` + `lib/labels.ts`; new "Label / tag chips" note under Inputs.                                                                                                                                       | Wanted the github-issues label look; task labels carry no color of their own, so derive it; `Badge` tint didn't read as filled.                                                                                                                                                                                                 |
| 2026-08-31 | **`InlineEdit` in a hand-rolled panel needs `yieldEscapeToInlineEdit()`** — the panel's own document-level Escape handler must call it first and bail on `true`, else the first Escape pops the detail page instead of cancelling the edit. `silo.tasks` `TasksPanel` fixed; `LabelsField` registers `setActiveInlineEditCancel` like `InlineEdit` does. Also: a hand-rolled edit `Input` must set the `autoCapitalize` / `autoCorrect` / `spellCheck` off trio itself (tasks' Labels input was missing it).                                                            | `Modal.tsx` wires the two-stage Escape; a side panel with its own keydown listener doesn't inherit it.                                                                                                                                                                                                                          |
