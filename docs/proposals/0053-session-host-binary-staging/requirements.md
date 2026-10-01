# Requirements — 0053. Staging the session-host binary outside the app install

Scoped to **Phase 1 (Windows)**. Phase 2 (Linux / AppImage) is out of scope
here and gets its own planning pass — see the phase table in `proposal.md`.

Working artifact — removed when the proposal collapses.

## R1 — A new session host runs from a staged copy, never from the install directory

Creating a terminal must spawn a daemon whose executable lives under the
app-data dir, not under `$INSTDIR`. The staged file is content-addressed and
immutable, so staging never overwrites a file an existing daemon is executing.

### Acceptance criteria

- [ ] After creating a terminal, no process reports an image path under the
      install directory except the app window itself.
- [ ] The staged file exists at
      `<app-data>/session-host/silo-session-host-<hash>.exe` and its contents
      are byte-identical to the running `silo.exe`.
- [ ] Spawning a second terminal reuses the existing staged file — it is not
      re-copied, and its mtime is unchanged.
- [ ] A build whose binary differs produces a different `<hash>` and a second
      staged file; the first is left untouched.
- [ ] The hash is computed at most once per app process.

## R2 — Terminals survive installing a new version

Installing a build over a running one must neither prompt to close Silo nor
terminate any session host, and sessions must remain attachable afterward.

### Acceptance criteria

- [ ] With terminals open (including ones running a foreground program), the
      installer completes without the "close Silo to continue" prompt.
- [ ] No file-in-use error; the install succeeds.
- [ ] Every session-host process from before the install is still running after
      it, with its foreground process intact.
- [ ] Reopening Silo reattaches to those sessions and their scrollback.
- [ ] `terminal.log` shows new daemons spawning from a new staged hash while the
      pre-existing ones continue to serve.

## R3 — Uninstalling Silo still terminates its session hosts

The cleanup that the installer's running-app check performs today by accident
must become deliberate, and must happen on uninstall only.

### Acceptance criteria

- [ ] Uninstalling terminates every `silo-session-host-*.exe` process.
- [ ] Uninstalling removes the staged `session-host` directory.
- [ ] Installing/updating does neither of those things.

## R4 — A version-checked handshake on the Windows wire

A client must be able to tell whether a daemon it is attaching to speaks its
protocol, since daemons now outlive the app that spawned them.

### Acceptance criteria

- [ ] On connect, a daemon sends a first frame carrying its protocol version.
- [ ] A client meeting an incompatible version refuses the attach and logs
      `host_incompatible` with both versions, rather than framing against it.
- [ ] **Transition:** a client meeting a daemon that sends no such frame within
      the existing classify window treats it as legacy and attaches normally —
      so the first release expecting a handshake does not kill sessions spawned
      by the release before it.
- [ ] The probe path (`exists`) still does not register as a data client under
      `MAX_DATA_CLIENTS = 1`.

## R5 — Staged copies and session state are swept

Nothing accumulates without bound, on a platform that currently never reaps.

### Acceptance criteria

- [ ] At startup, staged binaries that are neither the running binary's hash nor
      referenced by a live session are deleted.
- [ ] A staged file in use is never deleted, and a failed delete is not fatal.
- [ ] Stale `.port` files are removed (shared with silo-code/silo#573).

## R6 — No regression on macOS or Linux

### Acceptance criteria

- [ ] No file that compiles on Unix changes behavior; the diff is confined to
      `#[cfg(windows)]` code, `tauri.conf.json`'s `bundle.windows`, and the new
      `.nsh`.
- [ ] `crates/pty-host/src/proto.rs` is unmodified.
- [ ] `pnpm test`, `pnpm lint`, and `tsc --noEmit` pass; `cargo test` passes on
      both a Unix host and the `rust-windows` CI job (which runs the full suite
      as of silo-code/silo#578, not just `cargo check`).

## Out of scope

- **Phase 2 (Linux / AppImage).** The Unix `spawn_daemon` keeps today's direct
  `current_exe()` re-exec.
- **macOS.** Permanently out — unlinking a running executable is legal there, so
  there is no problem to solve, and copying a signed Mach-O out of its notarized
  bundle would add Gatekeeper risk for no benefit.
- **A dedicated, smaller session-host binary.** Deferred, not rejected: the
  staged copy is the whole app binary for now. Revisit if disk cost bites.
- **Cross-version reattach behavior beyond the handshake.** R4 establishes that a
  mismatch is _detected_; migrating a live session across an incompatible
  protocol change is not attempted.
