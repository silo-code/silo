# Tasks — 0034. Control API

The implementation plan. Ordered — the wire has to exist before anything can
speak over it, `status` proves the channel before any op depends on the webview,
and the mutate tier lands last because it changes a shipped command. Working
artifact — removed when the proposal collapses.

## Transport

- [ ] Make `crates/pty-host/src/paths.rs`'s runtime-base resolver public so the
      `$XDG_RUNTIME_DIR` → `$TMPDIR` → `/tmp` precedence has one owner.
- [ ] Add `commands/control/paths.rs`: `<runtime-base>/silo-ctl/<ns>/control.sock`
      on Unix (dir `0700`, socket `0600`), `\\.\pipe\silo-control-<ns>` on
      Windows, reusing the `SILO_PTY_NS` namespace.
- [ ] Add the `interprocess` dependency; bind the listener on both platform arms
      and `chmod` the Unix path to `0600` immediately after bind.
- [ ] Start the accept loop on its own thread from `lib.rs`'s `setup` — at
      startup, not on webview-ready, so socket presence means "process alive".
- [ ] Stale-socket takeover: connect-probe the existing path, unlink and rebind
      on refusal, refuse to bind (leaving the path intact) when a live instance
      owns it. Unlink on clean shutdown.
- [ ] Re-bind when the socket path is unlinked underneath a live instance (the
      ADR 0022 `$TMPDIR` reap case).
- [ ] Per-connection framing: one newline-terminated request, 64 KiB size cap,
      read deadline, one newline-terminated response, close.
- [ ] Add the `silo:control` / "Control" Output channel; log bind, refusal,
      takeover, re-bind, and per-request outcomes through it.

## Envelope and error vocabulary

- [ ] Add `commands/control/envelope.rs`: the request shape (no version field),
      the response shape with the top-level `v`, the `ErrorCode` enum including
      `failed`, and the single `exit_code()` mapping with 1 left unassigned.
- [ ] Make the client construct its own error envelopes through the same type,
      filling `silo.version` / `identity` from its own build.
- [ ] Route every response through that serializer — no op builds its own shape.

## Operation registry and dispatch

- [ ] Add `commands/control/registry.rs`: the static op table with `name` and
      `read` | `mutate`. Unknown op → `denied` before dispatch.
- [ ] Record the no-confirmation admission rule (R6) beside the table, so the
      next op author reads it at the point of decision.
- [ ] Wire the webview round-trip: pending map keyed by a monotonic host-side id,
      `control://request` emit, `control://reply` listener.
- [ ] Bounded reply window (5s, matching `automation.rs`), pending entry dropped
      on lapse, write failures on a disconnected client discarded.

## `status` — host-answered

- [ ] Add `commands/control/status.rs`: version, identity, pid, uptime, answered
      without touching the webview.
- [ ] Add the readiness flag — set when the webview registers its control
      dispatcher, cleared on teardown — and report it in `status`.
- [ ] Short-circuit `status` in the listener so it never allocates a pending
      entry.

## Disk-read half

- [ ] Add `commands/control/disk_read.rs`: resolve the identity's config root
      (reusing `config_root_name` from `session_maintenance.rs` and the
      `SILO_CONFIG_DIR` override) and read `<config>/workspaces/*.json`.
- [ ] Skip malformed/half-written workspace files with a warning on stderr; never
      fail the listing.

## CLI client

- [ ] Add `control_request(argv, cwd)` to `commands/cli.rs` — pure, canonicalizes
      `cwd`, returns `None` for every non-Control invocation.
- [ ] Reserve the `ws` noun in the parser: `silo ws` and unknown `ws` verbs report
      usage instead of opening a folder, mirroring `agent`.
- [ ] Client-side argument validation on the syntactic/referential split: missing
      required flags and a malformed `--ws` are `invalid-args` without connecting.
- [ ] Add `commands/control/client.rs`: connect, send, read, exit with the mapped
      code.
- [ ] Rendering: `--json` writes the envelope and nothing else to stdout; human
      mode writes `data` to stdout, or `error.message` to stderr with stdout left
      empty.
- [ ] Dispatch from `main.rs` immediately after `local_flag_response`, before any
      Tauri init.
- [ ] `--launch` step 1 — start the platform app entry point (`open -a` against
      the `.app` bundle on macOS, the executable elsewhere), detached.
- [ ] `--launch` step 2 — poll `status` until `webview: "ready"` or the deadline
      lapses; an already-starting instance is waited on, never duplicated.
      Deadline exceeded is `timeout`, not `not-running`.
- [ ] Update the `HELP` text: the Control commands, `--json`, `--launch`, the
      exit-code table, and the `agent run` cold-behavior break. Drop the "cannot
      report results here yet" note.

## Webview handlers

- [ ] Add `apps/desktop/src/control/` with the dispatcher, mirroring
      `apps/desktop/src/cli/index.ts`; register it in the boot chain after
      workspace hydration and set the readiness flag on registration.
- [ ] `ws.live` — per workspace id, its open vs. soft-closed state and whether it
      is the active one.
- [ ] `silo ws list` composition — disk rows as the answer, `ws.live` as an
      overlay, a field recording whether the overlay was applied, exit 0 with or
      without a running app.
- [ ] `agent.run` — return the created terminal id and workspace; unresolvable
      `--profile` or `--ws` → `not-found`; cwd in no workspace → error, not a
      create (the ADR 0047 rule 5 conformance fix); unlaunchable command →
      `failed`; a failed run leaves no half-created terminal.
- [ ] Remove the `agent-run` arm from the `cli:open` / `PendingLaunchArg` path,
      leaving `open`, `install`, and `uninstall` untouched.

## Tests

- [ ] Rust: `control_request` parsing across every verb and flag form, `None` for
      Forward/local invocations, `--` still forcing a path.
- [ ] Rust: client-side validation — missing flag and malformed `--ws` are
      `invalid-args` with no connection attempt; a well-formed unknown name is not
      rejected locally.
- [ ] Rust: envelope serde round-trip; success carries no `error`, failure no
      `data`; a client-synthesized envelope carries the client's version/identity.
- [ ] Rust: exhaustive `ErrorCode` → exit-code assertions, plus "no code maps
      to 1".
- [ ] Rust: socket path resolution and namespacing via `pty-host`'s
      `test_support` env redirection, plus a `sun_path` length assertion per base.
- [ ] Rust: listener against a real socket in a temp runtime dir — stale-file
      takeover, live-socket refusal, re-bind after unlink, size cap, unknown op →
      `denied`, two concurrent clients answered independently.
- [ ] Rust: `status` answered with the readiness flag unset (the wedged-app case).
- [ ] Rust: disk-read — config root per identity and under `SILO_CONFIG_DIR`, a
      fixture workspace directory, and a malformed file skipped rather than fatal.
- [ ] TS: each op handler as a pure function over `store`-seeded state, covering
      every acceptance criterion in R10 and R11.
- [ ] TS: registry coverage — every registered op has a handler and vice versa.

## Documentation

- [ ] `apps/docs/guide/cli.md` — the Control commands, the envelope, the
      exit-code table, `--launch` / `--json`, `ws list`'s disk-plus-overlay
      behavior, the `ws` noun break, and the `agent run` cold-behavior break.
- [ ] `docs/decisions/0047-cli-command-grammar.md` — dated amendment lines in
      Consequences for the three changes the ADR requires one for: the
      `--json` / `--launch` flags, `ws list` as Disk-read with a Control overlay
      (a blend of two execution modes), and the `agent run` cold-behavior break.
- [ ] `docs/domain-language.md` — Control API, the envelope, the op allowlist,
      read vs. mutate tier, readiness; repoint the existing RFC 0034 link at the
      package and drop "unbuilt" from the Control-mode entry.
- [ ] `docs/proposals/README.md` — index row points at
      `./0034-control-api/proposal.md`, status `accepted`. (Done at planning
      time; re-check at collapse.)
- [ ] No `pnpm docs:api` run — this change touches no `@silo-code/sdk` symbol.

## Verification

- [ ] Every requirement in `requirements.md` is met or explicitly noted as not.
- [ ] `pnpm test`, `pnpm --filter silo exec tsc --noEmit`, `pnpm lint`, and
      `cargo test` pass.
- [ ] End-to-end run via the `verifier-gui` skill: real app, real socket, real
      exit codes for a success, a `not-found`, a `failed`, and a `not-running`.
- [ ] `silo ws list` verified with no app running, and again with one, showing
      the overlay applied.
- [ ] `--launch` verified from genuinely cold, and against an instance that is
      mid-startup.
- [ ] Verified that a Silo Dev instance and a production instance do not answer
      each other's clients.
- [ ] Reviewed, not tested: no `ctx` member or SDK export reaches the channel
      (R5 / Out of scope), and no registered op prompts (R6).
- [ ] ADR written: the Control API's transport and security model — the OS-gated
      socket, the closed allowlist, why no token, why no consent mechanism yet,
      and why ADR 0012 stays separate. Numbered next in `docs/decisions/` (0049
      as of planning).
- [ ] Proposal collapsed to a single curated `docs/proposals/0034-control-api.md`
      with `status: implemented`, the decisions and the breaking change preserved,
      and the deferred ADR 0012 convergence question carried forward.
- [ ] RFC 0033's phase table updated: phase 9's Control-dependent half is now
      unblocked.
