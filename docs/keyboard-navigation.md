# Keyboard navigation — current behavior (the contract)

This is the **user-standpoint behavior** of Silo's keyboard focus. It's the
contract the tests assert and that the focus-region model + `useFocusGroup`
(RFC 0012, now implemented) preserve — if any line here changes, that's a
deliberate behavior change, not an incidental regression.

> Scope: app/workbench behavior (host + first-party panels). The extension-author
> view of this lives in `apps/docs/guide/keyboard-navigation.md`.

## Regions & the region cycle

- Top-level focus regions, left→right: **Left dock → Center dock → Right dock →
  Status bar**.
- **Cmd+Alt+.** moves to the next region, **Cmd+Alt+,** the previous;
  collapsed/empty regions are skipped, and the cycle wraps. A **collapsed side
  dock** stays mounted (clipped to zero width), so its tab buttons remain
  focusable — the cycle's visibility guard sits above every entry fallback so it
  is still skipped, never landed on.
- Entering the **center** lands on the active editor/terminal **cursor** (ready to
  type), not on dock chrome. The center is **not** a single Tab stop — Tab there
  goes into the editor (indent/completion); you leave it via the region cycle or a
  click. Returning to the center (region cycle or Tab handoff) restores the **same
  tab** — editor or terminal — you left from.
- Entering a **side dock** lands on the active panel's content (see below), and
  the active tab's accent underline lights (`:focus-within`).
- The window **resize handles (splitters) are not tabbable**.
- **Closing a tab in a split group you aren't focused in keeps your focus put** —
  it doesn't steal activation into the group whose tab closed. (Within the group
  that owns the closed tab, dockview's normal MRU reactivation is unchanged.)

## Status bar

- **Click the empty bar background** (or the flex spacer) → focus the first item,
  with a keyboard focus ring.
- Region-cycling into the bar → ring on the focused item.
- The ring is **keyboard-only** — it does **not** show when you click an item with
  the mouse.
- **Tab** moves between items; off the **last** item it hands off to the first
  region (the left dock's content), wrapping cleanly — no empty `<body>` stop, no
  trap.

## Menus (dropdowns & context menus)

- Opening a menu **moves focus into it**.
- **↑/↓** / **Home/End** move the highlighted row; **Enter/Space** runs it;
  **→** opens a submenu (focus follows in); **←** steps back out; **Esc** closes.
- Navigation works regardless of where DOM focus physically landed (handled at the
  document level), and the highlight is reliable in the WebView.
- Closing on **selection or Esc** restores focus to the element that opened the
  menu; closing by **clicking outside** leaves focus where you clicked.

## Left side dock / Workspaces panel (reference panel)

- **Click the dock background** OR **region-cycle in** → focus lands on the
  **currently-selected workspace** row, with a focus ring.
- **↑/↓** move the focused row (wrapping), **Home/End** jump to the ends.
- **Enter/Space** activates the focused workspace (and focus moves to the editor).
- The **ContextMenu key** (or **Shift+F10**) opens that row's context menu,
  anchored to the row; focus moves into the menu.
- The list is **one Tab stop**: the per-row close (×) is out of the tab order, so
  **Tab** from the list goes to the **+ Add** button, and **Tab** from there hands
  off to the **editor cursor** (skipping the splitter and dock chrome).
- The focus ring is shown for keyboard focus and is **reliable even for the
  programmatic focus** the region cycle / click-to-enter perform (it is state-
  driven, because the WebView won't repaint `:focus` for programmatic focus).

## File explorer (tree panel)

- **Click the dock background** OR **region-cycle in** → focus lands on the
  **currently-selected row** (the tree is one Tab stop, on the same `useFocusGroup`
  as the workspaces list and with the same keyboard-only ring).
- **↑/↓** move the focused row across the **visible** rows in render order
  (expanded directories contribute their children inline), **Home/End** jump to
  the ends.
- **→** expands a collapsed directory; **←** collapses an expanded one, otherwise
  it focuses the **parent** row (stopping at the hidden root).
- **Cmd+Enter** opens the focused file in an editor; **Enter** (alone) renames;
  **Cmd+Backspace** deletes; **Cmd+Alt+R** reveals; **Cmd+X** cuts.
- The **ContextMenu key** (or **Shift+F10**) opens that row's file menu, anchored
  to the row.
- The list is **one Tab stop**: **Tab** off the last row hands off to the editor
  cursor (skipping the splitter and dock chrome).

## Window re-activation (macOS)

- When the app regains focus (e.g. you click back into it after switching away),
  focus is **restored to the last-focused region**, so the click that reactivates
  the window doesn't strand you (no throwaway second click).

## Test coverage

**Unit (run in `pnpm test`, no app needed)** — the pure logic and focus decisions:
`use-focus-group` (the roving index math `focusGroupNextIndex` + `isContextMenuKey`,
in `@silo-code/sdk`), `tree-nav` (`flattenVisible` render order + `treeArrowNav`
expand/collapse/parent), `side-pane-focus` (`focusActivePaneContent`,
`enterActivePaneOnClick`), `use-focus-retry` (bail-on-superseded), `focus-restore`
(`restoreTarget`), `focus-dom` (the shared tabbable selector), `focus-regions`
(the region model), `dock-api-registry` (`focusCenterDock`), `dock-helpers`
(cross-group keep-focus-on-close), plus rendered `Menu` / `StatusBar` guards.

**Integration (`apps/desktop/src/automation/keyboard-nav.it.test.ts`)** —
drives the live app over the automation RPC (`silo.exec` / `silo.eval` /
`silo.activeElement` / `silo.key`), gated on `foreground()` so it skips in CI,
mirroring `focus-handoff.it.test.ts`. Asserts each behavior above end-to-end:
region cycle into the workspaces list lands on the active row (`li.ws-item.active`

- the focus marker), ↑/↓ move it, Enter activates, the ContextMenu key opens the
  menu, Tab off the list reaches the editor textarea, the status bar entry +
  keyboard-only ring, and menu arrow/Enter. The `silo.key(...)` helper (dispatch a
  `KeyboardEvent` via `eval`) was added to the bridge/client for this.
