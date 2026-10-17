---
status: implemented # draft | accepted | implemented | rejected | superseded-by NNNN
created: 2026-10-15
---

# 0064. Active dock-panel state — `ctx.panels`, and a consistent `ctx.terminals`

## Summary

An extension could already ask "is this editor active" (`ctx.editors.getState().active`)
and "is this terminal active" (`ctx.terminals.getActive()`), but not "is this dock
panel active" — `ctx.panels` had no equivalent. This adds a `ReactiveService`-shaped
active-panel signal to `ctx.panels`, scoped to non-editor/non-terminal panel kinds so
it never false-positives, and brings `ctx.terminals` onto the same `ReactiveService`
shape `ctx.editors` already uses (`getState()`/`subscribe()`, additive — the existing
`getActive()`/`subscribeActive()` stay as working deprecated aliases).

## Motivation

The host already tracks exactly this fact — `WorkspaceDock` publishes the active
center-dock panel id for every kind (editor, terminal, or any other `DockPanelKind`)
on every active-panel change — but it lived inside the agents module
(`agent-surface-registry.ts`, `setActiveDockPanel`) as a `@internal` implementation
detail of Agent Session resolution, with no public surface. A `docs/acp-sprint-plan.md`
note had already flagged this as wrong (`setActiveDockPanel` "is not an agent
concept") and named the fix: relocate it "when a second [consumer] wants it." This is
that second consumer.

**Who's hitting it.** `silo-extensions/follow-ups` 0.3.0's Navigator view highlights
the row whose tab is current. `lib/active-tab.ts` states the gap directly: "the SDK
exposes an active editor and an active terminal, but nothing for the active panel of
an arbitrary kind... Returning `false` is the honest answer — better than guessing
from 'neither an editor nor a terminal is active, so it must be this panel', which
would light up every flagged panel row in the workspace at once." That correctness
concern — never false-positive — is load-bearing in the design below.

**The shape was also already inconsistent.** `ctx.editors` exposes active-editor
state as `getState()`/`subscribe()`, satisfying the SDK's
[`ReactiveService<T>`](../../packages/sdk/src/use-service-state.ts) contract, so
`useServiceState(ctx.editors)` works out of the box. `ctx.terminals` exposes the same
kind of fact as a `getActive()`/`subscribeActive()` pair that is _not_
`ReactiveService`-shaped. This is not a hypothetical cost: checked against the real
`silo-extensions` repo, both `agent-monitor` and `follow-ups` call
`ctx.terminals.getActive()`/`subscribeActive()` directly (8 call sites across the two
extensions), and `agent-monitor`'s `agents-panel.tsx` carries its own
`activeTerminalService()` helper whose only job is to wrap that pair into
`ReactiveService` shape. Adding a _third_, independently-sourced `ReactiveService` to
`ctx.panels` without fixing `ctx.terminals` would leave one inconsistent surface
standing right next to two consistent ones, for no reason tied to this change.

## Design

### `ctx.panels`: `ActivePanelInfo` and `getState()`/`subscribe()`

```ts
interface ActivePanelInfo {
  panelId: string;
  kindId: string;
  workspaceId: string;
  recordId?: string; // DockPanelRecord.id, when the kind is persistence: "recorded"
}

interface PanelService extends TabAdornmentMethods {
  focus(panelId: string): void; // RFC 0063
  getState(): ActivePanelInfo | null;
  subscribe(listener: (state: ActivePanelInfo | null) => void): Disposable;
}
```

`getState()` is `null` whenever the active center-dock tab is the built-in editor or
terminal — the same kind isolation `tabAdornmentMethodsFor("panel")` already enforces
for the adornment verbs. This is the mechanism behind `follow-ups`'s "never guess"
requirement: there is no state in which an editor being active reads as a panel being
active.

`recordId` mirrors the field RFC 0063 added to `MenuContext["panel/tab"]` and
`ToolbarItemContext["panel"]`, for the same reason — a consumer comparing against
`DockPanelRecord.id` (from `Workspace.panels`) shouldn't have to parse `panelId`
itself.

### Relocating the backing fact

`setActiveDockPanel`/the "active panel id, any kind" fact moves out of
`agent-surface-registry.ts` into its own module,
`extension-host/active-dock-panel-registry.ts` — mirroring the sibling
`active-terminal-registry.ts` this fulfills the ACP sprint plan's declined
alternative exactly as sketched: "the fact moves beside `active-terminal-registry.ts`
and the agents module derives from it." `agent-surface-registry.ts`'s
`resolveActiveSession()` now reads `getActiveDockPanel()?.panelId` instead of owning
the value. The registry also gained a `workspaceId` field it didn't carry before
(`WorkspaceDock` already knows its own `workspaceId` at the one call site that
publishes this fact, so it costs nothing to pass through) — `ctx.panels`'s
`workspaceId` field reads directly from it rather than reverse-deriving it from a
record lookup, which would fail for a transient (unrecorded) panel.

### Classifying a live panel id

`ActivePanelInfo.kindId`/`recordId` need a live dockview panel id split into
editor/terminal/panel, the thing `DockTab.tsx` already does inline for rendering.
`dock-panel-kinds.ts` gained `classifyPanelKind(panelId)`, returning `null` for an
`editor:`/`terminal:` id and `{ kindId, recordId? }` otherwise — reusing the existing
`parseRecordedPanelId` for a recorded kind, falling back to a bare `kindId` split for
a transient one (a singleton transient panel's id is just its `kindId`, per
`LayoutService.openPanel`'s own doc).

### `ctx.terminals`: additive `ReactiveService`, old pair deprecated in place

```ts
interface TerminalService extends TabAdornmentMethods {
  getState(): string | null; // NEW — ReactiveService-shaped
  subscribe(listener: (id: string | null) => void): Disposable; // NEW

  /** @deprecated Prefer getState() — identical value. */
  getActive(): string | null;
  /** @deprecated Prefer subscribe() — identical event. */
  subscribeActive(listener: (id: string | null) => void): Disposable;
}
```

Purely additive: the host implementation is the exact same two functions
(`getActiveTerminal`/`subscribeActiveTerminal`) bound under both names. No third-party
extension breaks — `getActive`/`subscribeActive` keep working unchanged, forever, if
an extension never updates. `apps/docs/guide/extension-checklist.md` and
`apps/docs/roadmap.md` now point at `getState()` as the recommended form.

### Deferred: a live panel title

`follow-ups` also wants a dock panel's live tab title (today it guesses via
`record.state.title`, a convention — the Agent Chat panel happens to persist its
title under that key, but `state` is documented as the panel's own bag the host never
inspects). Checked whether a cheap `PanelService.getTitle(panelId)` could ride along:
it can't, cheaply. `DockviewPanelApi.title` is live and readable, but only through
`getActiveDockApi()` — the _foreground_ workspace's dock. There is no
`workspaceId → DockviewApi` registry for background docks (only the reverse,
`api → workspaceId`, via a `WeakMap`), so reading a title cross-workspace would need a
new per-workspace dock-api registry, not a one-line addition. Left for a future
proposal; `follow-ups`'s existing convention is not disturbed by this change.

## Alternatives considered

- **One unified cross-kind active-tab signal** (`{panelId, kindId, workspaceId}` as
  the single source, with `ctx.editors`/`ctx.terminals` becoming thin filtered views
  over it) instead of three independently-shaped services that merely resemble each
  other. This is the theoretically simplest _eventual_ surface — the host already
  computes one fact for every kind — but was rejected for now on three grounds: (1) it
  is a permanent public commitment designed against one real consumer's need (a
  dock-panel-only gap), not a validated cross-kind one; (2) a new top-level primitive
  is a one-way door — SDK consumers pin versions (ADR on version asymmetry), so a
  wrong cut here is expensive to walk back; (3) it increases coupling for the next
  mistake — a kind-specific field some future consumer needs either leaks into every
  kind or forces an awkward union, versus a narrow addition to one service's own state
  shape today. Deferred, not rejected, same as RFC 0041's Phase 3 — if a second real
  consumer ever asks for the cross-kind union, `ActivePanelInfo`/`getState()` collapse
  into it easily, since the three services already derive from one host-internal fact.
- **Leave `ctx.terminals`'s shape alone, add only `ctx.panels`.** Rejected per the
  Motivation above — it would add a third inconsistent "ask what's active" shape next
  to two already-consistent ones, with real third-party extensions (`agent-monitor`,
  `follow-ups`) already paying for the inconsistency in hand-rolled adapters.
- **Match `ctx.terminals`'s existing pair shape on `ctx.panels`** (`getActive`/
  `subscribeActive`-style, not `ReactiveService`) for symmetry with the service it most
  resembles. Rejected — it propagates the one shape that doesn't satisfy
  `useServiceState`, in the same change that's fixing that exact problem on
  `ctx.terminals`.

## Decision

Accepted and implemented as designed above. `PanelService.getState()`/`subscribe()`
ship scoped to the "panel" kind; `TerminalService.getState()`/`subscribe()` ship as
additive `ReactiveService` members with `getActive()`/`subscribeActive()` kept as
deprecated, fully-functional aliases; `setActiveDockPanel` relocated to
`active-dock-panel-registry.ts`, fulfilling the `acp-sprint-plan.md` declined
alternative. `PanelService.getTitle` is explicitly deferred (see Design).

No new ADR: this follows the existing `ReactiveService` convention
(`use-service-state.ts`) rather than establishing a new decision, and the relocation
is an internal cleanup already scoped by the standing ACP sprint-plan note.

Verified with `pnpm test` (full workspace, all packages green — 2466 tests in
`@silo-code/extension-host`, up from 2452 before this change), `pnpm --filter silo
exec tsc --noEmit`, and `pnpm lint`. New/changed coverage: `active-dock-panel-registry.test.ts`
(the relocated fact's set/get/subscribe behavior, change-detection on either
field), `panel-service.test.ts` (`getState`/`subscribe` scoping — null for
editor/terminal, `recordId` present/absent, referential stability, change-only
notification), `terminal-service.test.ts` (`getState`/`subscribe` mirror
`getActive`/`subscribeActive` exactly), and the existing `agent-surface-registry.test.ts`
/ `acp-sessions-service.test.ts` / `agents-service.test.ts` suites updated for the
relocated import path (behavior unchanged, confirmed by all three suites staying
green).

Docs: `apps/docs/api/state/panels.md` gained an "Active panel" section and a
`getState`/`subscribe` Methods row; `apps/docs/api/state/terminals.md`'s "Active
terminal" section now leads with `getState`/`subscribe` and notes the deprecated
pair; `apps/docs/guide/extension-checklist.md`'s active-tab-fallback example and
`apps/docs/roadmap.md`'s two rows (`ctx.panels`, `ctx.terminals`) updated to match.
`pnpm docs:api` regenerated. `ctx.panels` stays `experimental` (unchanged by this
proposal — the experimental part is `DockPanelRecord.panelId`'s target-id
format, not these verbs); `ctx.terminals` stays `stable`.

## Related

- RFC 0063 — `PanelService.focus` / `EditorService.focus`, and the `recordId` field
  this proposal's `ActivePanelInfo` mirrors.
- RFC 0041 — `DockPanelRecord`; Phase 3 (one unified tab list) remains the thing the
  rejected "one unified signal" alternative above would most resemble, and remains
  deferred for the same reason.
- RFC 0046 — `ctx.panels`'s adornment methods and the kind-scoping this proposal's
  active-panel state reuses.
- ADR 0032 / ADR 0034 — dock active-panel _write_ authority. This proposal is
  read-only and doesn't touch either; cited here only so a reader doesn't confuse the
  two.
- `docs/acp-sprint-plan.md`'s "Considered and declined" note (`agent-surface-registry.ts`
  entry) — the relocation this proposal carries out.
