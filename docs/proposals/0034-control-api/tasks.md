# Tasks — 0034. Control API

The implementation plan. Ordered — the wire has to exist before anything can
speak over it, and the read tier proves the channel before the mutate tier
changes shipped behavior. Working artifact — removed when the proposal collapses.

## Transport

- [ ] Make `crates/pty-host/src/paths.rs`'s runtime-base resolver public so the
      `$XDG_RUNTIME_DIR` → `$TMPDIR` → `/tmp` precedence has one owner.
- [ ] Add `commands/control/paths.rs`: `<runtime-base>/silo-ctl/<ns>/control.sock`
      on Unix (dir `0700`, socket `0600`), `\\.\pipe\silo-control-<ns>` on
      Windows, reusing the `SILO_PTY_NS` namespace.
- [ ] Add the `interprocess` dependency and `commands/control/listener.rs`: a
      blocking accept loop on its own thread, one newline-delimited request and
      response per connection, 64 KiB size cap, read deadline.
- [ ] Bind on webview-ready, not on `setup` — add the `control_ready` command
      the webview calls, so socket presence means "able to answer".
- [ ] Stale-socket takeover: connect-probe the existing path, unlink and rebind
      on refusal, refuse to bind when a live instance owns it. Unlink on clean
      shutdown.
- [ ] Add the `silo:control` / "Control" Output channel and log bind, refusal,
      takeover, and per-request outcomes through it.

## Envelope and error vocabulary

- [ ] Add `commands/control/envelope.rs`: the request and response shapes with
      the top-level `v`, the `ErrorCode` enum, and the single `exit_code()`
      mapping.
- [ ] Route every response through that serializer — no op builds its own shape.

## Operation registry

- [ ] Add `commands/control/registry.rs`: the static op table with `name`,
      `read` | `mutate`, and `confirms`. Unknown op → `denied` before dispatch.
- [ ] Wire the round-trip: pending map keyed by a host-side id,
      `control://request` emit, `control://reply` listener, bounded reply window
      with the pending entry dropped on lapse.
- [ ] Enforce the no-prompt rule at the table: `confirms` ops fail `denied`
      without `--yes`.

## CLI client

- [ ] Add `control_request(argv, cwd)` to `commands/cli.rs` — pure, returns
      `None` for every non-Control invocation.
- [ ] Reserve the `ws` noun in the parser: `silo ws` and unknown `ws` verbs
      report usage instead of opening a folder, mirroring `agent`.
- [ ] Add `commands/control/client.rs`: connect, send, read, render (`--json`
      verbatim on stdout; human text on stdout, `error.message` on stderr), exit
      with the mapped code.
- [ ] Dispatch it from `main.rs` immediately after `local_flag_response`, before
      any Tauri init.
- [ ] Implement `--launch`: spawn detached, poll for the socket to a bounded
      deadline, then send. Exceeded deadline is `timeout`, not `not-running`.
- [ ] Update the `HELP` text: the Control commands, `--json`, `--launch`,
      `--yes`, and the exit-code table. Drop the "cannot report results here yet"
      note.

## Webview handlers

- [ ] Add `apps/desktop/src/control/` with the dispatcher, mirroring
      `apps/desktop/src/cli/index.ts`, and register it in the boot chain after
      workspace hydration.
- [ ] `status` — version, identity, open-workspace count, active workspace.
- [ ] `ws.list` — id, primary folder, display name, open vs soft-closed, active;
      ids in the form `--ws` accepts.
- [ ] `agent.run` — return the created terminal id and workspace; unresolvable
      `--profile` or `--ws` → `not-found`; cwd in no workspace → error, not a
      create (the ADR 0047 rule 5 conformance fix).
- [ ] Remove `agent-run`'s Forward path and its `PendingLaunchArg` cold-launch
      arm, so the command has exactly one behavior.

## Tests

- [ ] Rust: `control_request` parsing across every verb and flag form, `None`
      for Forward/local invocations, `--` still forcing a path.
- [ ] Rust: envelope serde round-trip; success carries no `error`, failure no
      `data`.
- [ ] Rust: exhaustive `ErrorCode` → exit-code assertions.
- [ ] Rust: socket path resolution and namespacing via `pty-host`'s
      `test_support` env redirection, plus a `sun_path` length assertion per base.
- [ ] Rust: listener against a real socket in a temp runtime dir — stale-file
      takeover, live-socket refusal, size cap, unknown op → `denied`, two
      concurrent clients answered independently.
- [ ] TS: each op handler as a pure function over `store`-seeded state, covering
      every acceptance criterion in R9, R10, and R11.
- [ ] TS: registry coverage — every registered op has a handler and vice versa.

## Documentation

- [ ] `apps/docs/guide/cli.md` — the Control commands, the envelope, the
      exit-code table, `--launch` / `--json` / `--yes`, and the `ws` noun break.
- [ ] `docs/domain-language.md` — Control API, the envelope, the op allowlist,
      read vs mutate tier; repoint the existing RFC 0034 link at the package and
      drop "unbuilt" from the Control-mode entry.
- [ ] `docs/proposals/README.md` — index row points at
      `./0034-control-api/proposal.md`, status `accepted`. (Done at planning
      time; re-check at collapse.)
- [ ] No `pnpm docs:api` run — this change touches no `@silo-code/sdk` symbol.

## Verification

- [ ] Every requirement in `requirements.md` is met or explicitly noted as not.
- [ ] `pnpm test`, `pnpm --filter silo exec tsc --noEmit`, `pnpm lint`, and
      `cargo test` pass.
- [ ] End-to-end run via the `verifier-gui` skill: real app, real socket, real
      exit codes for a success, a `not-found`, and a `not-running`.
- [ ] Verify a Silo Dev instance and a production instance do not answer each
      other's clients.
- [ ] ADR written: the Control API's transport and security model — the
      OS-gated socket, the closed allowlist, why no token, and why ADR 0012 stays
      separate. Numbered next in `docs/decisions/` (0049 as of planning).
- [ ] Proposal collapsed to a single curated `docs/proposals/0034-control-api.md`
      with `status: implemented`, the decisions preserved, and the deferred
      ADR 0012 convergence question carried forward.
- [ ] RFC 0033's phase table updated: phase 9's Control-dependent half is now
      unblocked.
