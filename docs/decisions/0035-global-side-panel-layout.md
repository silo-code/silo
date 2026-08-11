---
status: accepted
date: 2026-08-08
---

# 0035. Global Side Panel Layout is an opt-in shared arrangement

## Context

Side-panel arrangement — which panels show, where they sit (`sidePanelLocations`),
their order (`sidePanelOrder`), visibility (`sidePanelVisibility`), and side-column
collapse — is per-workspace: `activateWorkspace()` captures the outgoing
workspace's arrangement and applies the incoming one on every switch
(`capturePanelState()`/`applyPanelState()` in `state/panel-state.ts`). That's a
deliberate choice ([0033](./0033-laptop-mode-independent-layout.md)) — but some
users want the opposite for this one dimension: resize, hide, or reorder a side
panel once and have it apply everywhere, since they think of the side dock as
one arrangement they're configuring for the app, not per-project.

Column width already does something like this — it's global unconditionally,
stored outside the per-workspace system entirely (`layout/column-widths.ts`,
for first-paint reasons unrelated to this feature). This ADR is about the
remaining arrangement fields, which don't share that constraint and can be
made global _conditionally_, without giving up each workspace's own
arrangement for users who don't want to share it.

## Decision

**Global Side Panel Layout** is an opt-in, **off-by-default** setting
(`globalPanelLayoutEnabled`, in Settings → Layout). While off, everything
behaves exactly as before. While on:

- `sidePanelLocations`, `sidePanelOrder`, `sidePanelVisibility`, and side-column
  collapse (both the normal-width and Laptop Mode variants — see below) are
  shared across every workspace, live, through one new record
  (`store.globalPanelLayout`, shape `GlobalPanelLayout` in `state/types.ts`).
- `extensionState` (a panel's own instance data), `sidePanelScrollPositions`,
  and `activeSidePanelTabs` are **not** included in the main flag — they're
  either always per-workspace (the first two) or gated behind their own
  dependent sub-setting (`globalActiveTabEnabled`, also off by default,
  disabled in the UI until the main flag is on).
- **Frozen dual-state, not merge-on-write**: each workspace's own arrangement
  fields are left untouched on disk while the flag is on — captured/applied
  as normal only for the fields that stay per-workspace. Turning the flag off
  restores each workspace's own arrangement exactly as it was frozen. This
  mirrors 0033's own normal/Laptop-Mode dual-state pattern
  (`swapCollapseMode`/`collapseStateByMode`), generalized to the arrangement
  fields and applied across workspaces instead of across layout modes.
- **Applies to Laptop Mode too**: `GlobalPanelLayout` carries both collapse
  variants (`leftPanelCollapsed`/`rightPanelCollapsed` +
  `smallScreenCollapsed?`), the same normal/small-screen split a workspace's
  own `PanelStateSnapshot` already has. Treating Laptop Mode differently from
  normal-width under this flag — global for one, per-workspace for the
  other — would be a second, harder-to-explain rule layered on top of the
  first; a single flag covering both is simpler to reason about, and 0033's
  reasoning for keeping Laptop Mode per-workspace _by default_ doesn't argue
  against a user deliberately opting both modes into sharing at once.
- **Seeding**: enabling the main flag (or the sub-setting) seeds the shared
  record from whatever's currently live — the active workspace's current
  arrangement — so opting in never wipes out a layout the user just set.
  Disabling seeds any workspace that has _no_ frozen arrangement of its own
  (created while the flag was on) from the shared record at that moment,
  rather than snapping it to bare defaults.
- **Confirming the main flag's "on" transition**: enabling it unconditionally
  seeds from the active workspace (see above) — which, on a _second_ or later
  enable, silently discards whatever shared layout was frozen the last time
  it was turned off. The settings page confirms this first via
  `ctx.ui.showModal` (`GlobalPanelLayoutConfirm.tsx`): one line explaining
  that this overrides every workspace's layout with the active workspace's
  current one, an OK/Cancel footer, and — only when a previously-saved shared
  layout exists (`hasSavedGlobalPanelLayout()`) — a checkbox to restore that
  instead of overwriting it (`enableGlobalPanelLayout("previous")`, which
  applies the saved record to live without re-capturing it; unchecked is
  `enableGlobalPanelLayout("current")`, today's default). Cancelling leaves
  the flag off either way. The sub-setting has no equivalent prompt — its own
  stored value is always low-stakes enough to just overwrite (see
  "Alternatives considered").

## Postscript (2026-08-08 update)

Dave noticed enabling the flag a second time silently overwrote a shared
layout he'd built up previously, with no warning — the confirmation above was
added the same day to fix that gap. `setGlobalPanelLayoutEnabled(true)`
remains as a plain-boolean convenience (equivalent to
`enableGlobalPanelLayout("current")`, no prompt) for callers that don't need
the choice, e.g. tests.

## Consequences

- Users who want one side-dock arrangement across every workspace get it
  without losing their per-workspace history — turning the flag back off is
  non-destructive.
- The live store gains one more thing to reason about: while the flag is on,
  `savePanelStateToWorkspace`/`loadPanelStateFromWorkspace` (state/workspaces.ts)
  branch to skip the arrangement fields for per-workspace capture/apply, and
  `doPersist()` (state/persistence.ts) must avoid merging the _live_ shared
  arrangement into the active workspace's own persisted record — that would
  silently overwrite its frozen snapshot on every autosave.
  `withActiveNonGlobalPanelState` (state/persistence-model.ts) exists
  specifically to prevent that leak.
- `store.globalPanelLayout` is deliberately **not** kept continuously
  synchronized with live edits — it's only (re)captured from live state when
  the flag is turned off (to freeze the final value) and at persist time (to
  write it to disk). An ordinary workspace switch while the flag is on
  doesn't touch the arrangement fields at all, since they already show the
  correct shared arrangement; applying the (possibly stale) global record on
  every switch was tried and rejected during implementation — it clobbered
  live edits made since the last sync.
- 0033's original rejection of a "global Laptop Mode layout" no longer holds
  as stated; that ADR has been updated to point here instead of standing
  uncorrected next to code that does exactly what it once rejected.

## Alternatives considered

- **Merge-on-write instead of frozen dual-state** — rejected: every live edit
  while the flag is on would immediately overwrite the active (or every)
  workspace's own stored arrangement, so turning the flag back off would
  leave no memory of what each workspace looked like beforehand. Frozen
  dual-state keeps that reversible.
- **Exclude Laptop Mode from the flag's scope** (global for normal-width
  only) — rejected: treating the two modes differently under one flag is a
  second rule to learn on top of the first, for no benefit users asked for.
- **A single combined setting instead of a main flag + dependent sub-setting**
  for `activeSidePanelTabs` — rejected: which side-panel tab is frontmost is
  a much more visible, opinionated thing to force-share than arrangement: a
  user might want the _panels_ shared but still want to be looking at
  different tabs in different workspaces. Splitting it into its own opt-in
  keeps the main flag's blast radius smaller by default.
- **Always silently overwriting the shared record on enable, no confirmation**
  (the original shape of this ADR) — rejected after real use: a second enable
  discarding a previously-built shared layout with no warning was surprising
  enough to file as a bug the same day.
- **Prompting for the sub-setting too** — rejected: `activeSidePanelTabs` is
  one flat map, not worth a second confirmation dialog for; overwriting it is
  cheap to notice and cheap to redo.

## References

- Supersedes part of [0033](./0033-laptop-mode-independent-layout.md)'s
  "Alternatives considered" (the global-Laptop-Mode rejection).
- Related: [0022](./0022-on-disk-storage-layout.md) (where global vs.
  per-workspace state is persisted — this feature's shared record lives in
  the same `app-state.json` index as `smallScreenModeEnabled`).
