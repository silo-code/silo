# Requirements — 0034. Control API

The behavioral specification for the Control API. Working artifact — removed
when the proposal collapses.

Scope is the whole proposal (single phase). Terms: **client** = the short-lived
`silo` process; **instance** = the running desktop app; **op** = a named
operation in the allowlist.

## R1 — A command round-trips and reports its own result

A Control-mode invocation sends one request to the running instance and prints
that instance's answer, with an exit code that reflects it.

### Acceptance criteria

- [ ] `silo status` against a running instance prints a human-readable summary
      on stdout and exits 0.
- [ ] `silo status --json` prints exactly one line of JSON on stdout and exits 0.
- [ ] A failing op prints its `message` on stderr in human mode, prints the full
      envelope on stdout in `--json` mode, and exits with that error's mapped
      code in both.
- [ ] The client exits within the timeout deadline in every case; it never hangs
      waiting on an instance that does not answer.
- [ ] A Control-mode invocation does not go through
      `tauri-plugin-single-instance` and does not focus or raise the window as a
      side effect.

## R2 — The transport is OS-gated and identity-keyed

The channel is a Unix domain socket (macOS/Linux) or Windows named pipe in
ADR 0022's ephemeral runtime tier, reachable only by the user who owns it.

### Acceptance criteria

- [ ] The socket directory is created `0700` and the socket `0600` on Unix.
- [ ] The socket path is namespaced by build identity, so a Silo Dev instance
      and a production instance listen on distinct paths and neither can be
      addressed by the other's client.
- [ ] The resolved socket path stays under `sockaddr_un`'s ~104-byte `sun_path`
      limit for the platform defaults (`$XDG_RUNTIME_DIR`, `$TMPDIR`, `/tmp`).
- [ ] The Windows named pipe is created with an owner-only security descriptor.
- [ ] No TCP port is opened, in any build configuration, by this change.
- [ ] A socket file left behind by a crashed instance does not prevent the next
      instance from binding: the listener detects the stale path and replaces it.
- [ ] The listener is removed on clean shutdown.

## R3 — One envelope, versioned as a whole

Every op answers in the same JSON shape, on the wire and on `--json` stdout.

### Acceptance criteria

- [ ] A success carries `ok: true`, `data`, and `silo` (`version`, `identity`);
      it does not carry `error`.
- [ ] A failure carries `ok: false`, `error` (`code`, `message`), and `silo`; it
      does not carry `data`.
- [ ] Every envelope carries a top-level integer version field.
- [ ] The envelope is emitted and parsed by one shared serializer used by every
      op — no op hand-rolls its own response shape.
- [ ] A response the client cannot parse is reported as `internal`, not as a
      crash or a silent success.

## R4 — Errors are a closed vocabulary mapped to exit codes

An agent can branch on `error.code`, or on the exit code alone without parsing
JSON.

### Acceptance criteria

- [ ] The vocabulary is exactly `invalid-args`, `not-running`, `not-found`,
      `denied`, `timeout`, `internal`, and each maps to a distinct non-zero exit
      code; success is 0.
- [ ] The mapping is defined in one place and unit-tested exhaustively — every
      code has a code→exit assertion.
- [ ] An op that names a workspace, profile, or terminal that does not exist
      fails `not-found`; it never silently creates one and never falls back to
      another target.
- [ ] Malformed or missing required arguments fail `invalid-args` client-side,
      without contacting the instance.

## R5 — The operation set is a closed allowlist

The channel exposes named ops and nothing else.

### Acceptance criteria

- [ ] An op name not in the registry is refused with `denied`.
- [ ] Every registered op declares `read` or `mutate`.
- [ ] A request that is not well-formed JSON, exceeds the maximum request size,
      or omits the op name is refused without dispatching anything.
- [ ] The channel is not reachable from extension code: no `ctx` member, no SDK
      export, and no host API exposes it.

## R6 — The no-prompt rule holds over the channel

An op that would normally ask the user cannot proceed silently because it
arrived over the socket (ADR 0047 rule 7).

### Acceptance criteria

- [ ] A mutate op whose GUI equivalent prompts fails with `denied` and a message
      naming what confirmation is required, unless the invocation carried
      `--yes`.
- [ ] With `--yes`, that op proceeds and reports its result normally.
- [ ] No Control-mode op opens a modal in the running app.

## R7 — Cold behavior fails fast, `--launch` opts in

A Control command never boots the desktop app as a side effect of a read.

### Acceptance criteria

- [ ] With no instance listening, a Control command exits with the `not-running`
      code and a message saying Silo is not running and how to launch it.
- [ ] With no instance listening and `--launch`, the client starts the app,
      waits for the socket up to a bounded deadline, then sends the request and
      reports the result.
- [ ] `--launch` with a deadline exceeded exits `timeout`, not `not-running`.
- [ ] `--launch` against an already-running instance sends immediately and does
      not start a second process.

## R8 — Requests are correlated and bounded in time

### Acceptance criteria

- [ ] Each request carries a correlation id, and a reply is delivered only to
      the connection that sent that id.
- [ ] Concurrent requests from separate client processes are each answered
      correctly and independently.
- [ ] An instance that does not answer within the deadline yields `timeout`, and
      the listener drops that pending entry rather than leaking it.
- [ ] A client that disconnects before the reply arrives does not wedge the
      listener or leave a pending entry behind.

## R9 — `silo status` answers liveness and identity

The proving read-tier consumer.

### Acceptance criteria

- [ ] `silo status` reports the running instance's version, build identity, and
      the count of open workspaces plus which one is active.
- [ ] It exits 0 when an instance is running and `not-running` when none is.
- [ ] `--json` returns the same facts in the envelope's `data`.

## R10 — `silo ws list` answers live workspace state

The read tier's reason to exist: the half ADR 0022's config tier cannot answer.

### Acceptance criteria

- [ ] `silo ws list --json` returns, per workspace, its id, primary folder,
      display name, and its live state — open vs soft-closed, and whether it is
      the active one.
- [ ] Ids are returned in the form `--ws` accepts, so a follow-up call is
      unambiguous (ADR 0047 rule 5).
- [ ] Human mode prints a readable table of the same data.

## R11 — `silo agent run` returns the terminal it created

The proving mutate-tier consumer, converted from Forward mode.

### Acceptance criteria

- [ ] On success it reports the created terminal's id and the workspace it ran
      in, and exits 0.
- [ ] An unresolvable `--profile` fails `not-found`; an unresolvable `--ws`
      fails `not-found` (never a silent create — ADR 0047 rule 5).
- [ ] Running from a directory inside no workspace fails rather than creating
      one, bringing the command into conformance with ADR 0047 rule 5, which the
      shipped Forward implementation knowingly diverges from.
- [ ] With no instance running it behaves per R7 — it does not fall back to the
      cold-launch `PendingLaunchArg` path.
- [ ] Re-running it is safe and re-runnable (ADR 0047 rule 7): each run is an
      explicit new launch, and a failed run leaves no half-created terminal.

## R12 — Existing CLI behavior is unchanged where it is not converted

### Acceptance criteria

- [ ] `silo`, `silo <path>`, `silo install`, `silo uninstall` keep their current
      Forward/local behavior and exit codes.
- [ ] `silo --help` / `--version` still answer locally, before Tauri init, and
      `--help` documents the Control-mode commands, `--json`, `--launch`,
      `--yes`, and the exit-code table.
- [ ] `silo -- <path>` still forces a path for a reserved noun.

## Out of scope

- Bare `silo agent run`'s interactive picker, and `silo agent list` — RFC 0033
  phase 9.
- Extension-contributed commands — RFC 0005 / RFC 0006.
- Any `ws` verb other than `list`, and every `term` verb.
- Convergence or retirement of ADR 0012's dev automation RPC.
- Non-loopback, cross-machine, or cross-container access.
- Extension access to the channel.
