---
status: implemented # draft | accepted | implemented | rejected | superseded-by NNNN
created: 2026-10-15
---

# 0063. `PanelService.focus` / `EditorService.focus` — revealing a tab by id

## Summary

An extension that lists tabs across workspaces and lets the user click through to
one (a Navigator view) can do that for a terminal (`TerminalService.focus`) and a
workspace (`WorkspaceService.activate`), but not for a dock panel or an editor tab
that is already open. This proposes two point verbs, each mirroring
`TerminalService.focus`, to close that gap:

- `PanelService.focus(panelId: string): void`
- `EditorService.focus(editorId: string, opts?: { workspaceId?: string }): void`

## Motivation

`follow-ups` (`silo-code/silo-extensions`, 0.3.0) adds a cross-workspace Navigator
view listing every flagged tab. Terminal and file-backed-editor rows jump
correctly; dock-panel rows and untitled/diff editor rows can only activate the
owning workspace and stop there, with a tooltip explaining why. Any extension
that does "list tabs across workspaces, click to go there" hits the same wall —
that's the point of a Navigator view.

Checked against `@silo-code/sdk` current `src` (not just the published
0.50.0 build):

| Target                 | Verb                                        | Works?                   |
| ---------------------- | ------------------------------------------- | ------------------------ |
| terminal               | `TerminalService.focus(terminalId)`         | yes, cross-workspace     |
| file-backed editor     | `EditorService.open(path, { workspaceId })` | yes, focuses an open tab |
| untitled editor / diff | —                                           | **no**                   |
| dock panel instance    | —                                           | **no**                   |
| workspace              | `WorkspaceService.activate(id)`             | yes                      |

Why the two gaps aren't a workaround away:

- `PanelService extends TabAdornmentMethods {}` (`packages/sdk/src/panel-service.ts`)
  is tab chrome only — no activation verb.
- `LayoutService.openPanel(kindId, params, { singleton: true })` focuses by
  **kind**, and a singleton panel's id equals its `kindId` per its own docblock.
  A recorded panel is UUID-keyed, so this call doesn't match an existing one — it
  opens a _second_ tab instead of focusing the first.
- `EditorService` has `open` / `openUntitled` / `openDiff` but no
  `focus(editorId)` (`packages/sdk/src/editor-service.ts`). An untitled buffer has
  no path to re-open by. A diff tab is unreachable too: its provider args live on
  the `EditorRecord`, and there is no way to reconstruct the original `openDiff`
  call from them.

There is already a host-internal precedent for exactly this shape:
`agents-service.ts`'s `reveal(id)` activates the owning workspace and then either
calls the session's own `reveal()` callback or `TerminalService.focus` — "switch
workspace, then focus the specific thing" is not a new pattern, just not exposed
publicly for panels or editors.

## Design

```ts
interface PanelService extends TabAdornmentMethods {
  /**
   * Switch to the panel's owning workspace and bring its dock tab to the
   * front. No-op if `panelId` names no open panel.
   */
  focus(panelId: string): void;
}

interface EditorService extends TabAdornmentMethods {
  // ...existing members...

  /**
   * Switch to the editor's owning workspace and bring its tab to the front —
   * including an untitled buffer or a diff view, neither reachable by
   * re-calling `open`. No-op if `editorId` names no open editor.
   */
  focus(editorId: string, opts?: { workspaceId?: string }): void;
}
```

Both mirror `TerminalService.focus`'s existing contract (activate workspace,
then bring the tab to front; silent no-op on an unknown id) rather than
inventing a new shape. `EditorService.focus` takes an optional `workspaceId`
hint for parity with `OpenFileOptions`, since an editor id alone is not always
enough to disambiguate quickly on the host side (mirrors how `open` accepts the
same hint).

### Two related fixes bundled in

- **`recordId` on `MenuContext["panel/tab"]` and `ToolbarItemContext["panel"]`.**
  Both currently hand an extension only `panelId`
  (`DockPanelRecord.panelId` — host-composed, restamped on every load, explicitly
  not persisted identity, per RFC 0046). An extension that persists anything
  per-panel must rebuild its own `panelId → DockPanelRecord.id` index from
  `Workspace.panels` on every load. `follow-ups` carries exactly that index
  today; adding `recordId` to both contexts removes it.
- **Doc fix:** `TerminalService.focus`'s JSDoc block is orphaned above
  `getTabMenuItems` (`packages/sdk/src/terminal-service.ts` — the comment for
  `focus` sits over the wrong method), so the verb ships effectively
  undocumented. Re-anchor it to `focus`.

## Alternatives considered

- **Wait for RFC 0041's Phase 3** (folding `editors` / `terminals` / `panels`
  into one list) and ship a single `focus(tabId)` instead of three per-service
  verbs. RFC 0041 left Phase 3 deferred "if Phase 1–2 shows the split earning
  nothing," and nothing since (RFC 0046 through 0062) has reopened it —
  `editors` and `terminals` still carry domain-specific fields (`filePath`, a PTY
  session id) that `panels.state` deliberately doesn't, and that split hasn't
  caused pain on its own. Betting a concrete, shippable fix on a unification
  that has no current champion or forcing case is the wrong trade. Deferred —
  not rejected: if Phase 3 does land later, these three verbs collapse into one
  `focus(tabId)` naturally, the same way three enumeration lists could.
- **Reuse `LayoutService.openPanel({ singleton: true })` for panels.** Rejected
  — singleton matching is by `kindId`, not by a specific panel instance; calling
  it on a UUID-keyed recorded panel opens a duplicate tab rather than focusing
  the existing one.
- **Do nothing; let extensions work around it.** The `follow-ups` tooltip
  explaining why a row doesn't jump is the status quo, and it degrades the one
  thing a cross-workspace tab list exists to do.

## Decision

Accepted and implemented as designed above, with one addition surfaced
during implementation: a shared `focusDockPanel(workspaceId, panelId)` helper
(`packages/extension-host/src/extension-host/focus-dock-panel.ts`) now backs
all three `focus()` verbs — `PanelService.focus`, `EditorService.focus`, and
`TerminalService.focus` (refactored onto it in the same change). The subtle
part of this verb was never the lookup; it's the cross-workspace race against
`WorkspaceDock`'s own active-panel restore (ADR 0034), already solved once for
terminals. Extracting it means that logic lives in exactly one place instead
of being copied twice more, and makes the "collapse to one `focus(tabId)`
later" path in Alternatives a near-trivial follow-up if RFC 0041's Phase 3
ever ships — the three callers already share every line but the id lookup.

No ADR: this is additive SDK surface following an existing precedent
(`TerminalService.focus`), not a new architectural decision.

Verified with `pnpm test` (2452 passed in `@silo-code/extension-host`, full
workspace `pnpm test` green), `pnpm --filter silo exec tsc --noEmit`, and
`pnpm lint`. New/changed coverage: `focus-dock-panel.test.ts` (the shared
race/timing behavior, moved and generalized from the old
`terminal-service.test.ts` suite), `panel-service.test.ts` and
`editor-service.test.ts` (each service's own id resolution + delegation),
`terminal-service.test.ts` (thinned to the same delegation shape),
`panel-tab-menu.test.ts` (the new `recordId` field, present for a recorded
kind and `undefined` for a transient one).

Docs: `apps/docs/api/editors/index.md` and `apps/docs/api/state/panels.md`
gained a `focus` row in their Methods tables (mirroring the existing
`ctx.terminals.focus` row in `apps/docs/api/state/terminals.md`);
`pnpm docs:api` regenerated the type reference. No roadmap change —
`ctx.panels` and `ctx.editors` are already `stable` rows; this adds a method,
not a new primitive.

## Related

- RFC 0041 — `DockPanelRecord`. Its Phase 3 (folding `editors`/`terminals`/`panels`
  into one list) remains deferred; this RFC does not revisit that question — it
  adds point verbs on the three existing services instead, each a trivial
  collapse into one `focus(tabId)` later if Phase 3 ever ships.
- RFC 0046 — generic dock-panel tabs. Source of `DockPanelRecord.panelId`, the
  `"panel/tab"` menu, and `ctx.panels` — this RFC extends both with `recordId`
  and `focus`.
- `TerminalService.focus` — the existing verb both new methods mirror.
- RFC 0064 — the write-side (`focus`) companion's read-side counterpart: active
  dock-panel state on `ctx.panels`, and a `ReactiveService`-consistent
  `ctx.terminals`. Reuses this RFC's `recordId` field shape on `ActivePanelInfo`.
