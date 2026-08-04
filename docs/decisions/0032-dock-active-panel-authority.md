---
status: accepted
date: 2026-08-04
---

# 0032. One authority decides a workspace dock's active panel

## Context

Which tab is active in a workspace's center dock was decided by whoever called
`panel.api.setActive()` last. On a workspace switch that was three independent
actors, none of them aware of the others:

1. `WorkspaceDock`'s activation effect, restoring the panel the workspace was
   last visited on, plus a delayed focus pass.
2. `relayoutAndRefit`, two animation frames later, re-asserting whatever
   `api.activePanel` was when it ran (it has to: `layout(force=true)` can hand
   active status to the wrong panel).
3. Any caller outside the dock — `ctx.terminals.focus(id)` for a terminal in a
   different workspace — which activated the workspace and then called
   `setActive()` behind a flat `setTimeout(80)`, a guess at how long the
   destination dock takes to mount.

Nothing sequenced (1) and (3), so the outcome depended on frame timing, tab
count, and render cost: the requested tab activated for a moment and then
switched away, or the remembered tab flashed first and then switched — measured
live at a ~70ms window of the wrong tab. The focus half compounded it, because
driving DOM focus into a panel activates it (dock focus tracking), so a
still-running focus retry aimed at the old panel could undo a correct
`setActive()` afterwards.

This was the second instance of the class: an earlier same-workspace variant
("clicking between two terminal rows focused the wrong one") was fixed by
scoping the focus grab to one panel's content element, but left the
cross-workspace activation race untouched.

## Decision

**`WorkspaceDock` is the single authority over which panel is active in its
workspace.** Nothing outside it calls `setActive()` as part of a workspace
switch. A caller that wants a specific panel records a _request_
(`docked/panel-activation-requests.ts`, keyed by workspace id); the dock reads
it in one place, through one pure resolver
(`resolveActivationTarget` in `panels/dock-helpers.ts`), with fixed precedence:

    explicit request > panel active when the workspace was last visited > leave dockview's pick

A request whose panel hasn't mounted yet (a first-visit dock restores its layout
and reconciles panels in later commits) reports _pending_ rather than falling
through to the remembered panel, and is applied from `onDidAddPanel` the moment
the panel appears. It is dropped when the workspace goes inactive, so it can
never fire on a later, unrelated visit.

Focus follows activation under the one existing focus-intent token
(`focusGen`/`focusPanelContent`): the dock's own focus pass now goes through it
too, so the newest intent deterministically supersedes an in-flight retry
instead of fighting it.

## Consequences

- No timer anywhere is keyed to a guessed mount latency, so there is no timing
  to tune and nothing to go flaky under load.
- New cross-surface "activate this panel" callers (an editor jump across
  workspaces, a future `ctx.editors.reveal`) have an obvious correct path:
  record a request. Reaching for `getActiveDockApi()` across a workspace switch
  is now the wrong shape by construction, not just by convention.
- The decision points are unit-testable without a live dockview: the resolver is
  pure and the request registry is a map.
- The dock's activation effect carries slightly more logic than before, and the
  request registry is module state outside the valtio store — deliberately, see
  below.

## Alternatives considered

- **Retime the timer** — replace `setTimeout(80)` with a real "dock has mounted"
  signal. Rejected: it sequences (3) after (1) but leaves two authorities, so
  the next actor added to the switch path reopens the bug.
- **Promote the desired active panel into the store** (`ws.activePanelId`, with
  write-back from `onDidActivePanelChange`). Purer as a single-source-of-truth
  model and would persist across restarts, but `layout(force=true)` produces
  spurious active-panel changes the write-back would record as user intent;
  suppressing them needs a flag around every programmatic `setActive()`, which
  reintroduces exactly the ordering assumptions this ADR removes. Deferred, not
  rejected — if per-workspace active-tab persistence is wanted later, this is
  the shape, on top of the single authority established here.

## References

- Issue [#320](https://github.com/silo-code/silo/issues/320) — the bug report.
- `packages/extension-host/src/docked/panel-activation-requests.ts`
- `packages/extension-host/src/panels/dock-helpers.ts` (`resolveActivationTarget`)
- `packages/extension-host/src/panels/WorkspaceDock.tsx` (activation effect)
- `packages/extension-host/src/docked/dock-api-registry.ts` (`focusGen`,
  `focusPanelContent`) — the focus-intent token this reuses.
- `apps/desktop/src/automation/cross-workspace-terminal-focus.it.test.ts` — the
  live regression guard (fails against the racing implementation).
- ADR [0021](./0021-keyboard-navigation-architecture.md) — the focus-region
  model the focus half plugs into.
