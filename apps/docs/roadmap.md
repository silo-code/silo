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

| Primitive                                      | Status                               |                                                                                            |
| ---------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------ |
| Registration (`register*`)                     | <Badge type="tip" text="stable" />   | [docs](/api/#registration)                                                                 |
| `executeCommand`                               | <Badge type="tip" text="stable" />   | [docs](/api/other/execute-command)                                                         |
| `ctx.workspaces`                               | <Badge type="tip" text="stable" />   | [docs](/api/state/workspaces)                                                              |
| `ctx.layout`                                   | <Badge type="tip" text="stable" />   | [docs](/api/state/layout)                                                                  |
| `ctx.process` (persistent sessions)            | <Badge type="tip" text="stable" />   | [docs](/api/process/)                                                                      |
| `ctx.process.exec` (one-shot subprocess)       | <Badge type="tip" text="stable" />   | [docs](/api/process/#one-shot-exec)                                                        |
| `ctx.processes` (foreground process observer)  | <Badge type="tip" text="stable" />   | [docs](/api/processes/)                                                                    |
| Extension-API mechanism (`getExtension`)       | <Badge type="tip" text="stable" />   | [docs](/api/other/get-extension)                                                           |
| `ctx.editors` (documents)                      | <Badge type="tip" text="stable" />   | [docs](/api/editors/)                                                                      |
| `ctx.terminals` (terminal tabs)                | <Badge type="tip" text="stable" />   | [docs](/api/state/terminals)                                                               |
| `ctx.terminals.registerTabDecoration`          | <Badge type="tip" text="stable" />   | [docs](/api/state/terminals)                                                               |
| `ctx.terminals.focus`                          | <Badge type="tip" text="stable" />   | [docs](/api/state/terminals)                                                               |
| `ctx.terminals.subscribeOsc`                   | <Badge type="tip" text="stable" />   | [docs](/api/state/terminals#osc-events)                                                    |
| `ctx.terminals.getActive` / `subscribeActive`  | <Badge type="tip" text="stable" />   | [docs](/api/state/terminals#active-terminal)                                               |
| `ctx.terminals.subscribeOutput`                | <Badge type="tip" text="stable" />   | [docs](/api/state/terminals#raw-output)                                                    |
| `ctx.workspaces.registerStatus`                | <Badge type="tip" text="stable" />   | [docs](/api/state/workspaces)                                                              |
| `ctx.workspaces.registerSection`               | <Badge type="tip" text="stable" />   | [docs](/api/state/workspaces#workspace-sections)                                           |
| `ctx.files`                                    | <Badge type="tip" text="stable" />   | [docs](/api/files/)                                                                        |
| `ctx.theme` + `ctx.theme.registerPreset`       | <Badge type="tip" text="stable" />   | [docs](/api/theme/)                                                                        |
| `ctx.dnd` (drag-and-drop)                      | <Badge type="tip" text="stable" />   | [docs](/api/dnd/)                                                                          |
| `useServiceState` (reactive reads)             | <Badge type="tip" text="stable" />   | [docs](/api/other/use-service-state)                                                       |
| `useFocusGroup` (keyboard nav for a group)     | <Badge type="tip" text="stable" />   | [docs](/api/other/use-focus-group)                                                         |
| `Tooltip` (styled hover popup)                 | <Badge type="tip" text="stable" />   | [docs](/api/other/tooltip)                                                                 |
| `ctx.ui` (pickers + notify w/ actions + menus) | <Badge type="tip" text="stable" />   | [docs](/api/ui/)                                                                           |
| `ctx.ui` (confirm / prompt)                    | <Badge type="tip" text="stable" />   | [docs](/api/ui/)                                                                           |
| `ctx.ui.showModal` (custom modal content)      | <Badge type="tip" text="stable" />   | [docs](/api/ui/)                                                                           |
| `ctx.ui.openExternal` (open a URL out)         | <Badge type="tip" text="stable" />   | [docs](/api/ui/)                                                                           |
| `ctx.ui.getActiveSelectionText`                | <Badge type="tip" text="stable" />   | [docs](/api/ui/)                                                                           |
| `ctx.net` (server-side HTTP, bypasses CORS)    | <Badge type="tip" text="stable" />   | [docs](/api/net/)                                                                          |
| `ctx.system` (OS, arch, Silo version)          | <Badge type="tip" text="stable" />   | [docs](/api/system/)                                                                       |
| `ctx.search` (cross-file content search)       | <Badge type="tip" text="stable" />   | [docs](/api/search/)                                                                       |
| `ctx.search` (replace-in-files)                | <Badge type="info" text="planned" /> | [design](/api/search/#replace)                                                             |
| `ctx.ui` (quickPick / progress)                | <Badge type="info" text="planned" /> | [design](#ctx-ui)                                                                          |
| `ctx` events (typed `Event<T>`)                | <Badge type="tip" text="stable" />   | [docs](/api/other/event)                                                                   |
| `ctx.editors.getState` / `subscribe`           | <Badge type="tip" text="stable" />   | [docs](/api/editors/)                                                                      |
| `path` (cross-platform path utilities)         | <Badge type="tip" text="stable" />   | [docs](/api/other/path)                                                                    |
| per-extension settings (page + persistence)    | <Badge type="tip" text="stable" />   | [docs](/api/registration/register-settings-page)                                           |
| `ctx.storage` (global / workspace)             | <Badge type="tip" text="stable" />   | [docs](/api/storage/)                                                                      |
| `ctx.secrets` (host-mediated credentials)      | <Badge type="info" text="planned" /> | [RFC 0004](https://github.com/silo-code/silo/blob/main/docs/proposals/0004-ctx-storage.md) |
| `ctx.webview` (iframe navigation events)       | <Badge type="info" text="planned" /> | [design](#ctx-webview)                                                                     |
| context-menu contributions (explorer/editor)   | <Badge type="info" text="planned" /> | [design](#context-menus)                                                                   |

## Extension-owned features

Features that ship built-in but are implemented as **extensions** on the
primitives above — so a third party could build the same.

| Feature                | Status                             | Built on                        | Publishes |
| ---------------------- | ---------------------------------- | ------------------------------- | --------- |
| Git                    | <Badge type="tip" text="stable" /> | `process.exec` + `files`        | `GitAPI`  |
| Markdown Preview       | <Badge type="tip" text="stable" /> | `registerEditor` + `files`      | —         |
| Terminal               | <Badge type="tip" text="stable" /> | `process` sessions + dock panel | —         |
| Theme management       | <Badge type="tip" text="stable" /> | `theme` + `files` + `ui`        | —         |
| Search (find-in-files) | <Badge type="tip" text="stable" /> | `search` + `editors`            | —         |

> Each ships as a real extension package (`core.*` / `silo.*`) that touches the
> app only through `ctx` — the same surface a third party gets. The core
> primitives they lean on (the terminal's `process` sessions, the theme domain
> service) still live in the host; that split is by design. The decisions behind
> the model are recorded as ADRs in
> [`docs/decisions/`](https://github.com/silo-code/silo/tree/main/docs/decisions).

## Extension distribution <a id="extension-distribution"></a>

How a third-party extension gets from a package into the running app. See
[Publishing an extension](/guide/publishing-an-extension).

| Capability                                           | Status                               |                                                                     |
| ---------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------- |
| Author against `@silo-code/sdk` from npm             | <Badge type="tip" text="stable" />   | [docs](/guide/publishing-an-extension#the-build-contract-externals) |
| Install from local folder                            | <Badge type="tip" text="stable" />   | [docs](/guide/publishing-an-extension)                              |
| Enable / disable / uninstall (runtime)               | <Badge type="tip" text="stable" />   | [docs](/guide/publishing-an-extension)                              |
| First-party built-ins listed (disable-only, branded) | <Badge type="tip" text="stable" />   | [docs](/guide/publishing-an-extension#install-enable-uninstall)     |
| Load on launch + persisted registry                  | <Badge type="tip" text="stable" />   | [docs](/guide/publishing-an-extension)                              |
| `silo install` / `silo uninstall` CLI                | <Badge type="tip" text="stable" />   | [docs](/guide/cli#extension-commands)                               |
| `npx create-silo-extension` scaffold                 | <Badge type="tip" text="stable" />   | [docs](/guide/publishing-an-extension#scaffold-a-new-extension)     |
| Install from URL (tarball / GitHub release)          | <Badge type="tip" text="stable" />   | [docs](/guide/sharing-extensions#share-a-packed-tarball)            |
| Install from npm registry                            | <Badge type="tip" text="stable" />   | [docs](/guide/sharing-extensions#publish-to-npm)                    |
| Update checking + apply                              | <Badge type="info" text="planned" /> | —                                                                   |
| Permissions / capability model                       | <Badge type="tip" text="stable" />   | [docs](/guide/permissions)                                          |

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

| Planned surface                                                                     | RFC                                                                                                                    |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| <a id="ctx-ui"></a>`ctx.ui` slice 2 — `quickPick` / `inputBox` / `progress`         | [RFC 0001](https://github.com/silo-code/silo/blob/main/docs/proposals/0001-ctx-ui-slice-2.md)                          |
| <a id="ctx-events"></a>Typed `ctx` events (`Event<T>`, domain-owned, no global bus) | [RFC 0002](https://github.com/silo-code/silo/blob/main/docs/proposals/0002-ctx-events.md)                              |
| `ctx.secrets` — host-mediated credentials (storage `global` / `workspace` shipped)  | [RFC 0004](https://github.com/silo-code/silo/blob/main/docs/proposals/0004-ctx-storage.md)                             |
| Declarative `contributes` + activation events                                       | [RFC 0005](https://github.com/silo-code/silo/blob/main/docs/proposals/0005-declarative-contributes-activation.md)      |
| Extension permissions + sandbox                                                     | [RFC 0006](https://github.com/silo-code/silo/blob/main/docs/proposals/0006-extension-permissions-sandbox.md)           |
| Extension authoring toolchain                                                       | [RFC 0007](https://github.com/silo-code/silo/blob/main/docs/proposals/0007-extension-authoring-toolchain.md)           |
| Package format + remote install (GitHub / npm)                                      | [RFC 0008](https://github.com/silo-code/silo/blob/main/docs/proposals/0008-extension-package-format-remote-install.md) |
| Language intelligence (TS/JS via `tsserver`)                                        | [RFC 0009](https://github.com/silo-code/silo/blob/main/docs/proposals/0009-language-intelligence-lsp.md)               |
| Self-owned PTY host daemon                                                          | [RFC 0010](https://github.com/silo-code/silo/blob/main/docs/proposals/0010-pty-host-daemon.md)                         |
| <a id="ctx-webview"></a>`ctx.webview` — iframe navigation events via init script    | [RFC 0011](https://github.com/silo-code/silo/blob/main/docs/proposals/0011-iframe-navigation-events.md)                |
| <a id="context-menus"></a>Context-menu contributions (explorer / editor / terminal) | [RFC 0013](https://github.com/silo-code/silo/blob/main/docs/proposals/0013-context-menu-contributions.md)              |

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
