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
  aligned (`justify-content: flex-end`), then `SearchInput`. Panel pad
  `8px 4px`, bottom border `1px solid var(--silo-color-border)`,
  `flex-shrink: 0`. Match git `.git-root-actions` / `.branch-action`: **26×26**
  icon hits, `gap: 2px`, transparent + hover fill — not kit `Button size="sm"`
  (reads oversized next to Git).
- **Toolbar → list gap:** effective distance from the filter/toolbar controls
  to the first section header / list should read as **~20px** (measure the
  visual gap, not a single CSS property — toolbar bottom pad + body top pad
  - border can share that budget).
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
- **Panel / body horizontal inset**: **`4px`** — match git `.git-panel`
  (`padding: 8px 4px 12px`) and files `.file-tree` (`padding: 4px 4px 0`).
  Do **not** use `10px` / `12px` outer pads; that pushes section headers and
  rows inboard of Git and wastes width in a narrow dock.
- **Section headers**: `padding: 4px 8px` (git `.section-head`) so the
  uppercase label lines up with row content at **12px** from the pane edge
  (`4px` panel + `8px` head).
- **List / file rows**: content pad **`8px` left** (git `.git-file-row`).
  Kit `.silo-list-row` defaults to `6px 10px` — override in the panel. For
  rows with a trailing ⋮ / glyph, use a **tighter right pad** (`2px`–`4px`)
  so the action sits near the edge instead of floating in a second gutter;
  keep `gap` small (`4px`) between label and trailing.
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
- Put the primary action (`Install`, `Merge`, …) on the **title row**,
  right-aligned — `Button variant="primary"`.
- `Escape` pops one page when a drill-in is open; only closes the sheet/panel
  at the root page.
- Sheet title may update to the entity name while drilled in.

**Don't**

- Nest detail under persistent search / segmented tabs / "Showing N of M".
- Use a primary `Button` labeled "← Back to list".
- Leave the user with no full-width reading column for description / metadata.

Reference implementations in-repo:

- `packages/extensions-silo/src/git-explorer/CommitsTakeover.tsx` (+ `.git-takeover-*`)
- `packages/extensions-core/src/extensions/ExtensionDetail.tsx` (+ `.ext-detail-back`)
- `packages/extensions-core/src/skills/BrowseSheet.tsx` (+ `.skills-back` / `.skills-detail`)

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
- Don't reintroduce autocapitalize on custom panel inputs.

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

| Date       | Change                                                                                                                                   | Why                                                                                                                         |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-24 | Skills browse detail became a full-sheet page with quiet `Back`                                                                          | Nested under search/tabs felt cramped vs PR/git drill-ins                                                                   |
| 2026-08-24 | Dropped pinned small root fonts; secondary = `calc(1em - 1px)`                                                                           | Panel looked undersized next to Files/Git                                                                                   |
| 2026-08-24 | Icons `size="1em"`                                                                                                                       | Track `uiFontSize` / column zoom                                                                                            |
| 2026-08-24 | `SearchInput` disables autocapitalize                                                                                                    | Skill ids / filters aren't sentence case                                                                                    |
| 2026-08-24 | Added `.silo-scroll` to Skills panel body + browse/detail sheet regions                                                                  | Bare `overflow: auto` picked up the app's thick outlined-pill scrollbar                                                     |
| 2026-08-24 | Skills lists override `.silo-list-row` to `1em`; sheet re-applies right-pane `base+2px`                                                  | Kit List pinned `--silo-font-size-sm` (12px); sheets lost pane inheritance — Files/Git stay at 15px/14px primary/secondary  |
| 2026-08-24 | Back link stays `--silo-font-size-sm` (chrome), not pane `1em`                                                                           | Pane scale bump made Back oversized vs git takeover / prior look                                                            |
| 2026-08-24 | skills.sh wordmark title bar (mono + offset outline), stable on drill-in                                                                 | Brand the browse sheet subtly; skill name stays in the detail body                                                          |
| 2026-08-24 | Detail: overflow (site + install scopes) on back row; keep Install into / Command                                                        | Match github-issues chrome; drop primary Install button only                                                                |
| 2026-08-24 | Browse toolbar: search first, then mono view chips (ext-cats pattern)                                                                    | Match Extensions registry chrome; SegmentedTabs stay for binary install scope                                               |
| 2026-08-24 | Installed-row agent roots: quiet mono `.agents · .claude`, not outline badges                                                            | Leading dots echo on-disk folders; pills stacked/wrapped in a narrow panel                                                  |
| 2026-08-24 | Section counts: `Badge size="sm"` beside title; drop far-right icon accessory                                                            | Match workspaces-row counters; less chrome                                                                                  |
| 2026-08-25 | Badge sizes demo uses `.silo-demo--app-scale` + status-vs-counter layout                                                                 | Default demo chrome is modal (12px), so `sm` (chrome) looked ≥ `md` (chrome−1); digit pairs hid the pad/role difference     |
| 2026-08-25 | Skills toolbar: actions above filter, 26×26 hits (`gap: 2px`); Browse → compact `skills.sh` ghost mark; refresh = `ArrowsClockwise` @ 14 | Match git `.branch-action` / multi-root `GitHeaderActions`; brand registry entry; standard panel-toolbar refresh glyph+size |
| 2026-08-25 | Skills toolbar → list effective gap ~20px (design target)                                                                                | Visual distance from filter/toolbar to first section header; pad split is flexible                                          |
| 2026-08-25 | skills.sh detail: summary skeleton while fetch runs; Install/Uninstall section swaps `npx skills add` ↔ `remove` per scope               | Drop “Loading summary…”; show remove cmd when installed in the selected scope                                               |
| 2026-08-25 | Uninstall: no scope toggle — one remove cmd, or both when installed in project + user                                                    | Toggle only belongs on install; dual install shows labeled command blocks                                                   |
| 2026-08-25 | Browse catalog list: row skeleton while seed pages load (same pulse as detail summary)                                                   | Match detail loading affordance; drop empty-list flash                                                                      |
| 2026-08-25 | skills sheet body `padding-right: 10px` (was 16) to match header close inset                                                             | Content / ⋮ were inset past the title-bar X                                                                                 |
| 2026-08-25 | skills sheet caption pad `6px / 7px` vertical (was 9)                                                                                    | Wordmark sat a few px low vs a title-bar read; no host caption standard yet                                                 |
