# Automation interface — driving the running app

A dev-only RPC surface that lets an external driver — a test suite, CI, or an
agent — operate the **real running Silo app**: run registered commands, set up
workspace/file/terminal scenarios, and introspect focus and editor state from
Monaco's own APIs.

This is the authoritative tool for verifying UI behavior and chasing focus /
edit-routing bugs against the actual native webview. When in doubt, **tap a
source of truth through this interface — don't scrape the DOM and don't drive
the OS.** The rest of this document is the reliable recipe for doing exactly
that.

## Why it exists

Silo runs in a Tauri WKWebView. On macOS that webview exposes **no external
automation hook**:

- **No WebDriver.** Tauri's WebDriver support is Windows/Linux only — there is
  no WKWebView driver.
- **No Chrome DevTools Protocol** — WKWebView isn't Chromium.
- **No synthetic input from outside.** The OS gates clicks/keystrokes behind the
  **Accessibility** TCC permission. A launchd-detached process (e.g. the
  PTY-host session daemon) cannot reliably be granted Accessibility, so injecting
  input that way is a dead end.

We chased all three of those and they don't work — recorded here so nobody
re-treads them. The escape is to invert the direction: rather than drive the app
_from outside_, the app **voluntarily listens** on a loopback socket. That
channel isn't gated by the OS, works identically across platforms, and exercises
the actual WKWebView + dockview + Monaco + xterm — the real shell, not a browser
stand-in.

This is the **integration** layer of a two-tier test suite (see "Writing
integration tests" below):

- **Unit** (`pnpm test`) — Vitest + jsdom with the Tauri boundary mocked. Fast,
  runs anywhere, no app required. Good for logic, contracts, reducers.
- **Integration** (`pnpm --filter silo test:it`) — Vitest driving a live dev app
  (`pnpm dev`) through this RPC. Real WKWebView + dockview + Monaco +
  xterm; the only layer that can observe native focus/edit-routing behavior.

We deliberately drive the integration layer through this RPC rather than a
Chromium-based browser harness: Silo ships on WKWebView, and focus bugs here
behave differently in Chromium — a browser test could pass for the wrong reason.
Same runner and assertions across both layers, so there's nothing new to learn.

## Security model

An RPC into a code editor — with an `eval` op and filesystem access — is a real
attack surface. It's kept off end users entirely, and locked down so that even
on a developer's machine a **web page you happen to visit can't drive it**.

**Never reaches release builds (two independent gates):**

1. **Cargo feature `automation`.** The Rust server (`tiny_http` dep + the whole
   `commands/automation.rs` module) is `#[cfg(feature = "automation")]`. Release
   builds (`pnpm --filter silo app:build`) don't pass the feature, so the code **isn't
   compiled in at all**. `pnpm dev` passes `--features automation`.
2. **Frontend `import.meta.env.DEV`.** The webview bridge is loaded by a dynamic
   `import()` behind a static `DEV` guard in `src/main.tsx`, so it's dropped from
   release bundles by the bundler.

**In a dev build it's always on — but a per-request guard, not obscurity, is
what makes that safe.** The socket binds **`127.0.0.1` only**, and every request
must satisfy both:

- **`X-Silo-Automation: 1` header.** A cross-origin web page _cannot_ set a
  custom header without a CORS preflight, which this server never answers — so a
  malicious page can't fire a "simple" `POST` at the port (the attack that an
  always-on, header-less localhost server with an `eval` op would be wide open
  to). `curl`/the typed client set it trivially.
- **A loopback `Host`** (`127.0.0.1`/`localhost`). Defeats DNS-rebinding, where a
  page on `evil.com` rebinds to `127.0.0.1` (becoming same-origin, so it _can_
  set the header) but still sends `Host: evil.com`.

Anything failing the guard gets a `403`. (There is deliberately **no**
`SILO_AUTOMATION` env switch anymore — it was inconvenient and wasn't the thing
actually protecting you; the request guard is.)

The reply path is a plain Tauri **event** (`automation://reply`), not a new
`invoke` command — so the production IPC surface (`generate_handler!`) is
**untouched** by this feature.

## Running it

```bash
pnpm dev
```

That's it — no env var. Look for both readiness signals:

- `[automation] RPC listening on http://127.0.0.1:7878` — on **stderr** (Rust
  server bound the port).
- `[automation] bridge ready` — in the **webview console** (frontend listener +
  Monaco instrumentation are live).

**Every request must carry `-H 'X-Silo-Automation: 1'`** (see the security model
above) — all examples below do. Override the port with `SILO_AUTOMATION_PORT`.

## Protocol

HTTP `POST /` with a JSON body. One request, one response.

```
request:   { "op": "<name>", "args": { ... } }
response:  { "ok": true,  "result": <value> }
           { "ok": false, "error": "<message>" }
```

Every op **except `ping`** round-trips through the webview: the host emits
`automation://request`, the frontend bridge handles it and emits
`automation://reply`. The host correlates by id and answers the HTTP call.
`ping` is answered host-side so a liveness probe doesn't depend on the webview.

**Timeout:** the host waits **5 seconds** for the webview reply, then answers
`{ "ok": false, "error": "timed out waiting for webview reply" }`. Malformed
JSON yields `{ "ok": false, "error": "invalid JSON: …" }`; an unknown op yields
`{ "ok": false, "error": "unknown op: …" }`.

### Architecture

```
 driver (curl / test suite / agent)
        │  HTTP POST 127.0.0.1:7878
        ▼
 tiny_http server  ──emit("automation://request")──►  frontend bridge
   (Rust, per-req thread)                               (handleOp: commands / Monaco)
        ▲                                                      │
        └──────────────  emit("automation://reply")  ◄─────────┘
```

One thread per request on the Rust side, so a slow op can't stall the accept
loop. Request ids are an atomic counter; pending replies live in a `Mutex<HashMap>`.

## Ops reference

Every op below is implemented in `handleOp` (`src/automation/bridge.ts`), except
`ping` which is host-side in `dispatch` (`apps/desktop/src-tauri/src/commands/automation.rs`).

### Core

| op              | args                  | result                                                                           |
| --------------- | --------------------- | -------------------------------------------------------------------------------- |
| `ping`          | —                     | `"pong"` (answered host-side; no webview round-trip)                             |
| `screenshot`    | —                     | `{ png_base64, width, height, app, title }` — host-side OS window capture (xcap) |
| `exec`          | `{ command: string }` | `{ ran: boolean }` — runs a registered command id via the command registry       |
| `eval`          | `{ expr: string }`    | the value of evaluating `expr` in the page (awaited if it returns a `Promise`)   |
| `activeElement` | —                     | `{ tag, className, id, isTextarea, inMonaco, inXterm }`, or `null`               |
| `contextKeys`   | —                     | snapshot of host context keys (`activeEditorId`, `activeViewerId`, …)            |
| `themeState`    | —                     | `{ activeId, presets:[{id,name,base}], customThemes:[…] }` (via `ctx.theme`)     |
| `setTheme`      | `{ id: string }`      | `{ activeId }` — switch the active theme via `ctx.theme.setActive`               |

`screenshot` is host-side (the webview can't rasterize itself); it captures the
app's OS window via the `xcap` crate. On macOS the first call needs Screen
Recording permission for the app (System Settings › Privacy & Security › Screen
Recording) — until granted it may error or return a black image. Decode
`png_base64` to view or diff the rendered UI.

`exec` dispatches through the **same** command registry that menus and
keybindings use — it does _not_ simulate a click. `{ ran: false }` means the
command id wasn't found / didn't run.

`eval` is a deliberate escape hatch — powerful and unsafe, which is the reason
the surface is triple-gated. Prefer the typed ops; reach for `eval` only when
introspecting something they don't yet cover.

```bash
# Liveness (host-side, no webview)
curl -s localhost:7878 -H 'X-Silo-Automation: 1' -d '{"op":"ping"}'
# {"ok":true,"result":"pong"}

# Run a registered command
curl -s localhost:7878 -H 'X-Silo-Automation: 1' -d '{"op":"exec","args":{"command":"core.newFile"}}'
# {"ok":true,"result":{"ran":true}}

# What holds DOM focus right now
curl -s localhost:7878 -H 'X-Silo-Automation: 1' -d '{"op":"activeElement"}'
# {"ok":true,"result":{"tag":"TEXTAREA","isTextarea":true,"inMonaco":true,"inXterm":false,...}}

# Host context keys
curl -s localhost:7878 -H 'X-Silo-Automation: 1' -d '{"op":"contextKeys"}'

# Escape hatch
curl -s localhost:7878 -H 'X-Silo-Automation: 1' -d '{"op":"eval","args":{"expr":"document.title"}}'
```

### Test-driver ops

These set up scenarios the UI normally reaches only through pickers/clicks (which
automation can't operate). They call the **same `state/workspaces` APIs the UI
does**, so the behavior under test — focus, activation, panel routing — is
faithful. **Intended for a sandbox workspace; never point them at real files.**

| op                  | args                                                 | result                                                                                 |
| ------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `listWorkspaces`    | —                                                    | `{ active, workspaces: [{id,name,folder}] }`                                           |
| `openWorkspace`     | `{ folder: string, name?: string }`                  | `{ id }` — creates **and activates** it                                                |
| `activateWorkspace` | `{ id: string }`                                     | `{ active }` — the active workspace id                                                 |
| `closeWorkspace`    | `{ id: string }`                                     | `{ closed, active }` — soft-close; keeps entry + PTYs (reopen via `activateWorkspace`) |
| `deleteWorkspace`   | `{ id: string }`                                     | `{ deleted, active }` — hard-delete; reaps terminals/PTYs and removes the entry        |
| `processAlive`      | `{ sessionId: string }`                              | `{ alive, error? }` — probe whether a PTY session still exists in the daemon           |
| `listTerminals`     | `{ workspaceId?: string }`                           | `{ terminals: [{id,title,sessionId,kind}] }` — defaults to the active workspace        |
| `openFile`          | `{ path: string }`                                   | `{ editorId, panelId: "editor:<id>" }`                                                 |
| `openTerminal`      | `{ cwd?: string }`                                   | `{ terminalId, panelId: "terminal:<id>" }`                                             |
| `sendText`          | `{ terminalId, text, addNewline? }`                  | `{ sent }` — write to a PTY; force-spawns if the tab never mounted                     |
| `openDiff`          | `{ path: string, mode?: "workingTree" \| "staged" }` | `{ diffId, panelId: "diff:<id>" }`                                                     |
| `activatePanel`     | `{ panelId: string }`                                | `{ activated }`                                                                        |
| `focusTerminal`     | `{ terminalId: string }`                             | `{ focused }` — drives `ctx.terminals.focus()`, including the cross-workspace jump     |
| `activePanel`       | —                                                    | `{ panelId }` — the tab the visible center dock is showing, or `null`                  |
| `showSidePanel`     | `{ id: string }`                                     | `{ shown, slot?, error? }` — expands the panel's slot and clicks its tab               |

Notes:

- `openWorkspace` derives `name` from the last path segment of `folder` if
  omitted, and activates the new workspace.
- `closeWorkspace` is the soft-close counterpart: sets `closedAt`, keeps the
  workspace entry and its terminal records / PTY sessions, and switches active
  away when needed. Reopen with `activateWorkspace` (or `workspaces.reopen`).
- `deleteWorkspace` is the teardown counterpart: it removes the workspace entry
  and (if it was active) switches to the next open one, so a test can then
  delete the sandbox folder it pointed at without racing the dock. It also
  awaits the reap of the workspace's terminals — the reply only returns once
  every live PTY is confirmed killed at the daemon (not just once the kill
  request was sent), so a `processAlive` check right after is not racy.
  `deleted` is `true` only once the id is gone from the store.
- `processAlive` probes a session via `ctx.process.attach` — `{ alive: true }`
  if the pty-host still has it, `{ alive: false }` on a 404 ("session no
  longer exists"). It does not terminate the session.
- `openFile`/`openTerminal`/`openDiff` operate on the **active workspace**; if
  there is none they error with `no active workspace`.
- `showSidePanel` wakes a **lazy-mounted** side panel (file explorer, git,
  themes…): it expands the panel's column and clicks its tab (the active tab is
  local component state, so it must be driven through the real click path, not a
  store write). Use it before asserting on a panel that isn't already showing —
  e.g. `showSidePanel("git-explorer")`. Returns `{ shown:false, error }` for an
  unknown id.
- **Panel id scheme:** `editor:<id>` / `terminal:<id>` / `diff:<id>`. Pass that
  string to `activatePanel`, which dispatches the `app:activate-panel`
  `CustomEvent` (`{ detail: { panelId } }`) on `window` — the same event the
  dock listens for.
- `focusTerminal` is the cross-workspace counterpart of `activatePanel`: it
  drives the real `ctx.terminals.focus()` (the API an extension's side panel
  calls), so it also covers switching to the terminal's workspace first.
  `activePanel` reads dockview's own active panel — the ground truth for "which
  tab am I on", and what a test polls to watch a tab settle or catch it flipping
  away (see `cross-workspace-terminal-focus.it.test.ts` and ADR 0032).
- `openTerminal` opens a `"shell"` terminal; `args.cwd` is optional.

```bash
# Stand up a sandbox workspace, open a file in it, focus that panel
curl -s localhost:7878 -H 'X-Silo-Automation: 1' -d '{"op":"openWorkspace","args":{"folder":"/tmp/silo-sandbox","name":"sandbox"}}'
# {"ok":true,"result":{"id":"ws_…"}}
curl -s localhost:7878 -H 'X-Silo-Automation: 1' -d '{"op":"openFile","args":{"path":"/tmp/silo-sandbox/a.txt"}}'
# {"ok":true,"result":{"editorId":"ed_…","panelId":"editor:ed_…"}}
curl -s localhost:7878 -H 'X-Silo-Automation: 1' -d '{"op":"activatePanel","args":{"panelId":"editor:ed_…"}}'
```

### Output logs

Read and filter entries from the Output panel's log store. Useful for agents and
external tools that need to inspect what the app (or an extension) has logged
without scraping the UI.

| op           | args                                                   | result                                                                                                          |
| ------------ | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `outputLogs` | `{ channel?, level?, search?, limit? }` — all optional | `{ channel, displayName, totalCount, entries:[{timestamp,level,message,data?}], channels:[{key,displayName}] }` |

- **`channel`** — channel key to read (e.g. `"silo:notifications"`,
  `"silo:application"`). Defaults to the first registered channel.
- **`level`** — filter to `"debug"` / `"info"` / `"warn"` / `"error"` / `"all"`
  (default `"all"`).
- **`search`** — case-insensitive substring filter on `message`.
- **`limit`** — max entries returned (default 200, capped from the most-recent end
  of the ring buffer). Each channel holds at most 5,000 entries.
- **`channels`** in the result lists every registered channel — use it to discover
  what's available before choosing one.
- **`totalCount`** is the unfiltered entry count in the channel (before `level` /
  `search` / `limit` are applied), useful to detect whether the buffer has been
  noisy.

```bash
# List all channels and the most-recent 200 entries from the first one
curl -s localhost:7878 -H 'X-Silo-Automation: 1' -d '{"op":"outputLogs"}'

# Last 50 errors from the notifications channel
curl -s localhost:7878 -H 'X-Silo-Automation: 1' \
  -d '{"op":"outputLogs","args":{"channel":"silo:notifications","level":"error","limit":50}}'

# Search across all levels for a keyword
curl -s localhost:7878 -H 'X-Silo-Automation: 1' \
  -d '{"op":"outputLogs","args":{"search":"workspace","limit":100}}'
```

### Monaco introspection (authoritative)

These read **Monaco's own registry and event timeline** — the source of truth.
They are the reason this interface is trustworthy for focus/edit bugs. See the
methodology section for _why_ these beat the DOM.

| op              | args               | result                                                                                                                                     |
| --------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `monacoEditors` | —                  | `[{ uri, hasTextFocus, valueLength, valueTail }]` — live editors from `getEditors()`                                                       |
| `editorsDetail` | —                  | `[{ modelUri, hasTextFocus, textareaIsActiveElement, containerVisible }]` — per-editor focus ground truth, from the tapped-editor registry |
| `focusLog`      | `{ clear?: bool }` | the focus/edit timeline (array), or `{ cleared: true }` when `clear` is set                                                                |
| `editorContent` | `{ uri: string }`  | `{ uri, value }` for the first **model** whose URI _contains_ `uri`, else `null`                                                           |

`editorsDetail` is the focus-handoff diagnostic: it answers, for every live
editor at once, _which editor reports Monaco text-focus_ (`hasTextFocus`) vs.
_which editor's `<textarea>` is the real `document.activeElement`_
(`textareaIsActiveElement`) vs. _which editor is actually on-screen_
(`containerVisible`). **The bug signature is one editor with
`hasTextFocus:true` while a different editor has
`textareaIsActiveElement:true`** — that split is exactly the wrong-tab routing.
It reads the tapped-editor registry maintained in `instrumentMonaco`, not
`getEditors()` (which can return `[]`), so the roster is reliable.

`focusLog` entries are `{ t, type, uri, key?, activeTab?, mismatch? }` where
`type` is one of:

| type                             | meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `edit`                           | a model's content actually changed — **ground truth for "where the text went."** `uri` is the edited file, `key` is the first ~20 chars of inserted text, `activeTab` is the active dock tab, `mismatch:true` means the edited file ≠ the active tab. Also carries a `focus` snapshot captured at the edit instant — `{ activeOwner, activeEl, editors:[{ uri, hasTextFocus, ownsActiveEl, isActiveInputArea }] }` — so you can see which editor physically owned focus when its model changed. |
| `focusText`                      | a Monaco editor gained text focus (`uri` = that file)                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `blurText`                       | a Monaco editor lost text focus                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `createEditor` / `disposeEditor` | an editor instance was created / disposed                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `key`                            | a keystroke (also reused for synthetic markers: `TABCLICK:…`, `DOMFOCUS:…`). For real keys, `mismatch:true` means Monaco's focused file ≠ the active dock tab.                                                                                                                                                                                                                                                                                                                                  |

The log is capped at 3000 entries (oldest dropped). `editorContent` matches by
URI **substring**, and works even if the panel is hidden, as long as the model
is still alive (Silo keeps editors alive across tab switches).

```bash
# Live editors with real focus state
curl -s localhost:7878 -H 'X-Silo-Automation: 1' -d '{"op":"monacoEditors"}'
# [{"uri":"a.txt","hasTextFocus":true,"valueLength":12,"valueTail":"hello world"}]

# Per-editor focus ground truth — catch the hasTextFocus / activeElement split
curl -s localhost:7878 -H 'X-Silo-Automation: 1' -d '{"op":"editorsDetail"}'
# [{"modelUri":"file:///…/A.tsx","hasTextFocus":false,"textareaIsActiveElement":true,"containerVisible":false},
#  {"modelUri":"file:///…/B.tsx","hasTextFocus":true,"textareaIsActiveElement":false,"containerVisible":true}]
# ^ the bug: B reports focus & is visible, but A's hidden textarea is the real activeElement

# Reset the timeline before a fresh reproduction
curl -s localhost:7878 -H 'X-Silo-Automation: 1' -d '{"op":"focusLog","args":{"clear":true}}'
# {"ok":true,"result":{"cleared":true}}

# Read the timeline back
curl -s localhost:7878 -H 'X-Silo-Automation: 1' -d '{"op":"focusLog"}'

# Read a model's content by URI substring (even if its tab is hidden)
curl -s localhost:7878 -H 'X-Silo-Automation: 1' -d '{"op":"editorContent","args":{"uri":"a.txt"}}'
# {"ok":true,"result":{"uri":"file:///tmp/silo-sandbox/a.txt","value":"hello world"}}
```

## Diagnostic methodology — read this before debugging

This section is the hard-won lesson set. The interface is only as trustworthy as
the signals you read through it; these principles are why the Monaco ops exist.

### Tap the source of truth, never scrape the DOM

DOM heuristics repeatedly gave **false readings**: querying `.view-lines`,
guessing the "first visible editor," or searching the DOM for typed text all
lied about where focus and edits actually landed. Monaco's own APIs — reached via
the `@monaco-editor/react` `loader` — are authoritative. Every Monaco op here
goes through that loader, not the DOM.

### `model.onDidChangeContent` is ground truth for "where did the text go"

It fires on the **model that actually changed**, independent of focus or DOM, and
is **undo-proof** — the bridge captures the edit at the moment it happens, so a
later undo can't erase the evidence. The bridge records each as a `focusLog`
entry with `type:"edit"`, the file `uri`, and an `activeTab` + `mismatch` flag.

**`mismatch:true` on an `edit` is the reusable tripwire for the focus-routing
bug** — it means a keystroke's text landed in a file that is _not_ the active
dock tab. If you suspect focus is routing input to the wrong editor, clear the
log, reproduce, and look for `edit` entries with `mismatch:true`.

### Monaco focus events give an authoritative focus timeline

`onDidFocusEditorText` / `onDidBlurEditorText` produce a focus timeline keyed by
file URI. For "does this editor have focus right now," `editor.hasTextFocus()`
(exposed via `monacoEditors`) beats any DOM guessing.

### Gotchas (record these — they cost us time)

- **`document.hasFocus()` is unreliable in this WKWebView.** It often returns
  `false` even when the window is focusable and interactive. **Never gate logic
  on it.**
- **`monaco.editor.getEditors()` can return `[]` even when editors exist.** Don't
  treat an empty `monacoEditors` result as proof there are no editors. The bridge
  hedges by also subscribing to `onDidCreateEditor` and reading `getModels()` via
  the loader — prefer `focusLog` / `editorContent` (model-based) when
  `monacoEditors` looks empty.
- **The bridge hot-reloads via Vite when edited** — editing `bridge.ts` triggers
  a full page reload, so new ops go live **without a manual restart**, but
  **in-memory app state resets** (workspaces/tabs/focusLog are gone). Re-stand
  your scenario after editing the bridge.
- **Editors are kept alive (hidden) across tab switches.** A hidden editor's
  model can still receive input — which is exactly how the focus-routing bug
  manifests. `editorContent` can read a hidden model's value; `mismatch` catches
  input going to one.

### Teardown must assert, not assume

A cleanup bug bit us directly:

- Closing a workspace and then `activateWorkspace(other)` **raced**, leaving a
  workspace whose folder had been deleted as the active one.
- **Deleting a sandbox directory out from under the active workspace broke the
  app.**

Rules:

1. **Switch away first** — activate a different (safe) workspace.
2. **Then delete** the sandbox folder.
3. **Then verify** the end state (`listWorkspaces` shows the expected `active`;
   `monacoEditors` shows the expected editors).

Prefer dedicated teardown ops once they exist (see Roadmap) over assuming a
sequence of unrelated ops cleaned up correctly.

## Recommended workflow

To verify a change or chase an intermittent focus/edit bug:

1. **Clear** the timeline: `focusLog` with `{clear:true}`.
2. **Reproduce** the action (via `exec`, the test-driver ops, or by hand).
3. **Read** `focusLog` and filter for `type:"edit"` and `mismatch:true`.
4. **Confirm** with `editorContent` that the text landed in the file you expect
   (and not in a hidden one).

### Recipe — new-file focus check

A new file should take editor focus without a second click:

```bash
curl -s localhost:7878 -H 'X-Silo-Automation: 1' -d '{"op":"focusLog","args":{"clear":true}}'
curl -s localhost:7878 -H 'X-Silo-Automation: 1' -d '{"op":"exec","args":{"command":"core.newFile"}}'
# focus should already be in the editor:
curl -s localhost:7878 -H 'X-Silo-Automation: 1' -d '{"op":"activeElement"}'
# expect inMonaco:true, isTextarea:true
curl -s localhost:7878 -H 'X-Silo-Automation: 1' -d '{"op":"monacoEditors"}'
# expect the new editor with hasTextFocus:true
```

### Recipe — tab-switch mismatch tripwire

Confirm that typing after switching tabs lands in the _active_ tab, not a hidden
one:

```bash
curl -s localhost:7878 -H 'X-Silo-Automation: 1' -d '{"op":"focusLog","args":{"clear":true}}'
# (switch tabs + type, by hand or via driver ops)
curl -s localhost:7878 -H 'X-Silo-Automation: 1' -d '{"op":"focusLog"}' \
  | jq '.result[] | select(.type=="edit" and .mismatch==true)'
# any output here is the bug: text went to a file that is NOT the active tab
```

## Writing integration tests

Integration tests are ordinary Vitest files named `*.it.test.ts`. They run in
the `integration` project (Node env, see `vitest.config.ts`) and drive the live
app through the typed client in [`src/automation/client.ts`](../src/automation/client.ts)
— no hand-written `curl`. The first real one is
[`src/automation/focus-handoff.it.test.ts`](../src/automation/focus-handoff.it.test.ts),
the regression guard for the tab-switch focus bug.

```ts
import { SiloAutomation } from "./client";
const silo = new SiloAutomation();
const available = await silo.available(); // skip the suite if no app is up
describe.skipIf(!available)("…", () => {
  /* openWorkspace / openFile / activatePanel / editorsDetail */
});
```

Conventions that keep them reliable:

- **Skip when no app is reachable** (`await silo.available()` + `describe.skipIf`)
  so `pnpm test` (unit) stays green without a running app; `pnpm --filter silo test:it`
  expects one (`pnpm dev`).
- **Poll, don't snapshot.** Focus lands across animation frames, so assert with
  `expect.poll(...)`. A stuck bug state never settles, so the poll times out —
  which is the failure you want.
- **Scope to your own editors by `editorId`**, not basename: `editorsDetail` is
  global and names collide across workspaces.
- **Tear down with `deleteWorkspace`** (it switches active away for you), then
  delete the sandbox folder — leave no workspace entry or files behind.

## Roadmap / future work

This is the minimal-plus surface. Natural extensions, roughly in order:

- **More input ops:** `type` (synthetic input into the focused editor),
  `dispatchKey`, `waitFor` (poll an `expr`/op until truthy), `screenshot`
  (webview capture).
- **WebDriver/BiDi subset** instead of the custom JSON, if third parties want to
  drive Silo with off-the-shelf tooling (more work; only once there's demand).
