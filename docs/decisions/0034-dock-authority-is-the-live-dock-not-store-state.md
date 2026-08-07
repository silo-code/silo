---
status: proposed
date: 2026-08-07
---

# 0034. The dock authority is the live dock, not `store.activeWorkspaceId`

## Context

ADR [0032](./0032-dock-active-panel-authority.md) made `WorkspaceDock` the
single authority over its own active panel: nothing outside it calls
`panel.api.setActive()` on a workspace switch, callers record a request via
`panel-activation-requests.ts`, and `WorkspaceDock`'s authority effect applies
it once its dock is live.

That fix shipped with a regression test
(`cross-workspace-terminal-focus.it.test.ts`) that always drives the jump
through `ctx.terminals.focus()` alone. It never covered a caller that first
calls `ctx.workspaces.activate()` and then, in the same tick, calls
`ctx.terminals.focus()` — exactly the shape `agent-inspector`'s Navigator row
click uses (`openAndFocus()`), and per RFC 0023 the shape the real
(closed-source, not in this repo) agent-monitor extension's Navigator agent
list uses too. The bug came back in three reported flavors:

1. Switch workspace A → B → A: A's remembered tab is no longer active.
2. Click an agent running in a backgrounded workspace from the Navigator: the
   correct terminal tab never actually activates (not even a flash — it
   silently no-ops).
3. Alt-tab to another macOS app and back: a different tab ends up focused than
   the one active before switching away.

A test harness was built to reproduce each of these against current code
before any fix landed
(`cross-workspace-activate-then-focus.it.test.ts`,
`workspace-revisit-active-tab.it.test.ts`, `window-focus-restore.it.test.ts`).
Results:

- **Symptom 2 reproduced deterministically** — every round, no timing luck.
  Root cause: `terminal-service.ts`'s `focus()` gated its cross-workspace
  branch on `store.activeWorkspaceId !== wsId`. A caller that already flipped
  `store.activeWorkspaceId` itself (`ctx.workspaces.activate()`, one line
  earlier) makes that check `false` before React has actually committed the
  new dock as live (`WorkspaceDock`'s authority effect calls
  `setActiveDockApi()` only after that commit). `focus()` then takes the
  "same workspace, dock already up" fast path, finds no panel on the still-old
  dock API, and no-ops — `requestPanelActivation()`, the only sanctioned way
  to register a cross-workspace intent, is never called. The request isn't
  raced and lost, as ADR 0032's bug was; it's dropped entirely.
- **Symptom 1 did NOT reproduce** — 5 runs × 6 rounds × 2 scenarios (bare
  A→B→A revisit, and revisit after a terminal is added to A while
  backgrounded) = 60/60 passed. The leading hypothesis (an un-gated
  `setActive()` in `WorkspaceDock`'s panel-reconciliation effect force-
  activating a newly-added panel in a backgrounded dock) doesn't hold up
  empirically. No fix shipped for this; noted below as investigated but
  unconfirmed.
- **Symptom 3's mechanism is confirmed by reading the source**, but live
  numeric reproduction wasn't obtainable in the environment this was built in
  — the dev app window couldn't hold OS focus for even a few hundred
  milliseconds across 8 automated attempts (unexplained; possibly something
  specific to that machine/session). `focus-restore.ts`'s `record()` recorded
  the last `focusin` anywhere under `.side-pane, .center-body, .status-bar` —
  and `CenterDock.tsx` keeps every visited workspace mounted as a sibling
  `.dock-host` inside that same shared `.center-body`, only toggling
  `data-active`, so that selector can't tell a backgrounded dock's element
  from the foreground one's. `restoreRegionFocus()` then called `.focus()` on
  whatever `lastFocused` held directly, bypassing the authority/request system
  entirely.

## Decision

**The dock authority a caller must check is the live dock, not
`store.activeWorkspaceId`.** Concretely:

1. `dock-api-registry.ts` now tracks which workspace id the live `DockviewApi`
   actually belongs to (`getActiveDockWorkspaceId()`), set only from
   `WorkspaceDock`'s own authority effect at the moment it commits
   `setActiveDockApi()`. `terminal-service.ts`'s `focus()` checks this instead
   of `store.activeWorkspaceId`, so it's correct regardless of caller
   ordering — a caller can pre-activate the workspace itself and `focus()`
   still takes the cross-workspace (request-registry) path until the real
   dock is confirmed live. `agent-inspector`'s `openAndFocus()` was simplified
   to drop its now-fully-redundant `ctx.workspaces.activate()` pre-call, but
   that's cleanup, not the fix — the real agent-monitor extension has the
   identical shape and isn't in this repo, so `ctx.terminals.focus()` had to
   be correct standing alone.
2. `focus-restore.ts`'s `record()`/`restoreTarget()` now scope to the live
   dock: an element inside a `.dock-host[data-active="false"]` is never
   recorded as `lastFocused`, and `restoreTarget` re-checks scope as defense
   in depth. `restoreTarget` keeps its pure-function shape with an injectable
   scope predicate, so its unit tests stay jsdom-only.
3. Symptom 1 is left **unfixed** — investigated via the same harness, not
   reproduced. If it recurs with a concrete trigger, that trigger is the next
   thing to capture in a test before touching code again.

## Consequences

- `ctx.terminals.focus()` — and by extension any future cross-workspace
  "activate this panel" API — is now robust to being called immediately after
  a separate `ctx.workspaces.activate()` call, closing a footgun every
  extension with this jump-to-a-terminal-in-another-workspace shape (not just
  `agent-inspector`) was exposed to.
- Window-focus restoration can no longer silently drag the active tab into a
  backgrounded workspace — a `.dock-host`'s `data-active` attribute (already
  set by `CenterDock.tsx` for other reasons) is now load-bearing for a second,
  independent purpose.
- Symptom 3's fix shipped without a pre-fix live numeric baseline — the
  mechanism is source-confirmed and unit-tested, but the "how often did it
  actually flip the tab" number wasn't captured. Re-run
  `window-focus-restore.it.test.ts` with the window genuinely frontmost when
  that's practical, to get the post-fix consistency number the original plan
  called for.
- Symptom 1 stays open. Three symptoms were reported; two had confirmed,
  fixable root causes. The harness exists (`workspace-revisit-active-tab.it.test.ts`)
  for whoever picks this back up.

## Alternatives considered

- **For Fix A**: promote the desired active panel into the store
  (`ws.activePanelId`) instead of adding a second module-level "which
  workspace is live" tracker. ADR 0032 already considered and deferred this
  for the same reason it would apply here: `layout(force=true)` produces
  spurious active-panel changes a store write-back would need to filter,
  reintroducing the ordering assumptions this whole area keeps tripping on.
- **For symptom 1**: ship the panel-reconciliation `active`-gating fix
  speculatively anyway, on the theory the harness just didn't hit the right
  trigger. Rejected — shipping an unconfirmed fix for an unconfirmed cause
  risks masking the real one; better to leave it open and documented.

## References

- ADR [0032](./0032-dock-active-panel-authority.md) — the authority model this
  extends.
- `apps/desktop/src/automation/cross-workspace-activate-then-focus.it.test.ts`,
  `workspace-revisit-active-tab.it.test.ts`, `window-focus-restore.it.test.ts`
  — the reproduction harness.
- `packages/extension-host/src/extension-host/terminal-service.ts` (`focus()`),
  `packages/extension-host/src/docked/dock-api-registry.ts`
  (`getActiveDockWorkspaceId`), `packages/extension-host/src/extension-host/focus-restore.ts`
  (`record`/`restoreTarget`).
