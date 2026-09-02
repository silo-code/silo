---
status: accepted
date: 2026-08-13
---

# 0038. The Navigator lists its views instead of hiding them in a menu

> **The "Stacked collapsible sections" alternative below is superseded by ADR
> [0044](./0044-navigator-stacked-arrangement.md)** — it shipped as an opt-in
> arrangement (RFC [0030](../proposals/0030-navigator-view-arrangement.md)). The
> View List described here remains the default.

## Context

RFC [0023](../proposals/0023-workspace-panel-views.md) turned the Navigator into a
container of contributed **views** and put a **dropdown selector** in its header:
the active view's title plus a caret, opening a checkable `ctx.ui.showMenu` list.
That shape drove a second decision in the same RFC — `silo.agent-monitor` was told
to register its two groupings as two separate views (**Agents** and **Agents by
workspace**), because folding them into one view with its own grouping menu would
have produced "a menu inside a menu — the panel's view selector and the
extension's grouping selector are the same kind of control at two levels."

Both decisions have worn badly in daily use, and for the same underlying reason:

- **Switching costs two clicks and a read.** Opening a menu, scanning it, and
  picking a row is the whole interaction — for a control used many times an hour,
  on a panel whose entire job is navigation. The target isn't in a fixed place, so
  it can't become muscle memory.
- **The menu hides the app's shape.** A user with the Agents view open has no
  standing indication that a Workspaces view exists. Discovery of contributed
  views depends on opening a menu you have no reason to open.
- **Two views for one list.** "Agents" and "Agents by workspace" render the same
  rows sectioned two ways. As menu rows they read as two destinations, which is
  exactly the confusion the RFC's flat list was supposed to avoid.

The nesting objection that rejected a merged Agents view is **conditional on the
selector being a menu**. Flatten the selector and there is no outer menu left to
nest inside — so the two changes are one decision, and neither is worth making
alone.

## Decision

The Navigator renders **every registered view as a row in an always-visible list**
at the top of the panel, one click each. Below the list, a **view header** names
the active view and carries that view's toolbar contributions. The dropdown
selector is gone.

Splitting "where can I go" (the list) from "where am I" (the header) is
deliberate: the rows stay unhighlighted, so the list reads as a set of
destinations rather than a segmented control with a stuck state, and the header
gives the actions a fixed home instead of moving them onto whichever row is
selected. Rows carry an icon in a reserved column, so titles align whether or not
a given view supplies one.

Consequently, `silo.agent-monitor` registers **one** Agents view, and its status
vs. workspace sectioning becomes a persisted **`groupBy` preference** flipped from
a "Group by" toolbar contribution in the Navigator header. This reverses the RFC's
rejection of that shape.

## Consequences

- Switching views is one click at a fixed screen position, and every contributed
  view is visible without opening anything — the panel now advertises what it can
  show.
- The panel spends roughly **30px per registered view**, plus a single ~24px view
  header, permanently. That is more chrome than the dropdown it replaces — the
  trade bought for it is that switching is one click and every contributed view
  is visible without opening anything. Fine at the two or three views that exist
  today; a user who installs several view-contributing extensions pays for a list
  they may rarely touch. If that becomes the common case, the answer is scrolling
  or collapsing the list — not going back to a menu.
- Toolbar contributions on the `"navigator"` surface keep a **fixed position** —
  the view header, not a moving row. An intentionally unscoped item (e.g.
  `core.workspaces.add`) stays in the same place as the user switches views,
  which the earlier active-row placement would not have given it.
  **Revised by ADR [0048](./0048-navigator-unscoped-chrome-on-workspaces-row.md):**
  the one unscoped item, the Add-workspace "+", now rides the **Workspaces row**
  of the view list rather than following the user across every view header.
  Scoped `"navigator"` items are unchanged — they stay in their view's header.
- Which view is active is conveyed **visually by the header alone**; the rows carry
  `aria-selected` but no highlight. Assistive tech is told at the point of choice,
  sighted users read it off the header.
- With **only one view registered the list is not rendered at all** — a one-row
  list of destinations you are already at is pure chrome. The header still names
  the view and carries its actions, so nothing is lost. The bodies drop their
  `role="tabpanel"` in that case too, since there is no tablist for them to
  belong to.
- The view list is a `role="tablist"` driven by the SDK's `useFocusGroup`
  (ADR [0021](./0021-keyboard-navigation-architecture.md)), so it is one Tab stop
  with ↑/↓ between rows and gets the shared keyboard ring for free.
- `silo.agent-monitor.by-workspace` is **retired**. Anyone whose persisted active
  view was that id falls back to Workspaces once, then picks Agents from the list.
  We accepted that one-time reset rather than adding a view-id migration mechanism
  to the SDK: the always-visible list makes recovery a single labelled click,
  which is materially cheaper than it would have been under the dropdown.
- `NavigatorView.icon` becomes load-bearing in a way it wasn't when it only
  decorated menu rows: both first-party views now set one, and a third-party view
  that omits it will look unfinished beside them. It is still optional and still a
  `React.ReactNode`, while toolbar items have since moved to `PhosphorIconName`
  strings — an inconsistency this ADR notes but does not resolve.

## Alternatives considered

- **A segmented control / tab strip in the existing header.** One click and zero
  extra vertical space, since it reuses the header row. Rejected: it stops working
  past about three views in a ~250px panel, and the overflow it then needs is a
  menu — reintroducing exactly what this ADR removes, at the point where the user
  has the most views to choose between.
- **Stacked collapsible sections** (all views open at once, VS Code Explorer
  style). Genuinely more capable — you stop switching and watch two views at once
  — and tested well as a mockup. **Deferred, not rejected.** It changes what a
  `NavigatorView` _is_, from "owns the panel body" to "owns a section that may be
  80px tall," which is an SDK contract change every existing view has to absorb.
  Worth revisiting if watching agents and workspaces simultaneously turns out to
  be the real need behind the frequent switching.
  **Superseded by ADR [0044](./0044-navigator-stacked-arrangement.md):** RFC
  0030 found the contract objection didn't hold (a section is a smaller
  rectangle, not a different contract; `active` is a hint), and it shipped as an
  opt-in arrangement with one-at-a-time still the default.
- **An icon rail** down the panel's edge. Scales to many views for almost no
  space. Rejected for now: it forces `NavigatorView.icon` from optional to
  required, breaking third-party views that don't set one.
- **Keeping the dropdown and adding a cycle keybinding.** Cheapest possible fix.
  Rejected as the primary answer — it helps the author of the keybinding and
  nobody else, and does nothing for discovery. A keybinding remains worth adding
  _alongside_ the list.
- **A view-id migration mechanism in the SDK** (e.g. `NavigatorView.replaces`), so
  a retired id resolves onto its successor. Deferred: it is a real gap in the view
  lifecycle and the right shape if view renames become common, but adding public
  SDK surface — with the publish lag that imposes on third-party extensions — to
  save one labelled click was not justified for a single retirement.

## References

- RFC [0023](../proposals/0023-workspace-panel-views.md) — the Navigator and its
  contributed views; the dropdown selector and the merged-view rejection this
  supersedes.
- ADR [0021](./0021-keyboard-navigation-architecture.md) — `useFocusGroup`, the
  roving-focus primitive the view list is built on.
- ADR [0029](./0029-adornments-vs-registration.md) — why panel chrome is
  contributed rather than owned by the panel.
- `packages/extensions-core/src/navigator/` — the panel and its pure view model.
