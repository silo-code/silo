# Roadmap & API status

The whole platform Silo is building toward — and what's real _today_. This page
is the source of truth for what you can build on now vs. what's still being
designed. As a primitive ships, its badge flips from
<Badge type="info" text="planned" /> to <Badge type="tip" text="stable" />.

> **The goal:** a small, stable core, after which most new features are
> _extensions_ built on these primitives — first-party and third-party alike.
> When the core table below is all green, we've hit that inflection point.

**Legend:** <Badge type="tip" text="stable" /> available now ·
<Badge type="warning" text="experimental" /> usable, may change ·
<Badge type="info" text="planned" /> designed, not yet implemented

## Core (`ctx`) primitives

| Primitive                                                                         | Status                               |                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registration (`register*`)                                                        | <Badge type="tip" text="stable" />   | [docs](/api/#registration)                                                                                                                                                                                                                     |
| `executeCommand`                                                                  | <Badge type="tip" text="stable" />   | [docs](/api/other/execute-command)                                                                                                                                                                                                             |
| `ctx.workspaces`                                                                  | <Badge type="tip" text="stable" />   | [docs](/api/state/workspaces)                                                                                                                                                                                                                  |
| `ctx.layout`                                                                      | <Badge type="tip" text="stable" />   | [docs](/api/state/layout)                                                                                                                                                                                                                      |
| `ctx.process` (persistent sessions)                                               | <Badge type="tip" text="stable" />   | [docs](/api/process/)                                                                                                                                                                                                                          |
| `ctx.process.exec` (one-shot subprocess)                                          | <Badge type="tip" text="stable" />   | [docs](/api/process/#one-shot-exec)                                                                                                                                                                                                            |
| Terminal environment (`SILO_*` identity, `spawn` `env`)                           | <Badge type="tip" text="stable" />   | [docs](/api/terminal-environment)                                                                                                                                                                                                              |
| `ctx.processes` (foreground process observer)                                     | <Badge type="tip" text="stable" />   | [docs](/api/processes/)                                                                                                                                                                                                                        |
| `ctx.agents` (coding-agent activity + resume hints)                               | <Badge type="warning" text="beta" /> | [How it works](/roadmap/agent-system)                                                                                                                                                                                                          |
| Extension-API mechanism (`getExtension`)                                          | <Badge type="tip" text="stable" />   | [docs](/api/other/get-extension)                                                                                                                                                                                                               |
| `ctx.editors` (documents)                                                         | <Badge type="tip" text="stable" />   | [docs](/api/editors/)                                                                                                                                                                                                                          |
| `ctx.terminals` (terminal tabs)                                                   | <Badge type="tip" text="stable" />   | [docs](/api/state/terminals)                                                                                                                                                                                                                   |
| Tab adornments (`editors` / `terminals` setIcon / setIndicator / setActivity / …) | <Badge type="tip" text="stable" />   | [docs](/api/state/tab-adornments) · [ADR 0029](https://github.com/silo-code/silo/blob/main/docs/decisions/0029-adornments-vs-registration.md) · [ADR 0030](https://github.com/silo-code/silo/blob/main/docs/decisions/0030-activity-chrome.md) |
| Activity chrome (`Activity` kind + SDK `ActivityGlyph`)                           | <Badge type="tip" text="stable" />   | [ADR 0030](https://github.com/silo-code/silo/blob/main/docs/decisions/0030-activity-chrome.md) · workspace status + tab adornments                                                                                                             |
| `ctx.terminals.registerTabDecoration` (deprecated shim)                           | <Badge type="tip" text="stable" />   | [docs](/api/state/tab-adornments#deprecated-shims) — prefer `bindIndicator` / `bindActivity`                                                                                                                                                   |
| Side-panel tab adornments (owner handle)                                          | <Badge type="info" text="planned" /> | [RFC 0022](https://github.com/silo-code/silo/blob/main/docs/proposals/0022-side-panel-tab-adornments.md)                                                                                                                                       |
| `ctx.registerToolbarItem`                                                         | <Badge type="tip" text="stable" />   | [docs](/api/registration/register-toolbar-item) · [RFC 0021](https://github.com/silo-code/silo/blob/main/docs/proposals/0021-follow-ups-extension-sdk.md)                                                                                      |
| `ctx.terminals.focus`                                                             | <Badge type="tip" text="stable" />   | [docs](/api/state/terminals)                                                                                                                                                                                                                   |
| `ctx.terminals.subscribeOsc`                                                      | <Badge type="tip" text="stable" />   | [docs](/api/state/terminals#osc-events)                                                                                                                                                                                                        |
| `ctx.terminals.getActive` / `subscribeActive`                                     | <Badge type="tip" text="stable" />   | [docs](/api/state/terminals#active-terminal)                                                                                                                                                                                                   |
| `ctx.terminals.subscribeOutput`                                                   | <Badge type="tip" text="stable" />   | [docs](/api/state/terminals#raw-output)                                                                                                                                                                                                        |
| `ctx.workspaces` status / badges (`set` / `clear` / `bind`)                       | <Badge type="tip" text="stable" />   | [docs](/api/state/workspaces) · adorn verbs; `registerStatus` / `registerBadge` deprecated shims                                                                                                                                               |
| `ctx.workspaces.registerSection`                                                  | <Badge type="tip" text="stable" />   | [docs](/api/state/workspaces#workspace-sections)                                                                                                                                                                                               |
| `ctx.registerNavigatorView` (Navigator panel views)                               | <Badge type="tip" text="stable" />   | [docs](/api/registration/register-navigator-view) · [RFC 0023](https://github.com/silo-code/silo/blob/main/docs/proposals/0023-workspace-panel-views.md)                                                                                       |
| `ctx.workspaces.getOpenWorkspaceMenuItems`                                        | <Badge type="tip" text="stable" />   | [docs](/api/state/workspaces#open-workspace-menu)                                                                                                                                                                                              |
| `ctx.workspaces.getWorkspaceMenuItems`                                            | <Badge type="tip" text="stable" />   | [docs](/api/state/workspaces#workspace-context-menu)                                                                                                                                                                                           |
| `ctx.terminals.getTabMenuItems`                                                   | <Badge type="tip" text="stable" />   | [docs](/api/state/terminals#tab-context-menu)                                                                                                                                                                                                  |
| `ctx.files`                                                                       | <Badge type="tip" text="stable" />   | [docs](/api/files/)                                                                                                                                                                                                                            |
| `ctx.theme` + `ctx.theme.registerPreset`                                          | <Badge type="tip" text="stable" />   | [docs](/api/theme/)                                                                                                                                                                                                                            |
| `ctx.dnd` (drag-and-drop)                                                         | <Badge type="tip" text="stable" />   | [docs](/api/dnd/)                                                                                                                                                                                                                              |
| `useServiceState` (reactive reads)                                                | <Badge type="tip" text="stable" />   | [docs](/api/other/use-service-state)                                                                                                                                                                                                           |
| `useFocusGroup` (keyboard nav for a group)                                        | <Badge type="tip" text="stable" />   | [docs](/api/other/use-focus-group)                                                                                                                                                                                                             |
| `Tooltip` (styled hover popup)                                                    | <Badge type="tip" text="stable" />   | [docs](/api/other/tooltip)                                                                                                                                                                                                                     |
| Design-system components (modal kit)                                              | <Badge type="tip" text="stable" />   | [docs](/design/) · [RFC 0016](https://github.com/silo-code/silo/blob/main/docs/proposals/0016-modal-design-system.md)                                                                                                                          |
| `--silo-list-*` tokens + `.silo-scroll`                                           | <Badge type="tip" text="stable" />   | [docs](/design/components/lists)                                                                                                                                                                                                               |
| `ctx.ui` (pickers + notify w/ actions + menus)                                    | <Badge type="tip" text="stable" />   | [docs](/api/ui/)                                                                                                                                                                                                                               |
| `ctx.ui` (confirm / prompt)                                                       | <Badge type="tip" text="stable" />   | [docs](/api/ui/)                                                                                                                                                                                                                               |
| `ctx.ui.showModal` (custom modal content)                                         | <Badge type="tip" text="stable" />   | [docs](/api/ui/)                                                                                                                                                                                                                               |
| `ctx.layout.openPanelSheet` (dock sheet anchored to a side panel)                 | <Badge type="tip" text="stable" />   | [docs](/api/state/layout) · [RFC 0029](https://github.com/silo-code/silo/blob/main/docs/proposals/0029-sdk-sheet-homedir-confirm-dont-show.md)                                                                                                 |
| `ctx.ui.confirmWithDontShowAgain`                                                 | <Badge type="tip" text="stable" />   | [docs](/api/ui/) · [RFC 0029](https://github.com/silo-code/silo/blob/main/docs/proposals/0029-sdk-sheet-homedir-confirm-dont-show.md)                                                                                                          |
| `ctx.ui.openExternal` (open a URL out)                                            | <Badge type="tip" text="stable" />   | [docs](/api/ui/)                                                                                                                                                                                                                               |
| `ctx.ui.getActiveSelectionText`                                                   | <Badge type="tip" text="stable" />   | [docs](/api/ui/)                                                                                                                                                                                                                               |
| `ctx.net` (server-side HTTP, bypasses CORS)                                       | <Badge type="tip" text="stable" />   | [docs](/api/net/)                                                                                                                                                                                                                              |
| `ctx.system` (OS, arch, Silo version)                                             | <Badge type="tip" text="stable" />   | [docs](/api/system/)                                                                                                                                                                                                                           |
| `ctx.system.homeDir`                                                              | <Badge type="tip" text="stable" />   | [docs](/api/system/) · [RFC 0029](https://github.com/silo-code/silo/blob/main/docs/proposals/0029-sdk-sheet-homedir-confirm-dont-show.md)                                                                                                      |
| `ctx.search` (cross-file content search)                                          | <Badge type="tip" text="stable" />   | [docs](/api/search/)                                                                                                                                                                                                                           |
| `ctx.search` (replace-in-files)                                                   | <Badge type="info" text="planned" /> | [design](/api/search/#replace)                                                                                                                                                                                                                 |
| `ctx.ui` (quickPick / progress)                                                   | <Badge type="info" text="planned" /> | [design](#ctx-ui)                                                                                                                                                                                                                              |
| `ctx` events (typed `Event<T>`)                                                   | <Badge type="tip" text="stable" />   | [docs](/api/other/event)                                                                                                                                                                                                                       |
| `ctx.editors.getState` / `subscribe`                                              | <Badge type="tip" text="stable" />   | [docs](/api/editors/)                                                                                                                                                                                                                          |
| `path` (cross-platform path utilities)                                            | <Badge type="tip" text="stable" />   | [docs](/api/other/path)                                                                                                                                                                                                                        |
| per-extension settings (page + persistence)                                       | <Badge type="tip" text="stable" />   | [docs](/api/registration/register-settings-page)                                                                                                                                                                                               |
| `ctx.storage` (global / workspace)                                                | <Badge type="tip" text="stable" />   | [docs](/api/storage/)                                                                                                                                                                                                                          |
| `ctx.storage.globalDir` / `workspaceDir` (per-extension directories)              | <Badge type="tip" text="stable" />   | [docs](/api/storage/#storage-directories)                                                                                                                                                                                                      |
| `ctx.secrets` (host-mediated credentials)                                         | <Badge type="info" text="planned" /> | [RFC 0004](https://github.com/silo-code/silo/blob/main/docs/proposals/0004-ctx-storage.md)                                                                                                                                                     |
| `ctx.webview` (cross-origin iframe bridge)                                        | <Badge type="tip" text="stable" />   | [docs](/api/webview/)                                                                                                                                                                                                                          |
| context-menu contributions (workspace, terminal/link, editor/tab, terminal/tab)   | <Badge type="tip" text="stable" />   | [docs](/api/registration/register-context-menu-item)                                                                                                                                                                                           |
| context-menu contributions (explorer/item)                                        | <Badge type="info" text="planned" /> | [design](#context-menus)                                                                                                                                                                                                                       |
| `ctx.workspaces.registerPropertyPage`                                             | <Badge type="tip" text="stable" />   | [docs](/api/state/workspaces#workspace-property-pages)                                                                                                                                                                                         |

## Extension-owned features

Features that ship built-in but are implemented as **extensions** on the
primitives above — so a third party could build the same.

| Feature                | Status                             | Built on                                | Publishes                                                                                             |
| ---------------------- | ---------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Git                    | <Badge type="tip" text="stable" /> | `process.exec` + `files` + `workspaces` | `GitAPI` (`@silo-code/git-api`) — one-shot reads/mutations plus a live `watchRepo` session (ADR 0037) |
| Markdown Preview       | <Badge type="tip" text="stable" /> | `registerEditor` + `files`              | —                                                                                                     |
| Terminal               | <Badge type="tip" text="stable" /> | `process` sessions + dock panel         | —                                                                                                     |
| Theme management       | <Badge type="tip" text="stable" /> | `theme` + `files` + `ui`                | —                                                                                                     |
| Search (find-in-files) | <Badge type="tip" text="stable" /> | `search` + `editors`                    | —                                                                                                     |

> Each ships as a real extension package (`core.*` / `silo.*`) that touches the
> app only through `ctx` — the same surface a third party gets. The core
> primitives they lean on (the terminal's `process` sessions, the theme domain
> service) still live in the host; that split is by design. The decisions behind
> the model are recorded as ADRs in
> [`docs/decisions/`](https://github.com/silo-code/silo/tree/main/docs/decisions).
>
> This table is **bundled** features only. Extensions that live in
> `silo-code/silo-extensions` and are installed at runtime — `silo.follow-ups`,
> `silo.agent-monitor`, and `silo.tasks`
> ([RFC 0031](https://github.com/silo-code/silo/blob/main/docs/proposals/0031-tasks-extension/proposal.md))
> — deliberately get no row here; they are discovered through Browse, not shipped
> in the app.

## Extension distribution <a id="extension-distribution"></a>

How a third-party extension gets from a package into the running app. See
[Extensions](/guide/extensions) (install / Browse / updates) and
[Publishing an extension](/guide/publishing-an-extension).

| Capability                                           | Status                               |                                                                                                 |
| ---------------------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Author against `@silo-code/sdk` from npm             | <Badge type="tip" text="stable" />   | [docs](/guide/publishing-an-extension#the-build-contract-externals)                             |
| Install from local folder                            | <Badge type="tip" text="stable" />   | [docs](/guide/publishing-an-extension)                                                          |
| Enable / disable / uninstall (runtime)               | <Badge type="tip" text="stable" />   | [docs](/guide/publishing-an-extension)                                                          |
| First-party built-ins listed (disable-only, branded) | <Badge type="tip" text="stable" />   | [docs](/guide/publishing-an-extension#install-enable-uninstall)                                 |
| Load on launch + persisted registry                  | <Badge type="tip" text="stable" />   | [docs](/guide/publishing-an-extension)                                                          |
| `silo install` / `silo uninstall` CLI                | <Badge type="tip" text="stable" />   | [docs](/guide/cli#extension-commands)                                                           |
| `npx create-silo-extension` scaffold                 | <Badge type="tip" text="stable" />   | [docs](/guide/publishing-an-extension#scaffold-a-new-extension)                                 |
| Install from URL (tarball / GitHub release)          | <Badge type="tip" text="stable" />   | [docs](/guide/sharing-extensions#share-a-packed-tarball)                                        |
| Install from npm registry                            | <Badge type="tip" text="stable" />   | [docs](/guide/sharing-extensions#publish-to-npm)                                                |
| Update checking + apply                              | <Badge type="tip" text="stable" />   | [docs](/guide/extensions#updates)                                                               |
| Extension registry — browse / search / install       | <Badge type="tip" text="stable" />   | [docs](/guide/extensions) · [catalog](https://extensions.getsilo.dev)                           |
| Registry website (`extensions.getsilo.dev`)          | <Badge type="tip" text="stable" />   | [extensions.getsilo.dev](https://extensions.getsilo.dev)                                        |
| Private / team registries (federated index)          | <Badge type="info" text="planned" /> | [design](https://github.com/silo-code/silo/blob/main/docs/proposals/0014-extension-registry.md) |
| Permissions / capability model                       | <Badge type="tip" text="stable" />   | [docs](/guide/permissions)                                                                      |

> **Updates:** "Update checking + apply" is the P1 registry feature — the app
> polls [registry.getsilo.dev](https://registry.getsilo.dev), shows a badge, and
> applies Update / Update all from Settings → Extensions. That is not the same
> as **Safe update** below (stage → validate → swap + rollback on a bad
> install), which is still planned.

## Extension model & safety

The contract + lifecycle work that makes the system survivable at scale. The
designed pieces are RFCs in
[`docs/proposals/`](https://github.com/silo-code/silo/tree/main/docs/proposals)
(esp. 0005 / 0006); the rest is tracked in the table above.

| Capability                                        | Status                               |
| ------------------------------------------------- | ------------------------------------ |
| Manifest `id` / path validation                   | <Badge type="tip" text="stable" />   |
| Declarative `contributes` + activation events     | <Badge type="info" text="planned" /> |
| `engine` compatibility enforcement                | <Badge type="info" text="planned" /> |
| Sandbox / capability gating (untrusted code)      | <Badge type="info" text="planned" /> |
| Storage cleanup on uninstall                      | <Badge type="info" text="planned" /> |
| Safe update (stage-validate-swap + rollback)      | <Badge type="info" text="planned" /> |
| Failed-load error surfacing + collision reporting | <Badge type="info" text="planned" /> |

---

## Designed surfaces (planned)

The shape of each planned surface is now designed in an **RFC** under
[`docs/proposals/`](https://github.com/silo-code/silo/tree/main/docs/proposals)
(subject to change until it ships):

| Planned surface                                                                             | RFC                                                                                                                        |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| <a id="ctx-ui"></a>`ctx.ui` slice 2 — `quickPick` / `progress` (`prompt` covers `inputBox`) | [RFC 0001](https://github.com/silo-code/silo/blob/main/docs/proposals/0001-ctx-ui-slice-2.md)                              |
| `ctx.secrets` — host-mediated credentials (storage `global` / `workspace` shipped)          | [RFC 0004](https://github.com/silo-code/silo/blob/main/docs/proposals/0004-ctx-storage.md)                                 |
| Declarative `contributes` + activation events                                               | [RFC 0005](https://github.com/silo-code/silo/blob/main/docs/proposals/0005-declarative-contributes-activation.md)          |
| Sandboxed extension execution (the permission model itself is stable)                       | [RFC 0006](https://github.com/silo-code/silo/blob/main/docs/proposals/0006-extension-permissions-sandbox.md)               |
| Extension CSS auto-injection + SDK `createStore`                                            | [RFC 0007](https://github.com/silo-code/silo/blob/main/docs/proposals/0007-extension-authoring-toolchain.md)               |
| Language intelligence (TS/JS via `tsserver`) — held, not scheduled                          | [RFC 0009](https://github.com/silo-code/silo/blob/main/docs/proposals/0009-language-intelligence-lsp.md)                   |
| <a id="context-menus"></a>Context-menu contributions — `explorer/item` dispatch             | [RFC 0013](https://github.com/silo-code/silo/blob/main/docs/proposals/0013-context-menu-contributions.md)                  |
| pty-host daemon relocated outside the AppImage mount (Linux)                                | [RFC 0017](https://github.com/silo-code/silo/blob/main/docs/proposals/0017-pty-host-daemon-outside-appimage-mount.md)      |
| Hooks as an authoritative agent-activity channel (`blocked` state, sub-agents)              | [RFC 0020](https://github.com/silo-code/silo/blob/main/docs/proposals/0020-agent-hook-activity-channel.md)                 |
| Side-panel tab adornments (owner handle from `registerSidePanel`)                           | [RFC 0022](https://github.com/silo-code/silo/blob/main/docs/proposals/0022-side-panel-tab-adornments.md)                   |
| Git-detection handler claim protocol                                                        | [RFC 0024](https://github.com/silo-code/silo/blob/main/docs/proposals/0024-git-detection-handler-claim-protocol.md)        |
| Extension-to-extension version floors (`engine`-style, generalized)                         | [RFC 0025](https://github.com/silo-code/silo/blob/main/docs/proposals/0025-extension-to-extension-version-dependencies.md) |
| Private / team registries (federated index)                                                 | [RFC 0014](https://github.com/silo-code/silo/blob/main/docs/proposals/0014-extension-registry.md)                          |

> RFCs [0002](https://github.com/silo-code/silo/blob/main/docs/proposals/0002-ctx-events.md)
> (typed `ctx` events),
> [0008](https://github.com/silo-code/silo/blob/main/docs/proposals/0008-extension-package-format-remote-install.md)
> (package format + remote install) and
> [0014](https://github.com/silo-code/silo/blob/main/docs/proposals/0014-extension-registry.md)
> (the registry) used to sit in this table and have since shipped — they are
> `implemented` now, and only the leftovers listed above are still open.

---

## Tooling

Not part of the extension SDK — host-side developer/test surfaces.

| Surface                 | Status                                       |                                                                          |
| ----------------------- | -------------------------------------------- | ------------------------------------------------------------------------ |
| `silo <path>` CLI       | <Badge type="tip" text="stable" />           | [docs](/guide/cli)                                                       |
| Automation RPC (dev)    | <Badge type="warning" text="experimental" /> | [design](https://github.com/silo-code/silo/blob/main/docs/automation.md) |
| Nightly release channel | <Badge type="tip" text="stable" />           | [docs](/guide/release-channels)                                          |

### `silo <path>` CLI <Badge type="tip" text="stable" />

A terminal entry point: `silo <dir>` foregrounds (or launches) Silo and
opens/activates a workspace for that folder; `silo <file>` opens the file in the
active workspace. Built on `tauri-plugin-single-instance` — a second launch is
forwarded to the running instance rather than opening a new window. Install the
command from **File → Install `silo` Command in PATH**. See
[the `silo` command](/guide/cli).

### Automation RPC <Badge type="warning" text="experimental" />

A dev-only loopback HTTP RPC for driving the **real running app** from a test
suite, CI, or an agent — works around macOS having no WKWebView automation hook.
Excluded from release builds (Cargo `automation` feature + frontend `DEV`
guard); in dev it's always on but every request must carry an
`X-Silo-Automation` header and a loopback `Host`, so a web page you visit can't
drive it. Ops include `ping`, `exec` (run a registered command), `activeElement`
/ `editorsDetail` (focus introspection), workspace/file test-driver ops,
`contextKeys`, and `eval`. See [`docs/automation.md`](https://github.com/silo-code/silo/blob/main/docs/automation.md).
