---
status: proposed
date: 2026-08-07
---

# 0034. Focus and activation authority: the live dock, and only the active panel

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
- **Symptom 1 resisted every scripted reproduction** — 60/60 rounds passed
  across two hypotheses (bare A→B→A revisit; revisit after a terminal is added
  to a backgrounded workspace), and a later split-dock scenario passed too.
  Three successive hypotheses were formed and each **disproved by reading the
  source** rather than shipped: (a) `WorkspaceDock`'s panel-reconciliation
  effect force-activating a backgrounded panel; (b) `DockPanelApi.isActive`
  being group-scoped so a lone panel in its own split group never blurs —
  disproved, `isActive` is `group.api.isActive && isPanelVisible`; (c) a
  stale-Monaco focus tracker surviving a workspace switch — disproved,
  `DockviewGroupPanelModel.setActive()` ends in `updateContainer()` →
  `panel.runEvents()`, which does propagate the deactivation.

  It was finally caught by instrumenting `HTMLElement.prototype.focus` at
  runtime to capture the **calling stack** of every focus grab. That named the
  culprit outright: `onMount` in `TextViewer.tsx`, via React's
  `commitHookPassiveMountEffects`. **Re-entering a workspace re-mounts every
  panel in its dock**, and the mount-time `retryFocus` in `TextViewer` /
  `DiffPanel` passed no `stillWanted` guard — so it defaulted to `() => true`
  and grabbed focus unconditionally, including for panels that are not the
  active tab. Because dockview marks a panel's group active whenever DOM focus
  lands inside it (`contentContainer.onDidFocus → doSetGroupActive`), that
  steal did not merely move keyboard focus — it changed the visible active tab.
  The trace showed the _correct_ guarded grab (WorkspaceDock's fallback →
  terminal) landing first, then the unguarded mount grab overriding it 33ms
  later.

  This is why it only surfaced with a split dock and only under real
  interaction: automation drives `ctx.terminals.focus()` without re-mounting a
  background editor alongside an active terminal.

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

Two invariants, one per half of the problem. **(i) The dock authority a caller
must check is the live dock, not `store.activeWorkspaceId`** — store state can
be flipped synchronously by a caller before React has committed the dock it
names. **(ii) Only the currently active panel may take focus** — and because
dockview makes a panel's group active whenever DOM focus lands inside it
(`contentContainer.onDidFocus → doSetGroupActive`), an unguarded focus grab is
never "just" a focus grab; it silently changes the user's visible tab.
Concretely:

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
3. **Only the active panel may take focus, and `retryFocus` enforces it.**
   `stillWanted` is now a **required** parameter rather than defaulting to
   `() => true`. Every correct call site already passed one (`() => api.isActive`,
   or the center dock's `focusGen` token); the permissive default was the
   footgun that let two mount-time sites silently omit it. Making it required
   turns a recurrence into a compile error instead of a silent focus steal.
   `TextViewer` and `DiffPanel` now gate their mount-time focus on
   `dockApi.isActive` both up front and for the life of the retry — matching
   `TerminalPanel`, which already did this correctly and served as the
   exemplar.

   The corollary worth internalizing: **mount is not "the user just created
   this panel."** Re-entering a workspace re-mounts every panel in its dock, so
   any mount-time side effect that touches focus must ask whether it is the
   active tab first.

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
- Mount-time focus is now a guarded operation everywhere, which costs one
  `isActive` check per panel mount and removes a whole class of "something
  stole my tab" bugs. The tradeoff: a panel that legitimately wants focus on
  mount while _not_ active can no longer get it — correct by construction
  here, but it means new panel kinds must activate first and focus second.
- Scripted UI automation could not reproduce symptom 1 at all (three separate
  harnesses, ~75 rounds). The generalizable lesson: automation that drives
  behavior through service APIs bypasses React mount/unmount cycles that real
  interaction triggers, so it is blind to mount-effect bugs. When a
  user-reported bug resists scripted reproduction, instrument the primitive
  itself (here, patching `HTMLElement.prototype.focus` to capture calling
  stacks) rather than adding more scenarios — three hypotheses were disproved
  by reading source, and the fourth was found in one traced reproduction.

## Alternatives considered

- **For Fix A**: promote the desired active panel into the store
  (`ws.activePanelId`) instead of adding a second module-level "which
  workspace is live" tracker. ADR 0032 already considered and deferred this
  for the same reason it would apply here: `layout(force=true)` produces
  spurious active-panel changes a store write-back would need to filter,
  reintroducing the ordering assumptions this whole area keeps tripping on.
- **For symptom 1**: ship one of the three unproven hypotheses (the
  panel-reconciliation `active` gate; a dock-wide blur-on-tab-switch; re-blurring
  backgrounded panels after every forced relayout). Two of these were actually
  built and tested live — both failed to fix it, because none addressed the real
  cause. Rejected on principle as well as evidence: an unconfirmed fix for an
  unconfirmed cause masks the real one and leaves dead defensive code behind.
- **For symptom 1**: fix only the two offending call sites, leaving
  `retryFocus`'s `stillWanted` optional. Rejected — the permissive default is
  what allowed the omission in the first place, and nothing would stop the next
  mount-time focus call from repeating it. Making the parameter required moves
  the guarantee from review-time vigilance to compile time.

## References

- ADR [0032](./0032-dock-active-panel-authority.md) — the authority model this
  extends.
- `apps/desktop/src/automation/cross-workspace-activate-then-focus.it.test.ts`
  — the live regression guard for the confirmed, deterministic symptom 2.
- `packages/extension-host/src/extension-host/use-focus-retry.test.ts` →
  "never grabs on mount when the panel is not the active tab" — the real
  regression guard for symptom 1 (deterministic; the integration harnesses
  never reproduced it).
- `apps/desktop/src/automation/workspace-revisit-active-tab.it.test.ts`,
  `workspace-revisit-split-dock.it.test.ts`, `window-focus-restore.it.test.ts`
  — end-to-end coverage of the reported scenarios. Useful, but each passed
  against the broken build; see the honesty note in the split-dock file.
- `packages/extension-host/src/extension-host/terminal-service.ts` (`focus()`),
  `packages/extension-host/src/docked/dock-api-registry.ts`
  (`getActiveDockWorkspaceId`), `packages/extension-host/src/extension-host/focus-restore.ts`
  (`record`/`restoreTarget`).
