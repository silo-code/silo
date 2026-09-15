# Design — 0046. Generic dock-panel tabs

## Architecture

Everything but one file lands in `@silo-code/extension-host` and `@silo-code/sdk`.
`packages/extensions-silo/src/agents-chat-panel/` changes only to _consume_
`params.cwd` — it declares nothing to get rename or the tab menu, which is the point:
a third-party Chat panel must inherit both without knowing they exist.

## Components

**`extension-host/src/extension-host/panel-tab-menu.ts` (new).** The one builder for a
panel tab's menu, a direct mirror of `terminal-tab-menu.ts`:

```ts
buildPanelTabMenuItems(panelId, {
  workspaceId?: string;
  params?: Readonly<Record<string, unknown>>;
  onRenamed?: (name: string) => void;
}): MenuEntry[]
```

It resolves `kindId` from the panel id (`kind:id`, the same shape editors and terminals
use) and looks the kind up in `dockPanelKindRegistry` — like `buildTerminalTabMenuItems`
resolving its own owning workspace, rather than making the caller do it. Returns `[]`
when the kind is unknown, so `DockTab` shows nothing.

**Rename entry.** Emitted when `kind.renamable ?? kind.persistence === "recorded"`.
Uses the same `prompt()` from `modal-service` the terminal rename uses, with
`resetLabel` set only when an override exists, then calls `renamePanelRecord`.

**`renamePanelRecord(workspaceId, recordId, name)`** in `state/workspaces.ts`, beside
`setPanelRecordState`. Mirrors `renameTerminal`: a non-empty trimmed name sets
`customTitle`, an empty one deletes it.

**`DockTab`.** The `if (!editorId && !terminalId) return;` bail becomes a third branch.
Display title becomes `customTitle ?? title`, read from the valtio snapshot the
component already holds.

## Data flow

Rename: tab right-click → `buildPanelTabMenuItems` → `prompt()` → `renamePanelRecord`
writes `record.customTitle` → valtio re-renders `DockTab` with the override →
`onRenamed` also pushes the label into dockview via `api.setTitle` so the change is
immediate rather than waiting on a subscription.

Working folder: `+` menu / `core.newAgent.<id>` → `startAgentProfile` →
`pickWorkspaceFolder(workspaceId)` (short-circuits on a single-folder workspace) →
`chatProfileHostParams(profile, cwd)` → panel opens with `params.cwd` → `AcpChatPanel`
derives `cwd` from it → `ctx.agents.sessions.connect({ cwd })`.

## APIs / interfaces

Four public SDK additions — the `silo-docs-sync` workflow applies to all of them
(TSDoc, `@public` + `@category`, `pnpm docs:api`, roadmap row):

| Symbol                        | Shape                                                             |
| ----------------------------- | ----------------------------------------------------------------- |
| `MenuSurface`                 | `+ "panel/tab"`                                                   |
| `MenuContext["panel/tab"]`    | `{ panelId, kindId, workspaceId, params }`                        |
| `DockPanelKind.renamable`     | `boolean \| undefined` — defaults to `persistence === "recorded"` |
| `DockPanelRecord.customTitle` | `string \| undefined`                                             |

`MenuContext["panel/tab"]` deliberately matches `ToolbarItemContext["panel"]` field for
field: the two contribution points describe the same target, and an extension author who
has written a panel toolbar item should be able to guess the menu context without
reading the reference.

**`DockPanelApi.setTitle` is not touched.** It stays an unconditional pass-through to
dockview. `DockTab` is the app's only consumer of a panel title, so overriding at render
time produces the same visible result with no contract change for existing callers.

## Persistence

`customTitle` is a new optional field on `DockPanelRecord`, stored alongside `state`
rather than inside it — `state` is the panel kind's own bag, shallow-merged from
`updateParameters`, so a host-owned key living there would be at the panel's mercy.

No migration: the field is optional, and `normalizeLoadedWorkspace`
(`state/persistence-model.ts:488`) passes a valid `panels` array through by reference,
so an added field round-trips untouched. A record written by an older build simply has
no `customTitle`.

`sameParams` / `recordedPanelParamsToRestore` are unaffected — they compare `state`, and
`customTitle` isn't in it.

The panel's working folder persists as `params.cwd` → `record.state.cwd`, which RFC 0042
already writes. What changes is that it becomes **authoritative on restore** instead of
informational.

## Error handling

- Unknown kind id, or a panel id that isn't `kind:id` shaped → `buildPanelTabMenuItems`
  returns `[]` and `DockTab` opens no menu.
- Rename on a renamable kind with no record (a transient kind that opted in via
  `renamable: true`) → the dockview title is set for the session; nothing persists.
- Folder prompt dismissed → `startAgentProfile` returns the existing `cancelled`
  outcome, which both call sites already handle silently.
- An empty resolved `cwd` is never persisted, and the panel falls back to the
  workspace's primary folder. This is why the fallback is `||`, not `??`: `cwd` is `""`
  (not `undefined`) when the workspace lookup fails, and `??` would pin a panel to an
  empty working directory permanently.

## Testing strategy

Co-located Vitest, pure logic, no `@testing-library/react`. There is no `DockTab` or
`AcpChatPanel` component test today and this change doesn't add the first one — the
logic lives in builders and helpers that are tested directly, leaving the components as
wiring.

- `panel-tab-menu.test.ts` (new) — modelled on `terminal-tab-menu.test.ts`: drives the
  valtio store and the kind registry directly; covers the rename gate, the rename/reset
  round-trip, contributed-item merging and separation, and the empty cases.
- `workspaces.test.ts` — `renamePanelRecord` inside the existing
  `describe("recorded dock panels (RFC 0041)")`.
- `chat-profile-host.test.ts` — `chatProfileHostParams` gains `cwd`.
- `agent-profile-start.test.ts` — the assertion that Chat profiles skip the picker
  inverts.
- `session-restore.test.ts` — `resolveChatCwd` precedence and the empty-string guard.

## Constraints and existing decisions

- **RFC 0041** (`DockPanelRecord`) — the record is the source of truth for a panel's
  restore state; the layout keeps only geometry. `customTitle` joins the record, not the
  layout.
- **RFC 0042** (Chat session resurrection) — `params.cwd` exists because of it; this
  proposal promotes it from informational to authoritative.
- **RFC 0039** (panel toolbar SDK) — establishes the generic `"panel"` contribution
  surface whose context shape `"panel/tab"` mirrors.
- **RFC 0013** (context-menu contributions) — the surface/context registry being
  extended.
- **RFC 0038** — `chatProfileHost` as "a declaration, not a privilege"; the reason all
  three behaviors must be generic.
