---
status: accepted
date: 2026-09-02
---

# 0048. Unscoped Navigator chrome rides the Workspaces row, not the active view

## Context

The Navigator's one interactive header contribution that isn't scoped to a
single view is `core.workspaces.add` — the **Add-workspace "+"**. ADR
[0038](./0038-navigator-view-list.md) placed it in the **View Header** (the bar
naming the Active View) and made it _unscoped_: its `when` returns true for
every view, so as the user switches views the "+" follows them and stays in one
fixed screen position. ADR 0038 called that out as a deliberate consequence —
"an intentionally unscoped item stays in the same place as the user switches
views, which the earlier active-row placement would not have given it."

In daily use that has worn the wrong way:

- **The "+" is noise on every other view.** On Agents, on Tasks, on any
  third-party view, a control that only ever creates a _workspace_ sits in the
  header regardless. It reads as "an action for this view" when it isn't one.
- **"Follows you everywhere" isn't a property this action needs.** Adding a
  workspace is not so frequent, mid-task, that it must be one click from
  wherever you happen to be. It is the Workspaces view's own primary action.
- **The stacked arrangement already disagrees with one-at-a-time.** ADR
  [0044](./0044-navigator-stacked-arrangement.md) / RFC 0030 shipped stacked
  mode, where the "+" is pinned to a _single_ section (Workspaces, or the top
  section if Workspaces is hidden) via `stackedChromeHostViewId()` — precisely
  because repeating it on every section header was obviously wrong there. The
  two arrangements place the same control by two different rules.

The fix is to give the two arrangements one rule: the "+" belongs to the
**Workspaces view's own affordance**, wherever that view is represented.

## Decision

Otherwise-unscoped `"navigator"`-surface toolbar chrome renders **once**, in a
single **unscoped-chrome slot** that belongs to the Workspaces view:

- **One-at-a-time, View List shown** — a trailing slot on the **Workspaces row**
  of the View List.
- **One-at-a-time, View List hidden** (only one view enabled) — the **View
  Header**, which is the only place actions render in that case (unchanged from
  ADR 0038's single-view fallback).
- **Stacked** — the **Workspaces section header** (as ADR 0044 already did).

If the **Workspaces view is disabled**, the slot is not rendered and the "+"
does **not** appear in the Navigator at all. Recovery is the workspace
status-bar item (bottom-left), which already offers "New workspace…". This
drops ADR 0044's "…or the top section if Workspaces is hidden" fallback: the
"+" is the Workspaces affordance, and if Workspaces isn't in the Navigator the
"+" isn't either.

Per-view header contributions (today `silo.agents.group-by`, scoped by `when`
to `silo.agents.by-status`) are unaffected — they keep rendering in the View
Header / section header of the view they belong to.

### Mechanism (no `@silo-code/sdk` change)

`core.navigator` renders two kinds of `ContributedToolbar` on the
`"navigator"` surface:

1. **Per-view**, as today — `target: { viewId: <real view id> }` — on each View
   Header (one-at-a-time) or section header (stacked). Catches scoped items.
2. **The unscoped-chrome slot** — `target: { viewId: <sentinel> }` — rendered
   in the one place above. The sentinel is a reserved, non-real view-id string
   owned by `core.navigator` and exposed on its bundled-only
   `NavigatorExtensionAPI`:

   ```ts
   interface NavigatorExtensionAPI {
     SettingsPanel: ComponentType;
     /**
      * The synthetic `ToolbarItemContext["navigator"].viewId` the Navigator
      * passes from its single unscoped-chrome slot (the Add-workspace "+"'s
      * home — the Workspaces View List row, its View Header when the list is
      * hidden, or its stacked section header). `null` when the Workspaces view
      * is disabled, so the slot isn't rendered. An item whose `when` matches
      * this value renders there and nowhere else; a normal per-view item
      * matches a real view id and never sees it.
      */
     unscopedChromeTarget(): string | null;
   }
   ```

`core.workspaces.add`'s `when` collapses to
`(_keys, target) => target.viewId === navApi.unscopedChromeTarget()`. When
Workspaces is disabled that returns `null`, nothing matches, and the "+" is
gone from the Navigator. The `core.navigator` → `core.workspaces` boundary is
unchanged: `core.workspaces` reads `core.navigator`'s API (arrow points
workspaces → navigator, as it already did for `stackedChromeHostViewId`);
`core.navigator` still knows nothing of workspaces.

`stackedChromeHostViewId()` and the internal `stackedChromeHostId()` helper are
replaced by this one `unscopedChromeTarget()` path — the "stacked-only"
qualifier is gone because the concept now spans both arrangements.

### Keyboard and assistive tech

The Workspaces row is a `role="tab"` in the View List's `role="tablist"` with
`useFocusGroup` roving focus (ADR [0021](./0021-keyboard-navigation-architecture.md)).
The "+" is rendered as a **sibling of the tab element inside a row wrapper**,
not a child of the tab, so the tab stays a clean single selectable and the
tablist stays one Tab stop. The "+" itself is `tabIndex={-1}` — a pointer
affordance, like the CenterDock tab close button and the Agents "Recent"
drag grip. Keyboard and AT users reach "new workspace" through the
`workspace.new` command (command palette, and its keybinding) and the
status-bar item — both already fully keyboard-accessible, and the same
division ADR 0038 accepted when it noted "a keybinding remains worth adding
alongside the list".

## Consequences

- **One placement rule for both arrangements.** The "+" attaches to the
  Workspaces representation — row, header, or section — and to nothing else.
  `core.workspaces`' `when` predicate goes from a three-branch host-state
  check to a one-line equality.
- **Reverses the relevant ADR 0038 consequence.** "Unscoped items keep a fixed
  position in the View Header" is now "unscoped items ride the Workspaces
  row." ADR 0038's core decision (list, not menu; header names the active
  view) stands; a pointer at this ADR is added to that consequence bullet.
- **The "+" can be absent from the Navigator.** If a user disables the
  Workspaces view, the Navigator shows no "+". This is intended — but it means
  the status-bar item is now the _only_ in-chrome path to "new workspace" for
  that user, and `workspace.new` should carry a default keybinding so there's
  always a keyboard path. (Filed as follow-up if it doesn't already.)
- **"New workspace" via the "+" is pointer-only.** Keyboard/AT users use the
  command or the status bar. Acceptable because two keyboard paths already
  exist and the row's Tab-stop model (ADR 0038 / 0021) is worth more than a
  third; revisit if the command-palette path proves too indirect in practice.
- **A reserved sentinel view id exists.** `unscopedChromeTarget()` returns a
  string that is deliberately not any real view's id. It's internal to the
  bundled `core.navigator` ⇄ `core.workspaces` pair and never reaches
  `@silo-code/sdk`; a third-party view contributing a `"navigator"` toolbar
  item still only ever sees real view ids in its `when`.
- **Third-party views cannot put a button on their own row.** Out of scope on
  purpose (see Alternatives) — nothing asks for it, and the general version is
  a public API with real a11y and publish-lag cost.
- **Discoverability of "add workspace" drops slightly when you're on another
  view.** From Agents, adding a workspace is now: click the Workspaces row
  (which also switches you there), or use the status bar, or the command. It
  was one click from anywhere. Judged worth it — the control stops masquerading
  as an action for every other view, and the view whose action it _is_ always
  shows it.

## Alternatives considered

- **A general per-row action API** — `NavigatorView.rowActions`, or a
  `placement: "view-header" | "view-list-row"` hint on the toolbar
  contribution, so any view can put an icon button on its own View List row.
  **Rejected (not deferred):** exactly one consumer exists
  (`core.workspaces.add`), it's a public `@silo-code/sdk` addition with the
  usual third-party publish lag, and it widens the a11y surface to "a
  focusable button inside every `role="tab"` row". The narrow mechanism here
  costs no SDK surface and is not a one-way door — if a real second consumer
  appears, the sentinel slot generalizes into a placement hint without
  breaking the first.
- **Keep it in the View Header, unscoped, as ADR 0038 has it.** The status quo.
  Rejected per Context — it's visual noise on every non-Workspaces view and the
  "follows you" property isn't one this action needs.
- **Leave the "+" on the first enabled view when Workspaces is disabled**
  (ADR 0044's current stacked fallback, kept for one-at-a-time too). Rejected:
  it reattaches a workspace action to an unrelated view. Cleaner to say the
  "+" is the Workspaces affordance and route recovery through the status bar.
- **Put the "+" as a real focusable child of the tab** (roving-focus target or
  its own Tab stop). Rejected: a focusable child inside `role="tab"` is
  contrary to the APG tabs pattern, and interleaving extra Tab stops in the
  tablist breaks ADR 0038's "one Tab stop, arrow between rows" model. The
  sibling-in-a-wrapper structure keeps both clean.

## References

- ADR [0038](./0038-navigator-view-list.md) — the View List + View Header; the
  "unscoped items keep a fixed position in the View Header" consequence this
  revises.
- ADR [0044](./0044-navigator-stacked-arrangement.md) — stacked arrangement;
  `stackedChromeHostViewId()`, whose "…or the top section" fallback this drops.
- ADR [0021](./0021-keyboard-navigation-architecture.md) — `useFocusGroup`, the
  roving-focus primitive behind the View List tablist.
- ADR [0029](./0029-adornments-vs-registration.md) — panel chrome is
  contributed, not owned by the panel.
- `packages/extensions-core/src/navigator/` — the panel, its pure view model,
  and `navigator-api.ts`.
- `packages/extensions-core/src/workspaces/index.tsx` — `core.workspaces.add`.
