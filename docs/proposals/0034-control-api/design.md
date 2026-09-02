# Design — 0034. Control API

How the requirements are satisfied. Intent, not a copy of the source. Working
artifact — removed when the proposal collapses; the durable reasoning moves into
an ADR.

## Architecture

Three halves and a wire between them, all in this repo:

```
silo (short-lived process)                    Silo.app (running instance)
──────────────────────────                    ─────────────────────────────
main.rs                                       commands/control/
  local_flag_response  ──► --help/--version      listener.rs   accept loop, thread
  control_request      ──► Control mode          registry.rs   op allowlist
        │                                        paths.rs      socket location
        ▼                                        envelope.rs   shared shapes
  commands/control/client.rs                            │
        │  connect + 1 req/1 resp                       │ control://request
        └──────────── socket / named pipe ──────────────┤
                                                        │ control://reply
                                                 apps/desktop/src/control/
                                                   dispatch to op handlers
                                                   reading host state
```

The client half runs **before Tauri init**, in `main.rs`, immediately after the
existing `local_flag_response` check. That is what keeps a Control command from
touching `tauri-plugin-single-instance`, focusing a window, or waking a cold
instance (R1). It is the same seam ADR 0047 already established for Local mode.

The server half is a blocking accept loop on its own thread, registered in
`lib.rs`'s `setup` next to `automation::register` — but, unlike automation, it
is compiled into **every** build and gated by the filesystem rather than by a
Cargo feature.

## Components

### `commands/control/paths.rs` — where the socket lives

ADR 0022 tier 3, alongside the PTY host's sockets and namespaced the same way.
`crates/pty-host/src/paths.rs` already owns the runtime-base precedence
(`$XDG_RUNTIME_DIR` → `$TMPDIR` → `/tmp`) and the `SILO_PTY_NS` namespace; it
becomes the shared source by making its pure base resolver public rather than
duplicating that precedence a second time. The control path is a sibling
directory, not a file inside the PTY namespace, so reaping one never touches the
other:

- Unix: `<runtime-base>/silo-ctl/<ns>/control.sock`, directory `0700`, socket
  `0600`.
- Windows: `\\.\pipe\silo-control-<ns>`, created with an owner-only security
  descriptor. No filesystem path, so the length constraint does not apply.

`silo-ctl` is deliberately short: on macOS the base is
`/var/folders/…/T` (~49 chars), and the whole path must stay under
`sockaddr_un`'s ~104-byte `sun_path` limit (R2). `pty-host` is a `cfg(unix)`
dependency, so the Windows arm resolves its pipe name from the identity directly
without reaching for that crate.

The namespace `<ns>` is the existing `SILO_PTY_NS` value (`prod`, `dev`, …),
derived from the bundle identifier in `lib.rs`. Reusing it — rather than minting
a second namespace — is what guarantees a Dev client and a prod instance can
never address each other (R2).

### `commands/control/listener.rs` — the server

A blocking local-socket listener on a dedicated thread. `interprocess` gives one
API over Unix sockets and Windows named pipes and handles the pipe's security
descriptor; on Unix the bound path is `chmod`ed to `0600` immediately after bind,
because the crate honours the process umask and umask alone is not a guarantee.

Two behaviors worth stating:

- **Bind on webview-ready, not on `setup`.** The listener binds only after the
  webview calls a `control_ready` command. Socket presence therefore means "an
  instance is running _and_ able to answer", which is exactly the predicate
  `--launch` polls for (R7) and removes a class of races where a request arrives
  before any handler exists.
- **Stale-socket takeover.** If the path already exists at bind time, connect to
  it. A successful connect means a live instance owns it — refuse to bind and log
  it. A refused connect means a crashed predecessor: unlink and bind (R2). The
  path is unlinked again on clean shutdown.

Per connection: read one newline-terminated JSON request with a size cap
(64 KiB) and a read deadline, dispatch, write one newline-terminated response,
close. No keep-alive, no pipelining — one request per connection keeps
correlation trivial on the wire and connection lifetime bounded.

### `commands/control/registry.rs` — the allowlist

A static table of ops. Each entry declares its name, its `read` | `mutate` tier,
and whether it requires confirmation (the no-prompt hook, R6). Dispatch is a
lookup: a name not in the table is `denied` before anything is emitted (R5).
This table is the security boundary — the host gaining a new capability never
gains the channel a new op.

| Op          | Tier   | Confirms | Backing command  |
| ----------- | ------ | -------- | ---------------- |
| `status`    | read   | no       | `silo status`    |
| `ws.list`   | read   | no       | `silo ws list`   |
| `agent.run` | mutate | no       | `silo agent run` |

`agent.run` needs no confirmation today — launching a profile in a terminal has
no GUI modal behind it. The `confirms` column exists because the _next_ mutate op
will, and R6 has to be enforceable at the table rather than remembered per op.

### `commands/control/envelope.rs` — the shared shapes

One serializer for both success and failure, one `ErrorCode` enum, one
`exit_code()` mapping. Every op and the client both go through it (R3), so no op
can invent a response shape and no call site can invent an exit code.

### `commands/control/client.rs` — the client

Parses the Control-mode verbs, connects, sends, reads, renders, exits.
`control_request(argv, cwd)` mirrors the existing `resolve_cli_request` in style:
pure, unit-testable, returns `None` for every invocation that is not Control
mode so the existing Forward path is untouched (R12).

Rendering is two modes over the same envelope: `--json` prints it verbatim on
stdout; human mode prints `data` as readable text on stdout, or `error.message`
on stderr. The exit code is the same in both.

### `apps/desktop/src/control/` — the webview handlers

The op handlers, mirroring `apps/desktop/src/cli/`'s structure. Each handler is a
pure function from host state (read through the `store` proxy) plus request args
to a `data` object or an error code — the same shape `.agents/skills/silo-testing`
prescribes, so the handlers unit-test without a renderer (R9, R10, R11).

`agent.run`'s handler reuses `applyCliAgentRun`'s existing resolution logic; the
change is that it now **returns** the created terminal id (or an error code)
instead of logging to the Output channel, and that an unresolvable workspace is an
error rather than a create (R11).

## Data flow

A warm `silo ws list --json`:

1. `main.rs` — `local_flag_response` returns `None`; `control_request` matches
   `ws list` and yields `{ op: "ws.list", args: {}, cwd }`.
2. Client connects to the identity's socket. Connect fails → `not-running`
   (exit 3), or, with `--launch`, spawn + poll to the deadline (R7).
3. Client writes `{ v, id, op, args, cwd }\n` and blocks on the read deadline.
4. Listener validates size and JSON, looks the op up in the registry, allocates a
   pending entry keyed by a monotonic host-side id, and emits `control://request`
   to the webview.
5. The webview dispatches to the `ws.list` handler, builds `data` from the
   workspace store, and emits `control://reply` with the same id.
6. The listener matches the id, removes the pending entry, wraps the payload in
   the envelope, writes one line, closes.
7. Client prints the line, exits 0.

Timeout (R8) has one deadline on each side: the listener gives the webview a
bounded window (5s, matching `automation.rs`'s `REPLY_TIMEOUT`) and answers
`timeout` itself if it lapses, dropping the pending entry; the client's own read
deadline is slightly longer so a `timeout` envelope normally arrives as data
rather than as a client-side guess. A client that disconnects first causes the
write to fail, which is discarded — the pending entry is already gone.

Correlation is per-connection on the wire and by id in the pending map. Two
concurrent `silo` processes hold separate connections and separate pending
entries.

## APIs / interfaces

Nothing here touches `@silo-code/sdk`, `ctx`, or any extension surface, so the
`silo-docs-sync` workflow does not apply. The public surfaces that do change are
the CLI and its documentation.

**Wire request:**

```jsonc
{ "v": 1, "id": "<uuid>", "op": "ws.list", "args": {}, "cwd": "/abs/path" }
```

**Wire + `--json` response** (R3):

```jsonc
{
  "v": 1,
  "ok": true,
  "data": {},
  "silo": { "version": "0.63.0", "identity": "com.silo.desktop" }
}
{
  "v": 1,
  "ok": false,
  "error": { "code": "not-found", "message": "No workspace at /x" },
  "silo": { "version": "0.63.0", "identity": "com.silo.desktop" }
}
```

`v` versions the **envelope**, not the command. It changes only on a breaking
envelope change; per-command `data` shapes are documented per verb and grow
additively (proposal decision 6).

**Error codes and exit codes** (R4):

| Code           | Exit | When                                                    |
| -------------- | ---- | ------------------------------------------------------- |
| _(success)_    | 0    | The op ran and answered.                                |
| `internal`     | 1    | Host-side failure, unparseable reply, socket I/O error. |
| `invalid-args` | 2    | Usage error. Detected client-side; never sent.          |
| `not-running`  | 3    | No instance listening on this identity's socket.        |
| `not-found`    | 4    | Named workspace, profile, or terminal does not exist.   |
| `denied`       | 5    | Op not in the allowlist, or confirmation required.      |
| `timeout`      | 6    | The instance did not answer within the deadline.        |

**New CLI surface:**

```
silo status [--json] [--launch]
silo ws list [--json] [--launch]
silo agent run [--profile <id>] [--ws <folder|.|ws_id>] [--json] [--launch] [--yes]
```

`ws` becomes a live reserved noun (ADR 0047 rule 4 already reserves it): `silo ws`
and unknown `ws` verbs report usage rather than opening a folder, matching how
`agent` already behaves. `./ws` and `silo -- ws` still open a folder of that name.

## Persistence

None. The socket is ephemeral runtime state (ADR 0022 tier 3) — created on
webview-ready, removed on shutdown, recreatable, and correctly lost when the
runtime dir is reaped. Nothing in this change writes to the config or app-state
tiers, and the Control API deliberately adds no token or credential file: the
socket's file mode is the whole authorization story (proposal decision 1).

## Error handling

| Failure                              | Handling                                                                     |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| Socket absent / connect refused      | `not-running`, exit 3; `--launch` converts it to a spawn-and-poll (R7).      |
| `--launch` deadline exceeded         | `timeout`, exit 6 — distinct from `not-running`, so a slow start is legible. |
| Stale socket file at bind            | Connect-probe, then unlink and rebind (R2).                                  |
| Live socket already bound            | Refuse to bind, log to the Output channel; the first instance keeps it.      |
| Request over the size cap / not JSON | Refused before dispatch, `internal`; nothing is emitted to the webview.      |
| Unknown op                           | `denied` at the registry lookup (R5).                                        |
| Webview does not reply in the window | `timeout`, pending entry dropped (R8).                                       |
| Op needs confirmation, no `--yes`    | `denied` with a message naming the required confirmation (R6).               |
| Client disconnects mid-flight        | Write failure discarded; no pending entry leaks (R8).                        |

Host-side logging goes to the Output panel via `createHostChannel`, never
`console.*`. The channel is a genuinely new subsystem with its own diagnostic
surface, so it gets its own — `silo:control` / "Control" — rather than
overloading `silo:application`.

## Testing strategy

**Rust (`cargo test`, co-located `#[cfg(test)] mod tests`, matching `cli.rs`):**

- `control_request` parsing: every Control verb, every flag form (`--json`,
  `--launch`, `--yes`, `--profile=x`), `None` for every Forward/local invocation,
  and `--` still forcing a path.
- Envelope serde round-trip; success carries no `error` and failure no `data`.
- Exhaustive `ErrorCode` → exit-code assertions, so adding a code without a
  mapping fails the build's tests.
- Socket path resolution and namespacing, using `pty-host`'s existing
  `test_support` env-redirection helper; an assertion that the resolved path
  stays under the `sun_path` limit for each base.
- Listener behavior against a real socket in a temp runtime dir: stale-file
  takeover, live-socket refusal, size cap, unknown op → `denied`, and two
  concurrent clients each getting their own answer.

**TypeScript (Vitest, pure-logic per `.agents/skills/silo-testing/SKILL.md`):**

- Each op handler as a pure function over store state seeded through the `store`
  proxy: `status` counts and active workspace; `ws.list` open vs soft-closed vs
  active, and id round-tripping into `--ws`; `agent.run` success returning a
  terminal id, unknown profile → `not-found`, unresolvable `--ws` → `not-found`,
  cwd in no workspace → error rather than create.
- Registry coverage: every registered op has a handler, and every handler is
  registered.

**Manual verification** via the `verifier-gui` skill for the end-to-end path
(real app, real socket, real exit codes), since that is the one thing unit tests
cannot assert.

## Constraints and existing decisions

- **ADR 0047** (CLI command grammar) — Control is the mode this builds. Rule 5
  (`--ws`, resolution order, never a silent create), rule 7 (`--json`, never
  prompt, meaningful exit codes, idempotency) are binding. `agent.run` moving to
  Control is where ADR 0047's noted divergence in the shipped `silo agent run`
  gets corrected.
- **ADR 0022** (on-disk storage layout) — the socket is tier 3, identity-keyed;
  `sun_path` length is a hard constraint; nothing is written to tiers 1 or 2.
- **ADR 0012** (dev automation RPC) — the round-trip-through-the-webview pattern
  and its 5s reply timeout are the precedent this reuses. The two surfaces stay
  separate; convergence is explicitly deferred (proposal decision 4).
- **ADR 0011** (editor and terminal are core) — `agent.run` returns a terminal
  id, a core-surface handle, not an extension-owned one.
- **ADR 0028** (sealed agent detection) — a CLI-launched agent terminal still
  becomes an agent by detection; the Control response reports the terminal id, it
  does not assert agent-ness.
- **AGENTS.md boundaries** — this is host↔CLI only. No extension reaches it, no
  `ctx` member is added, and the webview handlers live in `apps/desktop/src`
  beside the existing CLI handlers rather than in any extension package.
- **No async runtime.** The crate has no tokio; the listener is a blocking
  accept loop on its own thread, like `automation.rs`'s `tiny_http` server.
- **One new dependency** (`interprocess`) for the Windows named-pipe arm. The
  alternative — std `UnixListener` plus a hand-rolled `windows-sys` pipe — avoids
  the dependency but hand-rolls a security descriptor, which is the wrong thing
  to hand-roll.
