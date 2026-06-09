---
status: draft
created: 2026-05-29
---

# 0009. Language intelligence — TS/JS via `tsserver`

_Lifted from the former `LSP-PLAN.md`; this is the RFC of record. The detailed
design + the performance-budget gate below are the proposal._

---

## TL;DR

Bring back real Go to Definition, Find References, Rename, hover, completion, and
semantic diagnostics for TS/JS by spawning the real **`typescript-language-server`**
(a thin LSP wrapper around `tsserver`, the same engine VSCode uses) as a Tauri
child process, one per workspace, and bridging it to Monaco.

**Governing constraint: the app must not feel sluggish.** This is a hard gate, not
a nice-to-have. If the spike (Phase 0) can't meet the performance budget below, we
**do not ship this** — we keep the current "fast highlighter" behavior. We would
rather have no language intelligence than a laggy editor.

This document is a reference to pick up later. Nothing here is built yet.

---

## Goal / non-goals

### Goals

- Real TS/JS intelligence for the user's own code **and** `node_modules` (library
  navigation, accurate diagnostics), driven by the actual `tsconfig`.
- One language server per workspace folder, with instant switching for hot
  workspaces and a bounded memory ceiling.
- Zero perceptible main-thread jank. Typing, scrolling, and switching tabs stay
  as snappy as they are today.
- Cleanly reversible: a single feature flag returns the app to today's behavior.

### Non-goals (for now)

- Other languages (Rust/Python/Go). The architecture should _allow_ adding them
  later (server registry keyed by language), but we only wire TS/JS now. Dave is
  ~99% TS/JS.
- The `@codingame/monaco-vscode-api` / `monaco-languageclient` stack (Option C).
  We hand-roll a thin LSP client to avoid replacing the `monaco-editor` dependency
  and fighting the existing `@monaco-editor/react` + dockview setup. Revisit only
  if multi-language becomes a priority.

---

## Background: why these features are off today

The embedded Monaco TS worker is starved — only the single open file is loaded as a
model, with no `node_modules`, no sibling files, no compiler options. So it produced
bogus errors. We deliberately made the editor a **highlighter, not an IDE**:

- `src/docked/monaco-setup.ts` → `ensureMonaco()`: `setDiagnosticsOptions({
noSemanticValidation: true, noSyntaxValidation: false })` (semantic off).
- `src/docked/monaco-setup.ts` → `hideBrokenSemanticActions()` + `BROKEN_SEMANTIC_ACTION_IDS`:
  strips Go to/Peek Definition·Declaration·Type·Implementation·References + Rename
  from the context menu. Called from `TextViewer` `onMount` and both inner editors
  of `DiffPanel`.
- Per-editor **synthetic** model URIs (`file:///${editorId}/<name>` in `TextViewer`,
  `file:///${diffId}/...` in `DiffPanel`) — chosen because, with semantics off, the
  URI only needed the right _extension_ (so `.tsx` parses as JSX) and uniqueness (so
  models never share/dispose across tabs).

**This plan reverses each of those once the language server is wired up.** See
"Touchpoints to revert" below.

---

## Why this fits the workspace model

Two facts about workspaces (`src/state/workspaces.ts`, `src/state/types.ts`):

1. **A workspace is rooted at one `folder`** (+ optional `extraFolders`) → maps 1:1
   to an LSP/`tsserver` project root.
2. **Only one workspace is active at a time.** `activateWorkspace()` saves the
   outgoing dock layout and restores the incoming one; inactive workspaces have **no
   editors mounted**. Closed workspaces (`closedAt`) linger in state but render
   nothing.

So the server lifecycle bolts directly onto `activateWorkspace` / `closeWorkspace`,
and `tsserver`'s natural granularity (one process per project root, lazy type
loading) is exactly what we want.

---

## Architecture

```
┌─────────────────────────── Renderer (webview) ────────────────────────────┐
│                                                                            │
│  Monaco (per editor)                                                       │
│    └─ provider registrations (completion, hover, definition, references,   │
│       rename, signatureHelp, documentHighlight) ── all async, cancellable  │
│                                                                            │
│  LspClient (src/services/tauri-lsp-client.ts)   ← mirrors TauriTerminalClient│
│    • JSON-RPC framing over Tauri                                           │
│    • request/response correlation + cancellation                          │
│    • diagnostics → monaco.editor.setModelMarkers                          │
│                                                                            │
│  LspManager (src/services/lsp-manager.ts)                                  │
│    • workspace → server handle (LRU warm pool, cap = 2)                    │
│    • document sync: Monaco model lifecycle ↔ didOpen/didChange/didClose    │
│    • hooks: activateWorkspace / closeWorkspace                             │
└───────────────────────────────┬────────────────────────────────────────────┘
                invoke("lsp_*")  │  listen("lsp_message:<serverId>")
┌───────────────────────────────┴────────────────────────────────────────────┐
│  Rust (src-tauri/src/commands/lsp.rs)         ← mirrors terminal.rs          │
│    • spawn typescript-language-server --stdio (Command::new + piped stdio)  │
│    • read loop: parse LSP Content-Length frames from stdout → emit events   │
│    • write: frame + write JSON-RPC to stdin                                 │
│    • lifecycle: kill/restart, exit events                                   │
│                                                                            │
│  child process: typescript-language-server (Node) → tsserver               │
│    reads the real filesystem incl. node_modules + tsconfig (lazy)           │
└────────────────────────────────────────────────────────────────────────────┘
```

The transport pattern is **already solved in this repo** by terminals:
`invoke("terminal_create")` → `sessionId`; `listen("terminal_output:<id>")` for
streamed stdout; `invoke("terminal_write")` for stdin. We mirror it exactly:
`invoke("lsp_start")` → `serverId`; `listen("lsp_message:<id>")`; `invoke("lsp_send")`.

---

## Components

### 1. Rust: `src-tauri/src/commands/lsp.rs` (+ register in `lib.rs`)

Mirror `commands/terminal.rs`. State: a `Mutex<HashMap<ServerId, ServerHandle>>` where
`ServerHandle` owns the child + stdin writer.

Commands:

- `lsp_start(root: String, server: String) -> ServerId` — spawn the language server
  with `cwd = root`, stdio piped. Spawn a thread that reads stdout, parses
  `Content-Length`-framed LSP messages, and emits `lsp_message:<serverId>` events
  (payload = raw JSON string). Also forward stderr to a log event for debugging.
- `lsp_send(server_id, message: String)` — frame (`Content-Length: N\r\n\r\n` + body)
  and write to the child's stdin.
- `lsp_stop(server_id)` — graceful `shutdown`/`exit` then kill; emit `lsp_exit:<id>`.

Notes:

- Use `tokio`/async or a dedicated reader thread per server (terminal.rs already
  shows the threading model used in this app — match it).
- Backpressure: stdin writes are small (requests); stdout can be large (initial
  diagnostics, completion lists). Stream, don't buffer whole-program dumps.

### 2. TS transport: `src/services/tauri-lsp-client.ts`

Mirror `TauriTerminalClient`. Responsibilities:

- `start(root, serverId)`, `send(serverId, json)`, `stop(serverId)`.
- One `listen("lsp_message:<id>")` bridge per server (guard against double-register
  on HMR — terminal client already documents this gotcha).
- JSON-RPC layer: monotonic request ids, a `Map<id, {resolve, reject}>`, route
  responses by id, route notifications (`textDocument/publishDiagnostics`, etc.) to
  subscribers. Support `$/cancelRequest`.

### 3. Lifecycle: `src/services/lsp-manager.ts`

The heart of the workspace mapping + memory ceiling.

- `Map<workspaceId, ServerEntry>` where `ServerEntry = { serverId, root, initialized,
openDocs: Set<uri>, lastUsedAt }`.
- **Lazy spawn:** only when a TS/JS file is first opened in a workspace. Plain text,
  markdown, logs, etc. never spawn a server.
- **LRU warm pool, cap = 2 (tunable):** on `activateWorkspace`, reuse if warm; on
  switch-away, keep warm; evict (`lsp_stop`) the least-recently-used beyond the cap.
- **Hooks:** subscribe to `activateWorkspace` / `closeWorkspace`
  (`src/state/workspaces.ts`). `closeWorkspace` → stop that workspace's server.
- `initialize` handshake sends `rootUri`, `workspaceFolders` (folder + `extraFolders`),
  and capabilities. Cache the server's declared capabilities; never call a feature the
  server didn't advertise.

### 4. Document sync

LSP needs `didOpen`/`didChange`/`didClose` mirroring Monaco's model lifecycle, keyed by
**real `file://` URIs**.

- On editor mount (`TextViewer` `onMount`): `didOpen` with the real path + version 0.
- On `onChange`: **debounced** `didChange` (incremental ranges if the server supports
  it, else throttled full-text). See performance budget.
- On unmount/close: `didClose`.
- `tsserver` reads files from disk itself, so we don't push the whole project — only
  the buffers the user has open, plus their in-memory edits.

### 5. Monaco providers (the user-visible features)

Register language providers that forward to the manager → client → server, translating
Monaco ⇄ LSP types. All are **async and cancellable** (Monaco passes a
`CancellationToken`; wire it to `$/cancelRequest`).

- `registerCompletionItemProvider` (+ resolve for docs/details)
- `registerHoverProvider`
- `registerDefinitionProvider` (Go to Definition)
- `registerReferenceProvider` (Find References)
- `registerRenameProvider` (+ prepareRename)
- `registerSignatureHelpProvider`
- `registerDocumentHighlightProvider`
- (optional later) code actions / quick fixes, formatting
- **Diagnostics:** subscribe to `publishDiagnostics` → `monaco.editor.setModelMarkers`.
  Re-enable semantic validation by removing the suppression in `ensureMonaco()` for
  files backed by a live server.

Registration is **global per language** in Monaco (not per editor), so register once,
and have the provider resolve the right server from the active document's URI.

---

## Performance design (the part that decides whether we ship)

Design tenets, in priority order:

1. **The main thread never blocks on the server.** Every provider is async; the UI
   never `await`s synchronously. `tsserver` runs in its own OS process, off the
   renderer entirely — this is the single biggest win vs. the in-browser worker.
2. **Lazy everything.** No server until a TS/JS file is opened. No eager project
   scan from our side — `tsserver` loads lazily and we don't fight it.
3. **Debounce + coalesce.**
   - `didChange`: debounce ~150–250 ms; coalesce bursts. Never one round-trip per
     keystroke.
   - Completion: debounce trigger; cancel the in-flight request on the next keystroke
     via `$/cancelRequest`.
   - Diagnostics are push (server-driven) — just throttle marker application.
4. **Cancellation is mandatory.** Wire Monaco's `CancellationToken` to
   `$/cancelRequest` for every provider. Stale requests must die, not pile up.
5. **Bounded memory.** Warm-pool cap (default 2) is a hard ceiling on concurrent
   servers. Evicting kills the process and frees its RAM. Expose the cap as a setting.
6. **No work for non-TS files.** Markdown/logs/images never touch any of this.
7. **Graceful, silent degradation.** If a server crashes, is slow to start, or the
   binary is missing: the editor keeps working as today (highlighter). Features just
   aren't there; no spinner-of-death, no blocking modal.

### Performance budget (the ship/no-ship gate)

Measured on Dave's typical repo on his machine:

- Typing latency: **no measurable added input lag** vs. today (P99 keystroke-to-paint
  unchanged).
- Completion popup: appears < **150 ms** P50 on a warm server after the debounce.
- Go to Definition: < **200 ms** P50 within the project.
- Workspace switch to a **warm** server: **instant** (no reload).
- Workspace switch to a **cold** server: editor is usable immediately; intelligence
  arrives within a few seconds (large monorepo: tens of seconds for first index, then
  fast). Cold indexing must **never** block typing or scrolling.
- Idle renderer CPU returns to baseline (no busy-loops, no polling).
- Memory: ≤ ~2× one server's footprint with the default pool (VSCode-equivalent).

**If Phase 0 can't hit these, stop. Keep the highlighter.**

### Feature flag / kill switch

A single setting, e.g. `experimental.tsLanguageServer` (default **off** until proven),
gated in `lsp-manager`. When off (or on crash/missing binary), the app behaves exactly
as today: synthetic URIs, semantics suppressed, nav actions hidden. No code paths in
the editor assume the server exists.

---

## Touchpoints to revert when the server is live (flag-gated)

- `src/docked/monaco-setup.ts`
  - `ensureMonaco()` diagnostics: stop suppressing `noSemanticValidation` for
    server-backed files (or rely on LSP markers and keep Monaco's own TS worker
    quiet to avoid double diagnostics — decide in Phase 1, see open questions).
  - `hideBrokenSemanticActions`: no longer hide the nav group when a server is
    attached. Easiest: make hiding conditional on "no server for this doc."
- `src/extensions/builtin/editor/TextViewer.tsx`
  - Replace the synthetic `file:///${editorId}/<name>` URI with the **real file path**
    URI so the model ↔ document ↔ server all agree. Handle untitled buffers (no path →
    no server; stays highlighter-only).
- `src/extensions/builtin/editor/DiffPanel.tsx`
  - Diff is read-only; likely leave it server-less (no diagnostics/nav needed in a
    diff). If we do attach, it needs real URIs too. Default: **don't** attach a server
    to diffs — keeps memory and complexity down.

---

## Shipping the server binary (decision needed)

`typescript-language-server` is a Node package. Options, with the recommendation:

- **A. Tauri sidecar (recommended):** bundle a packaged binary (e.g. via `pkg`/`bun
build --compile` of `typescript-language-server` + `typescript`) as a Tauri
  `externalBin` sidecar. No Node dependency on the user's machine; version pinned and
  reproducible. Most robust for a desktop app.
- **B. Require Node + `npx`:** simplest to prototype, but depends on the user's
  environment and version drift. Fine for the Phase 0 spike, not for shipping.
- **C. Bundle `node_modules` + a Node runtime:** heavier, more moving parts than A.

Use **B for the spike**, plan **A for real**.

---

## Phased plan

### Phase 0 — Spike (de-risk; ~2–3 days) — **decision gate**

- Rust `lsp_start/send/stop` for one hard-coded workspace, `npx
typescript-language-server --stdio`.
- Minimal TS client + JSON-RPC; `initialize`; `didOpen` the active file.
- Wire **only** completion + go-to-definition end-to-end in `TextViewer`.
- Measure against the performance budget on a real repo.
- **Gate:** budget met → continue. Not met / feels sluggish → stop, document why,
  keep the highlighter. (This is the "I'd rather not have LSP" exit.)

### Phase 1 — Core, single workspace (~3–4 days)

- Real `lsp-manager` (single server, no pool yet), real-path URIs (revert synthetic),
  full document sync with debounced `didChange`, cancellation on all requests.
- Diagnostics → markers; resolve double-diagnostics question.
- Full provider set: hover, references, rename, signatureHelp, documentHighlight.
- Un-hide nav actions when a server backs the doc.

### Phase 2 — Workspace lifecycle + memory ceiling (~2–3 days)

- LRU warm pool (cap 2, tunable), hooks into `activateWorkspace`/`closeWorkspace`.
- Lazy spawn on first TS/JS open; evict + `lsp_stop` on cap/close.
- Multi-root (`extraFolders`) via `workspaceFolders`.
- Crash recovery: detect `lsp_exit`, respawn on next request, re-`didOpen` open docs.

### Phase 3 — Hardening + ship prep (~2–3 days)

- Sidecar binary packaging (option A); remove `npx` dependency.
- Feature flag default decision; settings UI for pool cap + enable/disable.
- Perf regression pass; large-repo cold-start behavior; idle CPU verification.
- Docs + telemetry counters (server starts, crash rate, request latencies).

**Rough total:** ~1.5–2 weeks of focused work, gated after Phase 0.

---

## Risks & mitigations

| Risk                                        | Mitigation                                                                  |
| ------------------------------------------- | --------------------------------------------------------------------------- |
| Sluggishness / input lag                    | Off-process server, async+cancellable providers, debounce; **Phase 0 gate** |
| Cold-start on huge monorepo blocks UI       | Editor usable immediately; intelligence streams in; never block typing      |
| Memory growth across many workspaces        | LRU pool cap kills idle servers; default 2                                  |
| Double diagnostics (Monaco TS worker + LSP) | Keep Monaco semantic off; LSP is the sole source of markers                 |
| Server crash                                | `lsp_exit` → silent fallback to highlighter → respawn on demand             |
| Binary distribution                         | Tauri sidecar (option A), version-pinned                                    |
| HMR double event bridge                     | Same guard pattern as `TauriTerminalClient.setupSessionListeners`           |
| Untitled buffers / non-file URIs            | No server; stay highlighter-only                                            |

## Open questions / decisions for later

- **Diagnostics ownership:** LSP-only markers vs. also letting Monaco's TS worker run.
  Lean: LSP-only (avoid duplication + the worker can't see node_modules anyway).
- **Pool cap default:** 2? Make it a setting; measure memory on real workspaces first.
- **Diffs:** attach a server or stay server-less? Lean: server-less.
- **Sidecar build toolchain:** `pkg` vs `bun --compile` vs bundled node — pick in Phase 3.
- **Formatting/code-actions:** in scope for v1 or defer? Lean: defer past Phase 1.

## Acceptance criteria

- All previously-hidden context-menu actions work for TS/JS, including cross-file and
  into `node_modules`.
- Performance budget met (see above). No measurable typing/scroll regression.
- Switching between two hot workspaces is instant; memory bounded by the pool cap.
- Feature flag off → byte-for-byte today's behavior.

## Rollback

Flip the feature flag off. No data migration. The highlighter path is the permanent
fallback and stays maintained.

## Reference: key files

- Transport pattern to mirror: `src/services/tauri-terminal-client.ts`,
  `src-tauri/src/commands/terminal.rs`
- File events: `src/services/tauri-watch.ts`, `src-tauri/src/commands/watch.rs`
- Rust command registration: `src-tauri/src/lib.rs` (`invoke_handler`)
- Monaco setup / current suppressions: `src/docked/monaco-setup.ts`
- Editors: `src/extensions/builtin/editor/TextViewer.tsx`,
  `src/extensions/builtin/editor/DiffPanel.tsx`
- Workspace lifecycle: `src/state/workspaces.ts` (`activateWorkspace`,
  `closeWorkspace`), `src/state/types.ts` (`Workspace`, `EditorRecord`)
