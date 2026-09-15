# Tasks — 0046. Generic dock-panel tabs

## SDK surface

- [x] `MenuSurface += "panel/tab"` and `MenuContext["panel/tab"]` in
      `packages/sdk/src/types.ts`, with TSDoc naming the `ToolbarItemContext["panel"]`
      parallel and the "scope yourself with `when`" rule.
- [x] `DockPanelKind.renamable?: boolean` — TSDoc states the
      `persistence === "recorded"` default and that a transient kind opting in gets a
      session-only name.
- [x] `DockPanelRecord.customTitle?: string` in `packages/sdk/src/domain-types.ts` —
      TSDoc states it is host-owned and why it is not inside `state`.

## Host — rename

- [x] `renamePanelRecord(workspaceId, recordId, name)` in `state/workspaces.ts`,
      mirroring `renameTerminal` (empty clears).
- [x] `panel-tab-menu.ts` (new) — `buildPanelTabMenuItems`, mirroring
      `terminal-tab-menu.ts`.
- [x] `DockTab.tsx` — third branch replacing the `:215` bail; render
      `customTitle ?? title`.
- [x] `WorkspaceDock.tsx` restore — prefer `customTitle` over `state.title` for the
      re-added panel's title.

## Host — working folder

- [x] `agent-profile-start.ts` — hoist `pickWorkspaceFolder` above the arm split;
      rewrite the doc comment that justifies skipping it for Chat.
- [x] `chat-profile-host.ts` — `chatProfileHostParams(profile, cwd)` returns `cwd`.

## Chat panel

- [x] `session-restore.ts` — `resolveChatCwd(params, folder)`; guard an empty `cwd` out
      of `panelStateAfterConnect`.
- [x] `AcpChatPanel.tsx` — derive `cwd` via `resolveChatCwd`; update the params TSDoc
      that currently calls `cwd` informational.

## Tests

- [x] `panel-tab-menu.test.ts` (new).
- [x] `renamePanelRecord` in `workspaces.test.ts`.
- [x] `chatProfileHostParams` cwd in `chat-profile-host.test.ts`.
- [x] Invert the Chat-skips-the-picker assertion in `agent-profile-start.test.ts`.
- [x] `resolveChatCwd` in `session-restore.test.ts`.

## Docs

- [x] Row in `docs/proposals/README.md` (a unit test enforces the index shape).
- [x] `silo-docs-sync`: `pnpm docs:api` regenerated; `register-context-menu-item.md`
      surface-status note and roadmap's "Recorded dock panels" row both mention
      `panel/tab` + `renamable`. (No new `@category`/`@public` tags needed — every
      touched type was already a tagged, published export; only members were added.)
- [x] `docs/domain-language.md` — "Renamable panel", "Panel tab menu".

## Verification

- [ ] Every requirement in `requirements.md` is met or explicitly noted as not.
- [x] `pnpm test`, `pnpm --filter silo exec tsc --noEmit`, and `pnpm lint` pass. (Two
      `agent-catalog`/`omp` test failures are pre-existing and unrelated — they need
      Node 22's `--experimental-strip-types`, this box runs Node 20.19.5.)
- [ ] Runtime check in the dev app per `requirements.md` acceptance criteria — rename
      survives an agent title update and a restart; the folder prompt appears from both
      entry points; a mid-turn workspace switch does not tear the session down.
- [ ] Durable decisions recorded as ADRs.
- [ ] Proposal collapsed to a single curated `0046-generic-dock-panel-tabs.md`.
