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
- [ ] In human mode a failure writes **nothing** to stdout, so
      `x=$(silo …)` captures an empty string rather than an error message.
- [ ] In `--json` mode stdout carries the envelope and nothing else — no log
      lines, warnings, or progress output — so a single read parses cleanly.
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
- [ ] The listener binds during app startup, before the webview is ready, so
      socket presence means "the process is alive" and never depends on webview
      health (see R9).
- [ ] A socket file left behind by a crashed instance does not prevent the next
      instance from binding: the listener detects the stale path and replaces it.
- [ ] A second instance finding a **live** socket does not bind, does not
      unlink it, and logs the refusal.
- [ ] The listener is removed on clean shutdown.
- [ ] If the socket path is unlinked underneath a running instance (the
      `$TMPDIR` reap case ADR 0022 already documents for PTY sockets), the
      instance re-binds rather than becoming permanently unreachable.

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
- [ ] An error raised **client-side**, before or instead of reaching an instance
      (`invalid-args`, `not-running`, `timeout` on connect), is emitted as a
      complete envelope synthesized by the client from its own build version and
      identity — the same fields shape, never a bare message.
- [ ] A response the client cannot parse is reported as `internal`, not as a
      crash or a silent success.

## R4 — Errors are a closed vocabulary mapped to exit codes

An agent can branch on `error.code`, or on the exit code alone without parsing
JSON.

### Acceptance criteria

- [ ] The vocabulary is exactly `invalid-args`, `not-running`, `not-found`,
      `denied`, `timeout`, `failed`, `internal`, and each maps to a distinct
      non-zero exit code; success is 0.
- [ ] Exit code 1 is assigned to no error code, so an unclassified failure or a
      process abort stays distinguishable from every classified outcome.
- [ ] The mapping is defined in one place and unit-tested exhaustively — every
      code has a code→exit assertion, and adding a code without a mapping fails
      the tests.
- [ ] An op that names a workspace, profile, or terminal that does not exist
      fails `not-found`; it never silently creates one and never falls back to
      another target.
- [ ] An op that was well-formed, permitted, and reached the instance, but could
      not complete for an environmental reason — a profile whose command is not
      installed, a terminal that fails to spawn — fails `failed`, not `internal`.
      `internal` means Silo malfunctioned.
- [ ] The `invalid-args` / `not-found` boundary is **syntactic vs. referential**:
      the client rejects arguments it can judge without the instance — a missing
      required flag, a `--ws` value that is neither an existing path nor a
      `ws_`-prefixed id — as `invalid-args` without connecting. Whether a
      syntactically valid name actually exists is always the instance's answer,
      and is `not-found`.

## R5 — The operation set is a closed allowlist

The channel exposes named ops and nothing else.

### Acceptance criteria

- [ ] An op name not in the registry is refused with `denied`.
- [ ] Every registered op declares `read` or `mutate`.
- [ ] Every registered op has a handler, and every handler is registered —
      asserted by a test over the table, so the two cannot drift.
- [ ] A request that is not well-formed JSON, exceeds the maximum request size,
      or omits the op name is refused without dispatching anything.

## R6 — Control ops never require user interaction

ADR 0047 rule 7 says an agent cannot answer a modal. Rather than build a consent
mechanism with no caller, the registry admits only ops that need none.

### Acceptance criteria

- [ ] No registered op opens a modal, a dialog, or any blocking prompt in the
      running app.
- [ ] An op that cannot complete without user confirmation is **not admitted to
      the registry**. Adding the first such op is an amendment to this design and
      to ADR 0047, not a flag on this change.
- [ ] The constraint is recorded next to the registry so the next op author sees
      it at the point of decision.

_Note: verified by review and by the absence of modal calls in op handlers; there
is no runtime `--yes` flag in this change. See "Out of scope"._

## R7 — Cold behavior fails fast, `--launch` opts in

A Control command never boots the desktop app as a side effect.

### Acceptance criteria

- [ ] With no instance listening, a Control command exits with the `not-running`
      code and a message saying Silo is not running and how to launch it.
- [ ] With no instance listening and `--launch`, the client starts the app, waits
      until the instance reports itself **ready** (R9) up to a bounded deadline,
      then sends the request and reports the result.
- [ ] `--launch` waits on readiness, not on socket existence, so a request is
      never sent to an instance whose webview cannot yet answer it.
- [ ] `--launch` with the deadline exceeded exits `timeout`, not `not-running`.
- [ ] `--launch` against an already-running, ready instance sends immediately and
      does not start a second process.
- [ ] `--launch` against an instance that is running but still starting up waits
      for readiness rather than spawning a second process.
- [ ] The launch mechanism starts the platform's app entry point — the macOS
      `.app` bundle rather than the inner binary — so the launched instance is a
      normal, window-server-registered app.

## R8 — Requests are correlated, ordered, and bounded in time

### Acceptance criteria

- [ ] Each request carries a correlation id, and a reply is delivered only to
      the connection that sent that id.
- [ ] Concurrent requests from separate client processes are each answered
      correctly and independently.
- [ ] Mutating ops do not interleave: two concurrent `agent.run` calls each
      produce their own terminal, and neither observes the other's partial state.
- [ ] An instance that does not answer within the deadline yields `timeout`, and
      the listener drops that pending entry rather than leaking it.
- [ ] A client that disconnects before the reply arrives does not wedge the
      listener or leave a pending entry behind.

## R9 — `silo status` answers liveness and readiness, always

The one op that must work when the rest of the app does not.

### Acceptance criteria

- [ ] `silo status` reports the running instance's version, build identity,
      process id, and uptime.
- [ ] It reports whether the webview is **ready** to serve ops, distinguishing a
      fully-serving instance from one that is still starting or whose webview is
      unresponsive.
- [ ] It is answered entirely host-side and returns successfully even when the
      webview never becomes ready — a wedged app must not look identical to no
      app.
- [ ] It exits 0 when an instance is running and `not-running` when none is.
- [ ] `--json` returns the same facts in the envelope's `data`.

## R10 — `silo ws list` reads config from disk and enriches with live state

ADR 0047 designates workspace enumeration as **Disk-read**: it must work with no
running app. The Control channel adds the live half disk cannot answer.

### Acceptance criteria

- [ ] With no instance running, `silo ws list` reads the workspace files under
      the identity's config root and exits 0 with the workspaces it found. It
      does not fail `not-running` and does not launch anything.
- [ ] Each row carries the workspace id, primary folder, and display name from
      disk.
- [ ] With an instance running, each row is additionally annotated with live
      state — open vs. soft-closed, and whether it is the active workspace.
- [ ] The response states whether the live annotation was applied, so a consumer
      can tell "not open" from "unknown because nothing was running".
- [ ] An instance that is running but not ready degrades to the disk-only answer
      rather than failing.
- [ ] Ids are returned in the form `--ws` accepts, so a follow-up call is
      unambiguous (ADR 0047 rule 5).
- [ ] Human mode prints a readable table of the same data.
- [ ] The config root is resolved by the same identity mapping the app uses, and
      honours the `SILO_CONFIG_DIR` override.
- [ ] A malformed or half-written workspace file is skipped with a warning on
      stderr rather than failing the whole listing.

## R11 — `silo agent run` returns the terminal it created

The proving mutate-tier consumer, converted from Forward mode.

### Acceptance criteria

- [ ] On success it reports the created terminal's id and the workspace it ran
      in, and exits 0.
- [ ] An unresolvable `--profile` fails `not-found`; an unresolvable `--ws` fails
      `not-found` (never a silent create — ADR 0047 rule 5).
- [ ] Running from a directory inside no workspace fails rather than creating
      one, bringing the command into conformance with ADR 0047 rule 5, which the
      shipped Forward implementation knowingly diverges from.
- [ ] A profile whose command cannot be launched fails `failed` with a message
      naming the command, not `internal`.
- [ ] A failed run leaves no half-created terminal.
- [ ] `args` carries an optional `prompt`, and `silo agent run` gains
      `--prompt <text>`. RFC 0033 phase 3 builds prompt delivery and publishes
      it on `ctx.agents.profiles`, ships **no CLI code**, and specifies this
      flag; ADR 0047's 2026-09-02 amendment puts a new flag on a
      conversion-bound verb in Control, so the flag is built here.
- [ ] This proposal treats the prompt as opaque — RFC 0033 owns sanitizing,
      transport, and deliverability — and calls its host-side precheck, mapping
      any refusal onto a code from the closed vocabulary rather than
      Output-panel text. That precheck shipped with RFC 0033 phase 3
      (2026-09-03) as `ctx.agents.profiles.launch()`'s own; the mapping is
      settled in `design.md` → "The mapping": all four `PromptRefusal` members
      are `failed`, with the specifics in `message`. `too-large` deliberately
      does **not** use `invalid-args` — see the finding recorded there.
- [ ] **Breaking change:** with no instance running the command exits
      `not-running` instead of launching Silo and running the agent on startup.
      `--launch` restores the launch-and-run behavior explicitly. The
      `PendingLaunchArg` cold-launch arm is removed for this command only; `open`,
      `install`, and `uninstall` keep theirs.

## R12 — Existing CLI behavior is unchanged where it is not converted

### Acceptance criteria

- [ ] `silo`, `silo <path>`, `silo install`, `silo uninstall` keep their current
      Forward/local behavior, their cold-launch behavior, and their exit codes.
- [ ] `silo --help` / `--version` still answer locally, before Tauri init, and
      `--help` documents the Control-mode commands, `--json`, `--launch`, and the
      exit-code table.
- [ ] `silo -- <path>` still forces a path for a reserved noun.
- [ ] `silo ws` and unknown `ws` verbs report usage instead of opening a folder,
      matching how `agent` already behaves; `./ws` and `silo -- ws` still open a
      folder of that name.

## Out of scope

- **A user-consent mechanism** (`--yes`, a `confirms` op flag). No op in this
  change needs one; building it now would ship an untested path with no caller.
  R6 keeps the rule as a registry admission constraint instead.
- Bare `silo agent run`'s interactive picker, and `silo agent list` — RFC 0033
  phase 9.
- Extension-contributed commands — RFC 0005 / RFC 0006.
- Any `ws` verb other than `list`, and every `term` verb.
- Convergence or retirement of ADR 0012's dev automation RPC.
- Non-loopback, cross-machine, or cross-container access.
- Extension access to the channel. This is a design constraint of the
  architecture — the channel is host↔CLI and no `ctx` member or SDK export is
  added — verified by review rather than by a test, since "nothing exposes it" is
  not an assertable predicate.
