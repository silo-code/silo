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
        ├─► disk_read.rs   (ws list base)        envelope.rs   shared shapes
        ▼                                        status.rs     host-answered
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

The server half is a blocking accept loop on its own thread, started in
`lib.rs`'s `setup` next to `automation::register` — but, unlike automation, it is
compiled into **every** build and gated by the filesystem rather than by a Cargo
feature.

### The client and the instance are the same executable

Both `silo` shims — `~/.local/bin/silo` from `cli_install_shim` and the managed
one from `ensure_managed_shim` — `exec` the app binary, and the managed shim is
rewritten on every launch. So in normal use the process sending a request and the
process answering it are the same build, and version skew is not a case the wire
format has to negotiate.

Two consequences the rest of this design leans on:

- **The client can synthesize a complete envelope itself** (R3). A `not-running`
  or `invalid-args` error never reaches an instance, but the client still fills
  `silo.version` / `silo.identity` from its own build — and those are the right
  values, because it _is_ the instance's build.
- **The envelope's version field is for third-party consumers**, not for
  handshaking. Scripts and agents parsing `--json` are its audience, so it is
  carried on the **response only**; a request-side version field would be
  ceremony between two copies of one binary.

The one genuine skew window is an app update replacing the binary on disk while
an older instance is still running. An unknown `op` from a newer client is
already `denied` by the registry (R5), which is the correct answer; nothing
further is designed for it.

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

`silo-ctl` is deliberately short: on macOS the base is `/var/folders/…/T`
(~49 chars), and the whole path must stay under `sockaddr_un`'s ~104-byte
`sun_path` limit (R2). `pty-host` is a `cfg(unix)` dependency, so the Windows arm
resolves its pipe name from the identity directly without reaching for that
crate.

The namespace `<ns>` is the existing `SILO_PTY_NS` value (`prod`, `dev`, …),
derived from the bundle identifier in `lib.rs`. Reusing it — rather than minting
a second namespace — is what guarantees a Dev client and a prod instance can
never address each other (R2).

### `commands/control/listener.rs` — the server

A blocking local-socket listener on a dedicated thread. `interprocess` gives one
API over Unix sockets and Windows named pipes and handles the pipe's security
descriptor; on Unix the bound path is `chmod`ed to `0600` immediately after bind,
because the crate honours the process umask and umask alone is not a guarantee.
Windows is a first-class platform here — `commands/session_windows.rs` is a full
session backend, so terminals and therefore `agent run` work there; only the
_detached_ PTY daemon is Unix-only.

Three behaviors worth stating:

- **Bind at startup, not on webview-ready** (R2). Socket presence means "the
  process is alive", which is the predicate `status` needs to be able to report a
  wedged webview at all. Readiness is a _field in the status answer_, not the
  existence of the socket — see `status.rs` below.
- **Stale-socket takeover.** If the path already exists at bind time, connect to
  it. A successful connect means a live instance owns it — refuse to bind, leave
  the path alone, and log it. A refused connect means a crashed predecessor:
  unlink and bind (R2). The path is unlinked again on clean shutdown.
- **Re-bind after a reap.** ADR 0022 already documents `$TMPDIR` reaping as a
  loss case for tier-3 sockets. The accept loop re-checks that its path still
  exists and re-binds if it has vanished, so a reaped socket costs one request,
  not the instance's reachability for the rest of its life (R2).

Per connection: read one newline-terminated JSON request with a size cap
(64 KiB) and a read deadline, dispatch, write one newline-terminated response,
close. No keep-alive, no pipelining — one request per connection keeps
correlation trivial on the wire and connection lifetime bounded.

### `commands/control/status.rs` — the host-answered op

`status` is the one op that never round-trips to the webview (R9). The host
answers it directly from what it already knows: version, bundle identity, pid,
uptime, and a **readiness** flag the webview sets once its control dispatcher is
registered and clears on teardown.

This is what makes a wedged app diagnosable — `status` still answers, and says
`webview: "starting"` — and it is what `--launch` polls (R7): waiting for
readiness rather than for socket existence means a request is never delivered to
an instance that cannot serve it. `automation.rs` already answers its `ping`
host-side for the same reason; this generalizes that precedent rather than
inventing one.

### `commands/control/registry.rs` — the allowlist

A static table of ops. Each entry declares its name and its `read` | `mutate`
tier. Dispatch is a lookup: a name not in the table is `denied` before anything is
emitted (R5). This table is the security boundary — the host gaining a new
capability never gains the channel a new op.

| Op          | Tier   | Answered by | Backing command               |
| ----------- | ------ | ----------- | ----------------------------- |
| `status`    | read   | host        | `silo status`                 |
| `ws.live`   | read   | webview     | `silo ws list` (live overlay) |
| `agent.run` | mutate | webview     | `silo agent run`              |

**No op requires user confirmation, and none may** (R6). The alternative —
shipping a `--yes` flag and a `confirms` column that no op sets — would be an
untested path with no caller, which is the speculative complexity AGENTS.md rules
out. The rule is recorded beside the table: an op that cannot complete without
asking the user is not admitted, and admitting the first one is an amendment to
this design and to ADR 0047.

Ops that reach the webview are dispatched to single-threaded JavaScript, so they
serialize naturally; two concurrent `agent.run` calls cannot interleave (R8).
That is a property of the runtime, stated here so it is not silently relied on.

### `commands/control/envelope.rs` — the shared shapes

One serializer for both success and failure, one `ErrorCode` enum, one
`exit_code()` mapping. Every op and the client both go through it (R3), so no op
can invent a response shape and no call site can invent an exit code. The client
constructs envelopes through the same type for its own errors.

### `commands/control/disk_read.rs` — the Disk-read base

ADR 0047 designates workspace enumeration as **Disk-read**: `silo ws list` must
work with no app running. This module is that half — it resolves the identity's
config root and reads `<config>/workspaces/*.json` in the client process.

`config_root_name` already exists in `commands/session_maintenance.rs` (with a
test asserting it mirrors the TypeScript mapping), and that module already reads
these workspace files; both are reused rather than reimplemented. The
`SILO_CONFIG_DIR` override is honoured through the existing
`app_config_dir_override` path.

A malformed or half-written workspace file is skipped with a warning on **stderr**
— never stdout, which must stay parseable (R1) — rather than failing the listing.

### `commands/control/client.rs` — the client

Parses the Control-mode verbs, connects, sends, reads, renders, exits.
`control_request(argv, cwd)` mirrors the existing `resolve_cli_request` in style:
pure, unit-testable, returns `None` for every invocation that is not Control mode
so the existing Forward path is untouched (R12). `cwd` is canonicalized the same
way `resolve_cli_request` already does it.

Argument validation splits **syntactic from referential** (R4): the client
rejects what it can judge alone — a missing required flag, a `--ws` value that is
neither an existing path nor `ws_`-prefixed — as `invalid-args`, without
connecting. Whether a syntactically valid name exists is always the instance's
answer, and is `not-found`.

Rendering is two modes over the same envelope: `--json` prints it verbatim on
stdout and nothing else; human mode prints `data` as readable text on stdout, or
`error.message` on stderr with stdout left empty. The exit code is the same in
both.

**`--launch`** starts the platform's app entry point — `open -a` against the
`.app` bundle on macOS, the executable directly elsewhere — not the inner binary,
so the launched instance is a normally-registered app. It then polls `status`
until `webview: "ready"` or the deadline lapses. Polling readiness rather than
socket existence also makes the already-starting case correct: an instance
mid-startup is waited on, not duplicated (R7).

### `apps/desktop/src/control/` — the webview handlers

The op handlers, mirroring `apps/desktop/src/cli/`'s structure. Each handler is a
pure function from host state (read through the `store` proxy) plus request args
to a `data` object or an error code — the same shape
`.agents/skills/silo-testing` prescribes, so the handlers unit-test without a
renderer (R10, R11). Registration sets the readiness flag `status` reports.

`agent.run`'s handler reuses `applyCliAgentRun`'s existing resolution logic; the
changes are that it **returns** the created terminal id (or an error code)
instead of logging to the Output channel, that an unresolvable workspace is an
error rather than a create, and that a profile whose command cannot be launched
is `failed` rather than `internal` (R11).

**`args.prompt` — the opening prompt (RFC 0033 phase 3).** That phase builds
prompt delivery and publishes it as `ctx.agents.profiles.launch({ prompt })`.
It deliberately ships **no CLI code**: `silo agent run --prompt <text>` is the
same capability at the command line, and ADR 0047's 2026-09-02 amendment says a
new flag on a verb already scheduled for conversion is Control, never Forward.
So the flag is specified there and **built here**, as part of this conversion.

`prompt` is optional and opaque to this proposal — RFC 0033 owns sanitizing it,
choosing a transport, and deciding whether the target agent and shell can take
one at all. What this proposal owns is the flag itself and the fact that its
refusals arrive as **codes from the closed vocabulary above** rather than
Output-panel text: a profile whose agent cannot take a prompt is the caller's
configuration to fix, an unquotable shell is environmental, and an oversized
prompt is a bad argument.

Implementation note: RFC 0033 phase 3 shipped that host-side precheck. It is
`ctx.agents.profiles.launch()`'s own: the service composes the line before
creating anything and returns `{ ok: false, refusal }`. `agent.run`'s handler
calls the same path and maps the refusal onto a code — the CLI work here is the
flag, the arg, and that mapping, not the delivery mechanism.

**The mapping** (settled 2026-09-03 against the shipped `PromptRefusal`, per
RFC 0033 R6). All four are `failed`:

| `PromptRefusal`     | Code     | Why                                                                            |
| ------------------- | -------- | ------------------------------------------------------------------------------ |
| `no-agent`          | `failed` | The profile exists; it just names no agent Silo knows. Fixable config.         |
| `agent-takes-none`  | `failed` | The agent exists and has no interactive opening-prompt form.                   |
| `unsupported-shell` | `failed` | Environmental — Silo has no exact quoting rule for this shell.                 |
| `too-large`         | `failed` | Over 2 KiB after sanitizing. See the finding below for why not `invalid-args`. |

`not-found` is deliberately **not** used for `no-agent`: that code means "a
named workspace, profile, or terminal does not exist", and in every one of these
cases the named profile does exist. `failed` — "the op ran and could not
complete" — is literally true for all four, and the `message` field carries
which one. The vocabulary being coarse here is the point: it is closed, and
`message` is where the specifics belong.

**Finding raised against this proposal (RFC 0033 phase 3, 2026-09-03).**
`too-large` is the one that reads like `invalid-args` — it is a bad argument by
any ordinary reading. It cannot use that code, for two independent reasons, and
both are worth stating before this ships:

1. The table above declares `invalid-args` "detected client-side; never sent on
   the wire", and `cli.rs` cannot detect this one. The 2 KiB limit applies to
   the **sanitized** payload, and sanitizing (stripping escape sequences and
   control bytes) only ever shrinks the text — so a raw prompt over the limit
   may still be under it once sanitized. A client-side check would reject
   prompts that would actually have worked.
2. Sanitizing is RFC 0033's, and deliberately host-side. Duplicating it in
   `cli.rs` to make a client-side check exact is precisely the "second
   implementation of the quoting rules" that phase forbids.

So `too-large` rides `failed` with a message naming the limit and the actual
size. **No new code is being asked for** — this is recorded so the choice is
deliberate rather than a silent widening of `failed`, and so that a future
reader does not "fix" it into `invalid-args`.

## Data flow

### `silo ws list --json` — Disk-read base, live overlay

1. `main.rs` — `local_flag_response` returns `None`; `control_request` matches
   `ws list`.
2. Client reads the workspace files from the identity's config root. This is the
   answer; everything below only annotates it.
3. Client attempts `ws.live` on the socket. Connect refused, or the instance
   reports itself not ready → skip the overlay.
4. With an answer, each row gains `open`, `active`; the response records that the
   overlay was applied so a consumer can tell "not open" from "unknown" (R10).
5. Client renders and exits **0** — with or without a running app.

### `silo agent run` — the mutate path

1. `control_request` yields `{ op: "agent.run", args: { profile, ws, prompt }, cwd }`.
2. Client connects. Refused → `not-running` (exit 3), or, with `--launch`,
   launch and poll `status` for readiness to the deadline (R7).
3. Client writes `{ id, op, args, cwd }\n` and blocks on the read deadline.
4. Listener validates size and JSON, looks the op up in the registry, allocates a
   pending entry keyed by a monotonic host-side id, and emits `control://request`.
5. The webview dispatches to the handler, launches the profile, and emits
   `control://reply` with the same id and the created terminal's id.
6. The listener matches the id, removes the pending entry, wraps the payload in
   the envelope, writes one line, closes.
7. Client prints the terminal id, exits 0.

`status` short-circuits at step 4 — the host answers it without emitting anything
to the webview, which is what keeps it available when the webview is wedged (R9).

Timeout (R8) has one deadline on each side: the listener gives the webview a
bounded window (5s, matching `automation.rs`'s `REPLY_TIMEOUT`) and answers
`timeout` itself if it lapses, dropping the pending entry; the client's own read
deadline is slightly longer so a `timeout` envelope normally arrives as data
rather than as a client-side guess. A client that disconnects first causes the
write to fail, which is discarded — the pending entry is already gone.

## APIs / interfaces

Nothing here touches `@silo-code/sdk`, `ctx`, or any extension surface, so the
`silo-docs-sync` workflow does not apply. The public surfaces that do change are
the CLI and its documentation.

**Wire request** — no version field; see "same executable" above:

```jsonc
{ "id": "<uuid>", "op": "ws.live", "args": {}, "cwd": "/abs/path" }
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

| Code           | Exit | When                                                                 |
| -------------- | ---- | -------------------------------------------------------------------- |
| _(success)_    | 0    | The op ran and answered.                                             |
| _(unassigned)_ | 1    | Deliberately unused, so a panic or abort stays distinguishable.      |
| `invalid-args` | 2    | Syntactic usage error. Detected client-side; never sent on the wire. |
| `not-running`  | 3    | No instance listening on this identity's socket.                     |
| `not-found`    | 4    | A named workspace, profile, or terminal does not exist.              |
| `denied`       | 5    | Op not in the allowlist.                                             |
| `timeout`      | 6    | The instance did not answer, or become ready, within the deadline.   |
| `failed`       | 7    | The op ran and could not complete — the environment, not a bug.      |
| `internal`     | 70   | Silo malfunctioned: host-side error, unparseable reply, socket I/O.  |

`failed` and `internal` are the distinction the closed vocabulary exists to
make: "your profile's command isn't installed" and "Silo is broken" must not
share a code, and the vocabulary being closed means adding that split later is
the breaking change this proposal exists to avoid.

**New CLI surface:**

```
silo status  [--json] [--launch]
silo ws list [--json]
silo agent run [--profile <id>] [--ws <folder|.|ws_id>] [--prompt <text>] [--json] [--launch]
```

`ws list` takes no `--launch`: it is Disk-read and already answers with no app
running (R10).

`ws` becomes a live reserved noun (ADR 0047 rule 4 already reserves it): `silo ws`
and unknown `ws` verbs report usage rather than opening a folder, matching how
`agent` already behaves. `./ws` and `silo -- ws` still open a folder of that name.

**ADR 0047 amendments this change requires.** The ADR states that a new flag or
an exception to the grammar is an amendment with a dated line in its Consequences.
Three are due: the `--json` / `--launch` flags; `ws list` as a **Disk-read command
with a Control overlay**, which is a blend of two of the ADR's four execution
modes rather than one of them; and the `silo agent run` cold-behavior break below.

## Breaking changes

**`silo agent run` no longer launches Silo when nothing is running.** Today the
request is stashed in `PendingLaunchArg`, the app starts, and the webview drains
it. After this change the command exits `not-running` (3) unless invoked with
`--launch`.

This is a deliberate break, taken now while the command has no established users,
because the alternative is a CLI whose cold behavior varies per verb — the thing
an agent cannot learn once and rely on. `--launch` makes the old behavior
explicit and available. It is called out in `proposal.md`, in the CLI guide, and
in `--help`.

`PendingLaunchArg` itself stays: `open`, `install`, and `uninstall` remain
Forward-mode commands and keep their cold-launch arm untouched (R12). Only the
`agent-run` arm is removed.

## Persistence

None. The socket is ephemeral runtime state (ADR 0022 tier 3) — created at
startup, removed on shutdown, recreatable, and re-bound if reaped. Nothing in
this change writes to the config or app-state tiers; `ws list` **reads** tier 1,
which is exactly what ADR 0047's Disk-read mode is for. The Control API
deliberately adds no token or credential file: the socket's file mode is the
whole authorization story (proposal decision 1).

## Error handling

| Failure                                   | Handling                                                                     |
| ----------------------------------------- | ---------------------------------------------------------------------------- |
| Socket absent / connect refused           | `not-running`, exit 3; `--launch` converts it to launch-and-poll (R7).       |
| `--launch` deadline exceeded              | `timeout`, exit 6 — distinct from `not-running`, so a slow start is legible. |
| Instance running but not ready            | `--launch` waits; `ws list` degrades to disk-only; other ops `timeout`.      |
| Stale socket file at bind                 | Connect-probe, then unlink and rebind (R2).                                  |
| Live socket already bound                 | Refuse to bind, leave the path, log it; the first instance keeps it.         |
| Socket reaped under a live instance       | Accept loop notices the missing path and re-binds (R2).                      |
| Request over the size cap / not JSON      | Refused before dispatch, `internal`; nothing is emitted to the webview.      |
| Unknown op                                | `denied` at the registry lookup (R5).                                        |
| Webview does not reply in the window      | `timeout`, pending entry dropped (R8).                                       |
| Op reached the instance and cannot finish | `failed` with a message naming the cause (R4).                               |
| Malformed workspace file during `ws list` | Skipped, warning on stderr, listing continues (R10).                         |
| Client disconnects mid-flight             | Write failure discarded; no pending entry leaks (R8).                        |

Host-side logging goes to the Output panel via `createHostChannel`, never
`console.*`. The channel is a genuinely new subsystem with its own diagnostic
surface, so it gets its own — `silo:control` / "Control" — rather than
overloading `silo:application`. Client-side diagnostics go to **stderr** only, so
`--json` stdout stays parseable (R1).

## Testing strategy

**Rust (`cargo test`, co-located `#[cfg(test)] mod tests`, matching `cli.rs`):**

- `control_request` parsing: every Control verb, every flag form (`--json`,
  `--launch`, `--profile=x`), `None` for every Forward/local invocation, and `--`
  still forcing a path.
- Client-side argument validation: the syntactic/referential split — a missing
  flag and a malformed `--ws` are `invalid-args` without a connection attempt; a
  well-formed unknown name is not rejected locally.
- Envelope serde round-trip; success carries no `error` and failure no `data`;
  a client-synthesized error envelope carries the client's own version/identity.
- Exhaustive `ErrorCode` → exit-code assertions, plus an assertion that no code
  maps to 1.
- Socket path resolution and namespacing, using `pty-host`'s existing
  `test_support` env-redirection helper; an assertion that the resolved path
  stays under the `sun_path` limit for each base.
- Listener behavior against a real socket in a temp runtime dir: stale-file
  takeover, live-socket refusal, re-bind after the path is unlinked, size cap,
  unknown op → `denied`, and two concurrent clients each getting their own answer.
- `status` answered host-side with the webview flag unset — the wedged-app case.
- Disk-read: config-root resolution per identity and under `SILO_CONFIG_DIR`, a
  fixture directory of workspace files, and a malformed file that is skipped
  rather than fatal.

**TypeScript (Vitest, pure-logic per `.agents/skills/silo-testing/SKILL.md`):**

- Each webview op handler as a pure function over store state seeded through the
  `store` proxy: `ws.live` open vs. soft-closed vs. active; `agent.run` success
  returning a terminal id, unknown profile → `not-found`, unresolvable `--ws` →
  `not-found`, cwd in no workspace → error rather than create, unlaunchable
  command → `failed`.
- Registry coverage: every registered op has a handler, and every handler is
  registered.

**Manual verification** via the `verifier-gui` skill for the end-to-end path
(real app, real socket, real exit codes), plus the two cases unit tests cannot
reach: a Dev and a prod instance not answering each other's clients, and
`--launch` from genuinely cold.

## Constraints and existing decisions

- **ADR 0047** (CLI command grammar) — Control is the mode this builds, and
  Disk-read is the mode `ws list` stays in. Rule 5 (`--ws`, resolution order,
  never a silent create) and rule 7 (`--json`, never prompt, meaningful exit
  codes, idempotency) are binding. `agent.run` moving to Control is where the
  ADR's noted divergence in the shipped `silo agent run` gets corrected. Three
  amendments are due back to the ADR — see "APIs / interfaces".
- **ADR 0022** (on-disk storage layout) — the socket is tier 3, identity-keyed;
  `sun_path` length is a hard constraint; the reap loss case it documents for PTY
  sockets applies here and is handled by re-bind. `ws list` reads tier 1 and
  writes nothing.
- **ADR 0012** (dev automation RPC) — the round-trip-through-the-webview pattern,
  its 5s reply timeout, and its host-answered `ping` are the precedents this
  reuses. The two surfaces stay separate; convergence is explicitly deferred
  (proposal decision 4).
- **ADR 0011** (editor and terminal are core) — `agent.run` returns a terminal
  id, a core-surface handle, not an extension-owned one.
- **ADR 0028** (sealed agent detection) — a CLI-launched agent terminal still
  becomes an agent by detection; the Control response reports the terminal id, it
  does not assert agent-ness.
- **AGENTS.md boundaries** — this is host↔CLI only. No extension reaches it, no
  `ctx` member is added, and the webview handlers live in `apps/desktop/src`
  beside the existing CLI handlers rather than in any extension package.
- **No async runtime.** The crate has no tokio; the listener is a blocking accept
  loop on its own thread, like `automation.rs`'s `tiny_http` server.
- **One new dependency** (`interprocess`) for the Windows named-pipe arm. The
  alternative — std `UnixListener` plus a hand-rolled `windows-sys` pipe — avoids
  the dependency but hand-rolls a security descriptor, which is the wrong thing to
  hand-roll. Shipping Unix-only was considered and rejected: `session_windows.rs`
  makes Windows a first-class platform with working terminals, so a Unix-only
  Control API would mean `silo status` and `agent run` simply do not exist there.
