---
status: accepted
date: 2026-08-27
---

# 0044. The Navigator can stack its views instead of showing one at a time

## Context

ADR [0038](./0038-navigator-view-list.md) made the Navigator show its views one
at a time behind an always-visible **View List**, and recorded "stacked
collapsible sections" as an **explicitly deferred** alternative — "Genuinely
more capable … and tested well as a mockup", deferred only because it looked
like it "changes what a `NavigatorView` _is_, from 'owns the panel body' to
'owns a section that may be 80px tall,' which is an SDK contract change every
existing view has to absorb."

RFC [0030](../proposals/0030-navigator-view-arrangement.md) revisited that and
found the contract worry doesn't hold: a `NavigatorView` still renders one
component that owns a rectangle — a section is just a smaller rectangle, and
every non-trivial view already scrolls its own overflow because it can't assume
panel height today either. `active` is documented as a throttle _hint_, not a
guarantee, so "always `true` in stacked mode" stays within contract. Per-section
headers reuse the existing `"navigator"` toolbar surface unchanged. So stacked
mode ships entirely in `core.navigator`'s renderer with no public SDK change.

RFC 0030 also added user control over the view set (reorder + enable/disable),
which stacked mode consumes directly — it renders the enabled views in the
user's order.

## Decision

The Navigator has a **view arrangement** preference (Settings → Layout →
Navigator, global, persisted by `core.navigator`): **one at a time** (ADR 0038's
View List + Active View, the default) or **stacked** (no View List; every
enabled view is a collapsible section in the user's order, each with its own
View Header). In stacked mode there is no Active View, every view's component
gets `active` regardless of collapse state, and keyboard region-entry lands in
the first expanded section.

This **supersedes ADR 0038's "Stacked collapsible sections — deferred"**
alternative. ADR 0038's one-at-a-time design remains the default arrangement and
is otherwise unchanged.

## Consequences

- Watching two views at once (agents + workspaces) no longer means constant
  switching — the motivating need ADR 0038 named when it deferred this.
- **`active` no longer throttles in stacked mode.** A collapsed section's view
  keeps running. Accepted because views are lightweight `ctx`-state projections;
  if a genuinely expensive view appears, collapsed → `active: false` is a
  forward-compatible change.
- **Per-section max-height (~60vh) with inner scroll.** One long view can't bury
  the sections under it; the panel still scrolls as one within the host
  tab-pane, preserving the single-scroller invariant every view assumes.
- Stacked mode with a single enabled view renders plain (no disclosure) — same
  reasoning as ADR 0038's "one view → no View List".
- No `@silo-code/sdk` change, no version bump. Third-party views work in stacked
  mode with no action from their authors.
- Draggable section splitters were **deferred** (see below), so section sizing
  is not user-adjustable yet.

## Alternatives considered

- **Draggable section splitters** (true VS Code Explorer weighted panes).
  Deferred, not rejected: more capable but fights the single-scroller model and
  carries materially more state and code. Content-height + a per-section cap
  covers the common case; splitters can follow if the cap proves too blunt.
- **Collapsed section → `active: false`.** Deferred: preserves the throttle hint
  but forces a definition of "active" spanning focus, expansion, and visibility,
  and re-wakes a view on every expand. Forward-compatible to add later.
- **Keeping stacked mode deferred** (ADR 0038's position). Rejected now that the
  SDK-contract objection is shown not to hold — see RFC 0030.

## References

- RFC [0030](../proposals/0030-navigator-view-arrangement.md) — the full design
  (reorder / disable + stacked mode) this ADR records.
- ADR [0038](./0038-navigator-view-list.md) — the View List; its deferred
  "stacked collapsible sections" alternative that this supersedes.
- RFC [0023](../proposals/0023-workspace-panel-views.md) — the Navigator and
  `ctx.registerNavigatorView`.
- `packages/extensions-core/src/navigator/` — the panel, its pure view model,
  and the `navigatorPrefs` store.
