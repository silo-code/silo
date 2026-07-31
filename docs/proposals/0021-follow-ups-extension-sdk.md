---
status: accepted
created: 2026-07-30
# supersedes:
# superseded-by:
---

# 0021. Follow-ups extension — generic toolbar + tab-decoration SDK

## Summary

Enable a third-party **Follow-ups** extension — mark CenterDock editor/terminal
tabs to come back to later — by adding two **generic** SDK contribution surfaces
(`ctx.registerToolbarItem`, `ctx.registerTabDecoration`) and finishing host
wiring for `editor/tab` / `terminal/tab` context menus. Follow-up is **extension
vocabulary only**; the SDK stays domain-agnostic. Workspace rollup reuses
existing `ctx.workspaces.registerStatus`. This RFC locks product rules and the
`ctx` gaps so an implementer can ship without further product fog. It does
**not** ship the extension or implement the SDK.

Wayfinding: [Follow-ups extension: SDK + product design](https://github.com/silo-code/silo/issues/301).

## Motivation

Developers juggling agents across workspaces interrupt a finished terminal (or
an editor tab), jump elsewhere, and lose the thread. They need a lightweight
“come back to this” mark that:

- shows on the **tab** when scanning a group,
- rolls up on the **workspace** row when scanning the Workspaces panel,
- is set/cleared manually from the panel chrome and/or the tab menu,
- survives app restart while the panel still exists.

Building this as a **bundled core feature** would bake product language into the
host. Building it as an extension requires SDK seams that don’t exist today:

| Need                              | Today                                                                 | Gap                                                                             |
| --------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Toolbar toggle on editor/terminal | Host-owned ViewSwitcher / optional breadcrumbs only                   | No contribution API                                                             |
| Tab flag on editors               | `ctx.terminals.registerTabDecoration` only; `DockTab` ignores editors | No dock-generic decoration API                                                  |
| Tab context menu                  | Types exist; `DockTab` rename-only / no contribution dispatch         | Host wiring ([RFC 0013](./0013-context-menu-contributions.md) surfaces planned) |
| Workspace rollup                  | `ctx.workspaces.registerStatus`                                       | None — reuse                                                                    |

## Design

### Separation of concerns

- **SDK / host:** generic contributions — toolbar items, tab decorations, context
  menus, workspace status. No `followUp` types or APIs.
- **Follow-ups extension:** product language, persistence, glyphs, copy, and
  which contributions it registers.

Toolbar contributions and context-menu contributions are **independent**. An
extension may register only menus, only toolbar items, both, or neither.
Follow-ups chooses both.

### Affordance stack (Follow-ups)

| Job              | Affordance                                                                             |
| ---------------- | -------------------------------------------------------------------------------------- |
| Mark / clear     | Toolbar toggle (when breadcrumbs on) **and** always-on tab context menu (same command) |
| See later (tabs) | Tab decoration (flag)                                                                  |
| See later (ws)   | `registerStatus` row when count ≥ 1                                                    |

### Product rules (Follow-ups extension)

| Area            | Rule                                                                                                                                                                                                       |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit of mark    | CenterDock **panel** (editor or terminal tab). Workspace signal is derived.                                                                                                                                |
| Markable        | Any editor or terminal tab (including diffs and untitled).                                                                                                                                                 |
| Persistence     | `ctx.storage.workspace`, keyed by `EditorRecord.id` / `TerminalRecord.id`. Survive restart while the panel exists; clear when the id leaves the workspace’s editors/terminals list. Manual set/clear only. |
| Status row      | Only when ≥1; label `"1 follow-up"` / `"N follow-ups"`; `status: "warn"`.                                                                                                                                  |
| Tab decoration  | Flag icon; `color: "warn"`; tooltip `"Follow-up"`.                                                                                                                                                         |
| Toolbar labels  | Compact `"Follow-up"` with `checked` for on/off.                                                                                                                                                           |
| Menu labels     | `"Mark as follow-up"` / `"Clear follow-up"` (paired verbs).                                                                                                                                                |
| Breadcrumbs off | Toolbar items hidden (generic host gate). Context menu remains available. No hint UI.                                                                                                                      |
| Context menu    | Always registered on `editor/tab` and `terminal/tab`, including when breadcrumbs (and toolbar items) are on. Duplicate affordance is intentional.                                                          |

### Host prerequisite: tab context menus

Before the menu half of the stack works, `DockTab` must:

1. Open a real context menu on right-click (not rename-only).
2. Include **Rename** as a built-in menu item.
3. Append contributions via `contextMenuEntriesFor("editor/tab" | "terminal/tab")`
   with the typed [`MenuContext`](../../packages/sdk/src/types.ts) targets.

Registration APIs already exist; dispatch does not. See research on map ticket
[Research: context-menu readiness for editor/tab and terminal/tab](https://github.com/silo-code/silo/issues/303).

### SDK: `ctx.registerToolbarItem`

Top-level registration (alongside `registerMenuItem` / `registerContextMenuItem` /
`registerStatusItem`), not per-domain and not a new `ctx.dock`.

```ts
type ToolbarSurface = "editor" | "terminal";

interface ToolbarItemTarget {
  // Discriminated by surface at registration time:
  // editor  → { editorId: string }
  // terminal → { terminalId: string }
}

interface ToolbarItemContribution {
  id: string;
  /** One surface per registration. Register twice to appear on both. */
  surface: ToolbarSurface;
  command: string;
  icon?: React.ReactNode;
  tooltip?: string;
  label?: string;
  order?: number; // within the trailing cluster
  when?: (ctx: ContextKeys, target: ToolbarItemTarget) => boolean;
  checked?: (ctx: ContextKeys, target: ToolbarItemTarget) => boolean;
}

interface ExtensionContext {
  registerToolbarItem(item: ToolbarItemContribution): Disposable;
  invalidateToolbarItems(): void;
}
```

**Host chrome**

- **Editor:** trailing cluster inside `EditorBreadcrumb`, immediately left of
  host-owned `ViewSwitcher` (do **not** migrate ViewSwitcher into contributions).
- **Terminal:** trailing cluster at the right end of the breadcrumb/toolbar row.
- Contributions render **only while that surface’s breadcrumbs setting is on**.
  When off, the trailing cluster does not appear (path breadcrumbs already
  unmount the terminal bar entirely today).
- Command-backed only — host renders kit `IconButton`s. No custom React item
  components in v1.
- Re-query `when` / `checked` on panel render **and** on `invalidateToolbarItems()`.
- **No** public list/render API for arbitrary custom CenterDock panels in v1
  (deferred until a real consumer needs it). Core editor + terminal are the
  only hosts.

**Follow-ups usage:** two registrations (editor + terminal) sharing one toggle
command.

### SDK: `ctx.registerTabDecoration` (dock-generic)

Lift tab decorations off the terminal-only API onto a top-level contribution.
Decoration **visual** contract stays the same (`icon`, optional `tooltip`,
optional semantic `color`).

```ts
type TabDecorationTarget = {
  kind: "editor" | "terminal";
  id: string; // EditorRecord.id / TerminalRecord.id
};

interface TabDecoration {
  icon: React.ReactNode;
  tooltip?: string;
  color?: "accent" | "warn" | "ok" | "error" | "muted";
}

interface TabDecorationProvider {
  id: string; // conventionally "<extension-id>.tab-decoration"
  provide(target: TabDecorationTarget): TabDecoration | null;
}

interface ExtensionContext {
  registerTabDecoration(provider: TabDecorationProvider): Disposable;
  invalidateTabDecorations(): void;
  // Host/subscribe helpers as needed for DockTab (mirror today's terminal API)
}
```

**Behavior**

- `DockTab` queries for both `editor:` and `terminal:` panels.
- **Stacking:** each provider may contribute at most one decoration per tab;
  the host **concatenates** all non-null results in registration order.
  This **breaks** today’s exclusive first-wins policy on
  `ctx.terminals.registerTabDecoration` (intentional).
- Invalidation remains **global** (`invalidateTabDecorations()`).
- v1 kinds are **editor and terminal only**. Custom `DockPanelKind` tabs are out.

**Compat:** `ctx.terminals.registerTabDecoration` remains a thin shim:

`provide(terminalId)` → adapter calls the generic registry with
`{ kind: "terminal", id: terminalId }`. Existing consumers (e.g. terminal-monitor)
keep compiling. Prefer documenting the top-level API as canonical going forward.

### Reuse (no new SDK)

- **Workspace rollup:** `ctx.workspaces.registerStatus` + `invalidateStatus`.
- **Commands / menus:** existing `registerCommand` + `registerContextMenuItem`
  once tab surfaces dispatch.
- **Storage:** `ctx.storage.workspace`.

### Implementation sketch (ordering)

1. Wire `DockTab` context menus (`editor/tab`, `terminal/tab`) + Rename item.
2. Land `registerTabDecoration` (generic) + shim terminals API + `DockTab` for
   editors; switch stacking behavior; tests.
3. Land `registerToolbarItem` + editor/terminal trailing clusters + breadcrumbs
   gate + invalidate; tests.
4. Roadmap badges + docs (`pnpm docs:api`, member pages).
5. Follow-ups extension (separate effort / repo) against the published SDK.

### Out of scope for this RFC

- Shipping the Follow-ups extension or choosing its packaging home.
- Migrating Text \| Preview `ViewSwitcher` into the contribution model.
- Public custom-panel toolbar host (`listToolbarItems` / blessed renderer).
- Clickable workspace status rows / jump-to-follow-up navigation.
- StatusBar ambient chip (`registerStatusItem`).
- Auto-mark / auto-suggest when an agent goes idle.
- Workspace-level follow-ups independent of panel marks.
- Tab-decoration kinds beyond editor/terminal; priority caps; scoped invalidate.
- Mandating host-drawn breadcrumbs on every CenterDock panel.

## Alternatives considered

| Alternative                                                  | Why it loses                                                                                       |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Bundled Follow-ups in core                                   | Product language in the host; map destination is extension + generic SDK.                          |
| `ctx.editors` + `ctx.terminals` twin toolbar/decoration APIs | Duplicates registries; map preferred dock-generic decorations and top-level toolbar contributions. |
| Custom React toolbar item components                         | Inconsistent chrome; YAGNI until a real need.                                                      |
| Always-on terminal toolbar when breadcrumbs off              | Rejected in grilling — keep generic breadcrumbs gate; menus cover set/clear.                       |
| First-wins tab decorations (status quo)                      | Rejected — stack all non-null providers so multiple extensions can decorate.                       |
| Menu-only Follow-ups (no toolbar)                            | Valid for _other_ extensions; Follow-ups product wants both.                                       |
| Persist by `filePath` / title / `sessionId`                  | Unstable across view-switch, rename, PTY recreate — research locked record ids.                    |

## Decision

**Accepted** for implementation (wayfinding map
[#301](https://github.com/silo-code/silo/issues/301)). SDK + host land in-tree;
the Follow-ups product extension remains a separate effort against this surface.
