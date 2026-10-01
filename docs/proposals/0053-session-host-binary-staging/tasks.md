# Tasks — 0053. Staging the session-host binary outside the app install

Phase 1 (Windows). Working artifact — removed when the proposal collapses.

Ordered: the staging resolver is the load-bearing piece and should land and be
hand-verified first, since it alone satisfies R2. The handshake, hook, and sweep
build on it.

## Staging resolver (R1)

- [x] Extract `staged_exe_name(hash: &str) -> String` and
      `staged_dir(data_dir: &Path) -> PathBuf` as free functions — pure, unit-testable.
- [x] Add `hash_exe(path: &Path) -> io::Result<String>` using the existing
      `sha2` dep; first 16 hex chars of SHA-256.
- [x] Add `session_host_exe()` in `session_windows.rs` with a
      `OnceLock<Result<PathBuf, String>>` memo.
- [x] Implement create-if-absent staging: copy to `…tmp-<pid>`, rename into
      place, treat "target exists" as success, clean up the temp on failure.
- [x] Point `spawn_daemon` at `session_host_exe()`, falling back to
      `current_exe()` on error.
- [x] Add `win_stage_hit` / `win_stage_copied` / `win_stage_failed` events via
      `log_event`.

## Wire handshake (R4)

- [x] Add `T_HELLO`, `WIN_PROTO_VERSION`, `WIN_MIN_COMPATIBLE_PROTO` to
      `session_windows.rs`. **Do not import or modify `pty_host::proto`.**
- [x] Daemon: write `T_HELLO` as the first frame on **accept**, ahead of client
      classification — every client path already skips unknown tags, so this is
      backward-compatible both ways. Tolerates a broken pipe from a departed probe.
- [x] Client: extract
      `classify_hello(first: Option<(u8, Vec<u8>)>) -> HelloVerdict` returning
      `Proceed | Legacy | Incompatible { daemon, app }`.
- [x] Wire it into `connect`/`attach`; log `host_incompatible` on mismatch and
      fail the attach.
- [x] Confirm `exists()` still disconnects before the classify window and never
      joins `clients`.

## Uninstall hook (R3)

> **The uninstaller also runs during an update.** The installer invokes the
> previous version's uninstaller with `/UPDATE` when the user takes the
> uninstall-first path on the "Already Installed" page, and
> `NSIS_HOOK_PREUNINSTALL` fires on that path too. An ungated kill there would
> destroy every terminal on exactly the flow this RFC exists to fix. The hook is
> gated on `$UpdateMode <> 1`, which `un.onInit` has already set by then.

- [x] Add `apps/desktop/src-tauri/nsis/hooks.nsh` with `NSIS_HOOK_PREUNINSTALL`.
- [x] Wire `bundle.windows.nsis.installerHooks` in `tauri.conf.json`.
- [x] Resolve how the kill targets the staged image. **Decided:** the hash is
      the _directory_ (`session-host/<hash>/silo-session-host.exe`) so the image
      name stays stable and `KillProcessCurrentUser` can target it by name. A
      test asserts the file name never varies per build.
- [x] Make sure the identifier in the hook matches the build. **Resolved:** the
      hook uses the template's own `${BUNDLEID}`, so dev and prod are handled
      without hard-coding either.

## Sweep (R5)

- [x] Extract `staged_sweep_candidates(entries, current)` — pure. **No liveness
      predicate:** Windows refuses to delete a running executable, so the delete
      attempt _is_ the liveness check, and unlike a process snapshot it cannot
      race.
- [x] Add a `cfg(windows)` startup sweep thread: stale `.port` files, then
      unreferenced staged binaries. Ignore in-use delete failures.
- [x] Coordinate with silo-code/silo#573 so the `.port` reaping lands once, not twice.

## CI — the regression guard (do this with the staging resolver, not after)

- [x] Add a `windows-latest` job that builds the NSIS bundle, starts a detached
      process from a staged copy, runs the installer silently (`/S`), and asserts
      the install succeeded **and the process survived** (R2).
- [x] Extend it to run the uninstaller silently and assert the process is gone
      and the staged directory removed (R3).
- [x] Decide the trigger: every PR, or `main`/label-gated if the bundle build is
      too slow. It must run somewhere.

## Tests

- [x] `staged_exe_name` / `staged_dir` derivation.
- [x] Create-if-absent: absent → copies; present → no copy; race → success.
- [x] `classify_hello`: compatible, incompatible, absent-frame (legacy), and a
      non-`T_HELLO` first frame.
- [x] `sweep_plan`: keeps current, keeps live, deletes orphans, handles empty.
- [ ] `pnpm test` green.

## Verification

### Automated

- [ ] `pnpm test`, `pnpm --filter silo exec tsc --noEmit`, `pnpm lint` pass.
- [ ] `cargo check` passes on a Unix host **and** on the `rust-windows` CI job.
- [ ] `git diff --stat` shows no change to any Unix-compiled file, and
      `crates/pty-host/src/proto.rs` is untouched (R6).

### By hand on Windows — only what resists automation

R2/R3 are covered by the CI job above; these remain because they are GUI-shaped.

- [ ] R1: after opening a terminal, `Get-Process` shows the session host running
      from `<app-data>\session-host\`, not from the install dir.
- [ ] R1: a second terminal reuses the staged file (mtime unchanged).
- [ ] R2 (end to end, beyond what CI asserts): with several terminals open
      running foreground programs, install a newer build and confirm reopening
      Silo reattaches with scrollback and foreground process intact.
- [ ] R2: `terminal.log` shows new daemons on a new staged hash while the old
      ones keep serving (`app_boot`, `win_stage_*`, `win_daemon_spawned`,
      `attach*`).
- [ ] R4 transition: a build with the handshake attaches successfully to a
      daemon spawned by a build without it.
- [ ] R3: uninstalling kills every session host and removes the staged directory.
- [ ] R5: stale `.port` files and orphaned staged binaries are gone after a restart.

### Closing out

- [ ] Every requirement in `requirements.md` met or explicitly noted as not.
- [ ] Durable decisions recorded as ADRs — candidate: "a process meant to
      outlive the app must not execute a file the packaging owns," if it proves
      to be a rule rather than a one-off.
- [ ] Collapse to a single curated `0053-session-host-binary-staging.md`,
      **`status: accepted`** with the phase table updated (Phase 2 remains), not
      `implemented` — see "Multi-phase changes" in
      `change-planning-convention.md`.
- [ ] Repoint the `docs/proposals/README.md` index row back at the single file.
