---
status: implemented
created: 2026-09-14
---

# 0046. Generic dock-panel tabs — rename, tab menu, working folder

## Summary

A terminal tab can be renamed, carries extension-contributed context-menu items, and
picks its working folder when the workspace has more than one. A Chat panel tab had
none of these — right-clicking it did nothing at all. This proposal gave those three
behaviors to **every dock panel**, as host chrome keyed off declarative
`DockPanelKind` properties, rather than teaching the bundled Chat panel three new
tricks — a third-party Chat panel inherits all three without declaring anything.

## Motivation

The Chat panel is a replaceable extension. `resolveChatProfileHost` calls
`chatProfileHost` "a declaration, not a privilege" — a third-party Chat panel claims
the job exactly as the bundled `silo.agents-chat-panel` does, and the profile editor
offers the Chat arm only when _some_ installed kind claims it. If tab rename and the
tab menu were implemented inside our panel, every alternative panel would have to
re-implement them, and Silo's answer to "why can't I rename this tab?" would depend on
which extension the user happened to install.

All three surfaces were already host-owned — `DockTab.tsx` draws every tab,
`terminal-tab-menu.ts` lives in the host, and `startAgentProfile` is the single
dispatch behind every "start this profile" gesture. The gap wasn't missing extension
capability; it was host behavior only ever wired for two of the three tab species.

The working-folder gap was sharper than cosmetic: a Chat session launched in the
workspace's **primary** folder, unconditionally — `extraFolders` were never consulted.
In a multi-root workspace there was no way to run an agent against the second repo,
while a terminal agent started from the same menu prompted for it.

## What shipped

1. **A `"panel/tab"` menu surface.** New `MenuSurface` member whose `MenuContext` is
   `{ panelId, kindId, workspaceId, params }` — the same shape
   `ToolbarItemContext["panel"]` already used for panel toolbar contributions, so an
   item scopes itself with `when: (_keys, t) => t.kindId === "…"`. `DockTab` grew a
   third branch that builds this menu; suppressed entirely when it would be empty.

2. **Rename via a host-owned `DockPanelRecord.customTitle`,** with a new
   `DockPanelKind.renamable` flag defaulting to `persistence === "recorded"`. The
   override is a sibling of `record.state`, never inside it — `state` is the panel's
   own contract. `DockTab` renders `customTitle ?? title`, so a panel that keeps
   calling `setTitle` never clobbers the user's rename. Survives an app restart
   (`customTitle` lives on the persisted `DockPanelRecord`).

3. **The folder picker hoisted in `startAgentProfile`,** above the Terminal/Chat arm
   split, threaded into the panel's params as `cwd`. Both entry points (the `+` menu
   and `core.newAgent.<id>`) inherit it, as does any kind declaring `chatProfileHost`.
   A background workspace switch mid-turn does not tear the session down — `cwd` is
   derived from the panel's own `workspaceId`, never the currently-active one.

4. **`ctx.panels` (tab adornments for any panel kind).** Closing the same "any panel
   tab" story one layer further: `ctx.editors` / `ctx.terminals` already offered icon /
   highlight / indicator / activity chrome via `TabAdornmentMethods` (ADR 0029); panels
   had no equivalent. The host-side registry (`tabAdornmentRegistry`, RFC 0038) already
   treated `"panel"` as a third adornment kind — this exposed it publicly as
   `ctx.panels`, mirroring `ctx.editors`/`ctx.terminals` exactly. Discovered as a gap
   via the reference `follow-ups` extension, whose tab-flag highlight had no way to
   render on a Chat tab even though the new `panel/tab` menu could already mark one.
   Updated `apps/docs/api/state/tab-adornments.md`'s "a panel shouldn't paint its own
   chrome" guidance to reflect that a panel _is_ now a real bind target by its own id —
   the caveat that still holds is a panel adorning _itself_, not a third party binding
   to it (see that doc for the full distinction, and why Agent Session chrome still
   routes through `ctx.agents`, not `ctx.panels`).

5. **`DockPanelRecord.panelId` — the enumerate→act bridge.** `ctx.panels` (and the
   `panel/tab` menu, and `"panel"` toolbar items) all speak the _live_ dockview panel
   id, but `Workspace.panels` (RFC 0041) enumerated records keyed by their _persisted_
   id, with no supported way to get from one to the other. `panelId` is that way:
   host-stamped onto every record, restamped on every load so it always names the tab
   on screen now, and documented as read-never-compose — the format stays host-owned,
   so it can change without breaking an extension.

## Scope

**In:** the four behaviors above, generically for all dock panels; the Chat panel
consuming `params.cwd`; the public SDK additions needed to express them.

**Out:**

- Renaming the underlying **agent session**. A tab name and a session name are
  deliberately different things — the session's is agent-reported
  (`AgentInfo.title` / `chatState[id].title`), the tab's is host-owned.
- Changing `DockPanelApi.setTitle`'s contract. It stays an unconditional pass-through;
  `DockTab` is the only consumer of a panel's title in the app, so overriding at render
  time (`customTitle ?? title`) achieves a rename with no contract change.
- Changing a panel's working folder _after_ creation — terminals don't offer that
  either, and parity was the goal.
- **Enumeration itself** — `Workspace.panels` (RFC 0041) already lists a workspace's
  recorded panels and is unchanged here. What this proposal added is only the bridge
  from a listed record to the live panel it names (`DockPanelRecord.panelId`), not a
  new or richer way to enumerate.
- A folder indicator in the Chat panel chrome, and folding `EditorRecord` /
  `TerminalRecord` into `DockPanelRecord` (still deferred, per RFC 0041).

## Key decisions

- **Store the custom title beside `record.state`, not inside it.** `state` is
  documented as the panel kind's own bag, shallow-merged from `updateParameters` — a
  host-owned key living there would be at the panel's mercy.
- **`renamable` defaults to `persistence === "recorded"` rather than an allowlist.**
  Gating rename on a kind-id allowlist or on `chatProfileHost` would have been the
  exact special-casing this proposal exists to avoid. The flag exists so a recorded
  kind that _shouldn't_ be user-nameable can still opt out.
- **`MenuContext["panel/tab"]` deliberately matches `ToolbarItemContext["panel"]`
  field-for-field** — the two contribution points describe the same target, so an
  extension author who has written a panel toolbar item can guess the menu context.
  This symmetry is also what let `ctx.panels`'s later addition and the `follow-ups`
  consumer collapse toolbar- and menu-target resolution into one helper.
- **The persisted `panelId` is deliberately not authoritative — the host restamps it
  on every load.** A record outlives the tab it describes: it is written once and read
  back across restarts, while the dockview id is composed fresh each time the panel is
  recreated. Trusting the persisted copy would mean a stale id silently pointing at no
  tab (or, worse, a different one) after a restore. Restamping keeps the field's
  meaning exactly "the tab that is on screen now", which is what every panel-targeting
  API wants, and keeps the format host-owned rather than freezing it into persisted
  data.
- **`ctx.panels` targets a panel by its own id**, extending — not contradicting — the
  RFC 0038/ADR 0029 "a panel shouldn't paint its own chrome" stance: that guidance was
  about a panel adorning _itself_, and was never in tension with a third-party
  extension binding to a panel's id, which `panel/tab` and the `"panel"` toolbar
  surface already did before `ctx.panels` existed.

## Verification

- `panel-tab-menu.test.ts`, `panel-service.test.ts`, `renamePanelRecord` (in
  `workspaces.test.ts`), `chatProfileHostParams` cwd (in `chat-profile-host.test.ts`),
  `resolveChatCwd` (in `session-restore.test.ts`), and the inverted Chat-skips-the-picker
  assertion in `agent-profile-start.test.ts`.
- `pnpm test`, `pnpm --filter silo exec tsc --noEmit`, `pnpm lint`, and the docs site's
  own test suite (`apps/docs`) all pass.
- Runtime-verified in the dev app: rename survives an agent title update and an app
  restart; the folder prompt appears from both entry points and is scoped to the
  correct workspace; a mid-turn workspace switch does not tear the session down.
- Consumer-verified against the reference `follow-ups` extension
  (`silo-code/silo-extensions`): its tab-flag toolbar button and highlight now work on
  a Chat tab exactly as they did on an editor or terminal tab, with no per-kind
  special-casing beyond what the shared `{panelId, kindId, workspaceId, params}` shape
  already requires.

## Implementation references

- This repo: `@silo-code/extension-host` (`panel-tab-menu.ts`, `panel-service.ts`,
  `DockTab.tsx`, `state/workspaces.ts`, `agent-profile-start.ts`) and `@silo-code/sdk`
  (`MenuSurface`/`MenuContext["panel/tab"]`, `DockPanelKind.renamable`,
  `DockPanelRecord.customTitle`, `DockPanelRecord.panelId`,
  `PanelService`/`ctx.panels`). The composed id has one formatter
  (`state/recorded-panel-id.ts`) and one parser (`extension-host/dock-panel-kinds.ts`).
- `silo-code/silo-extensions`, `follow-ups` extension — reference consumer of all four
  surfaces (`panel/tab` menu, `"panel"` toolbar, `ctx.panels` adornments).
- Related: RFC 0041 (`DockPanelRecord`), RFC 0042 (Chat session resurrection), RFC 0039
  (panel toolbar SDK), RFC 0013 (context-menu contributions), RFC 0038
  (`chatProfileHost` declaration), ADR 0029 (adornments vs registration), ADR 0030
  (Activity chrome).
