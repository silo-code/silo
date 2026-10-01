---
status: accepted
created: 2026-09-30
supersedes: 0017
---

# 0053. Staging the session-host binary outside the app install

## Summary

A persistent terminal session is a detached process executing the **app's own
binary** (`silo.exe --win-session-host …`, `silo --session-host …`), re-exec'd
straight from `std::env::current_exe()`. That couples session lifetime to the
install artifact: on Windows the running daemons hold `silo.exe` open in the
install directory and answer to its image name, so the installer both _wants_ to
kill them (its running-app check matches by image name) and _must_ kill them (a
running executable's file cannot be overwritten). Updating Silo therefore
destroys every live terminal — the exact thing terminal persistence exists to
prevent. This proposes resolving the daemon's executable through a **staged,
content-addressed copy under the app-data dir**, spawned under its own image
name, so a new install never has a reason or a need to touch a running session.
It generalizes (and supersedes) RFC [0017](./0017-pty-host-daemon-outside-appimage-mount.md),
which proposed the same copy-then-exec mechanism for the Linux AppImage mount.

## Motivation

Terminals surviving app restarts and updates is a headline behavior, and RFC
[0010](./0010-pty-host-daemon.md) built it by self-forking the app binary into
one detached daemon per session. Where that binary lives was left as an
incidental detail. It isn't one: **the daemon's executable path is an input to
the packaging system**, and every platform's packaging reclaims that path
differently.

**Windows (the reported break).** `SessionWindowsBackend::spawn_daemon`
(`apps/desktop/src-tauri/src/commands/session_windows.rs:472`) re-execs
`current_exe()` with `--win-session-host`, dispatched before Tauri init in
`apps/desktop/src-tauri/src/main.rs:43`. Ten open terminals are therefore ten
extra `silo.exe` processes running out of the install directory — which on
Windows is the **per-user** `%LOCALAPPDATA%\Silo\`, so the NSIS `INSTALLMODE` is
`currentUser` and the check resolves to `FindProcessCurrentUser`. Installing a
newer build over that fails twice over:

1. Tauri's NSIS template tests for a running app by **image name**:
   `CheckIfAppIsRunning "${MAINBINARYNAME}.exe"` → `nsis_tauri_utils::FindProcess`
   / `KillProcess`. That matches every session host, not just the window — and it
   is invoked from _both_ the install section and the uninstall section, which is
   exactly why the prompt appears whichever answer is given to the
   reinstall-or-uninstall page ahead of it. (Verified against the template this
   repo actually builds with — see "Source of truth" below.)
2. Windows holds a lock on a running executable's image file. Even with that
   check removed, the installer cannot overwrite `$INSTDIR\silo.exe` while
   daemons are executing it. **The kill is not gratuitous — the current layout
   requires it.**

That second point is why no installer-side setting fixes this. NSIS hooks, a
custom `.nsh`, `installMode`, the WiX/MSI restart manager — all of them can only
move the failure from a dialog to a file-in-use error. The fix has to be that
nothing the installer owns is executing.

**Linux AppImage (RFC 0017's case).** The same coupling, a different reclaimer:
`current_exe()` inside a FUSE-mounted squashfs means each surviving daemon pins
its originating AppImage's mount open indefinitely — observed in practice as one
live mount per app version that ever had a surviving terminal.

**macOS is genuinely fine** and is the reason this went unnoticed: unlinking a
running executable is legal, so replacing `Silo.app` leaves existing daemons
executing the old inode undisturbed.

The shared root cause is one sentence: **a process that is meant to outlive the
app must not be executing a file the app's packaging owns.** One mechanism fixes
both platforms, which is why this supersedes 0017 rather than sitting beside it.

Two things make the Windows fix cheap. The daemon is already
**path-independent**: it resolves everything it needs from inherited environment
(`SILO_DATA_DIR` for the session/port directory,
`session_windows.rs:174`; the RFC 0028 env carrier for session identity) and
nothing on the `--win-session-host` code path consults `current_exe()` or reads
resources relative to the binary. And the daemon is already the _same bytes_ as
the app, so "stage a copy" and "give it a different image name" are the same
operation.

## Proposed solution

| Phase | Scope                                                                                                                                                               | Status      |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 1     | **Windows.** Staged content-addressed daemon binary, own image name, `T_HELLO` handshake with a legacy-tolerant transition, NSIS pre-uninstall hook, startup sweep. | in progress |
| 2     | **Linux.** Route the Unix `spawn_daemon` through the same resolver, gated to AppImage launches — RFC 0017's original case.                                          | not started |

Phase 1 is planned in `requirements.md` / `design.md` / `tasks.md` alongside
this file; Phase 2 gets its own planning pass when its turn comes. The sketch
below is the durable shape — the implementation detail lives in `design.md`.

### 1. A staged, content-addressed daemon binary

One new resolver — call it `session_host_exe()` — returns the path to execute
for a **new** daemon. Existing daemons are never touched.

```
<app-data>/session-host/silo-session-host-<hash>[.exe]
```

- `<app-data>` is the existing `commands::app_paths::data_dir()`, keyed by bundle
  identifier, so Silo and Silo Dev stay isolated exactly as today.
- `<hash>` is a short digest of the running binary's contents. **Content
  addressing, not the app version**, for two reasons: dev rebuilds keep one
  version string across many distinct binaries, and an immutable filename means
  the staging step never has to overwrite a file some old daemon is still
  executing — the case Windows cannot do at all.
- Staging is _create-if-absent_: hash `current_exe()`, and if the target is
  missing, copy to `…-<hash>.tmp-<pid>` and rename into place (on Unix also
  `chmod 0o755`). The hash is computed once per app process and memoized
  (`OnceLock`); daemon spawn is not a hot path, but reading tens of megabytes
  per terminal is still not free.
- `spawn_daemon` then re-execs _that_ path with today's unchanged argv, creation
  flags, and env carrier.

An update naturally spawns new daemons from a new staged copy while old daemons
keep serving from theirs — no version negotiation on disk, no window where a
file is both running and being replaced.

### 2. Staging is the load-bearing half; the rename is not

The staged filename is also deliberately **not** `silo.exe`, which under today's
pinned Tauri (2.11.2) is enough on its own to hide the daemons from the
running-app check — it matches image names. **Do not lean on that.** Tauri's
unreleased template has already replaced `FindProcess` with the Windows
**Restart Manager**: `RmRegisterFile("$INSTDIR\silo.exe")` followed by
`RmGetList`, which enumerates processes by the _file they have loaded_, not by
what they are called. A renamed copy of `$INSTDIR\silo.exe` would still be
found and force-shut-down; a copy at a **different path** would not be
registered at all.

So the design rests on **where the binary lives**, and the rename is kept only
because it is free and makes Task Manager legible. Any future fix that tries to
solve this by renaming alone will regress the next time Tauri's bundler updates.

The daemon stays a **self-re-exec of the same binary** (argv dispatch in
`main.rs`), not a separate cargo bin or Tauri sidecar. A dedicated, smaller
session-host binary is the tidier long-term shape and would shrink the staged
copy from the whole app to a few hundred kilobytes — deferred, not rejected: it
adds a build target and a second thing to keep in sync for a disk cost paid only
while a daemon from that version is alive.

### 3. Uninstall should still kill sessions — update should not

Today the installer's kill accidentally doubles as session cleanup. Once daemons
are out of `$INSTDIR`, uninstalling Silo would leave them running, which is
wrong. Separating the two cases is the point of the change, so make it explicit:
a Tauri `bundle.windows.nsis.installerHooks` `.nsh` with an
`NSIS_HOOK_PREUNINSTALL` that terminates `silo-session-host-*.exe` and removes
the staged directory. The template fires that hook _before_ its own app-running
check, so it is the right seam: the uninstaller reaps sessions deliberately
rather than as a side effect. **Uninstall kills terminals; update does not.**

Staged copies also need sweeping when no daemon references them. On Unix this
piggybacks on the existing `discovery::reap_stale` /
`session_maintenance::spawn_maintenance_sweep` pass; Windows has **no equivalent
sweep at all** (`spawn_maintenance_sweep` is `#[cfg(unix)]`, `lib.rs:197`), so
the Windows side needs a minimal startup sweep: delete staged binaries whose hash
is neither the running binary's nor referenced by a live session.

### 4. The Windows wire protocol needs a version frame

This change makes something newly possible that has never happened: **a Silo
attaching to a session host built from a different binary.** Unix already guards
it — the daemon's first frame is `T_HELLO` carrying `PROTO_VERSION`, and a
mismatch is refused and logged as `host_incompatible`
(`commands/session_host.rs:138`, `crates/pty-host/src/proto.rs`). The Windows
ConPTY backend has **no handshake**; the client reads the port file, connects,
and starts framing on fixed tag constants. That is safe only while daemons never
survive an update — which is precisely the invariant this RFC removes.

So Phase 1 includes a `T_HELLO` for the Windows backend mirroring
`pty_host::proto`, with one transitional wrinkle worth naming because it is easy
to get wrong: **the first version that expects a hello will meet daemons that
never send one.** The client must therefore treat "no hello within the existing
`CLIENT_CLASSIFY_TIMEOUT` window" as legacy-proto rather than as a failure, for
one release, before the frame becomes mandatory. Without that, the very update
this RFC is meant to make survivable would be the one that kills every terminal.

### Scope

Windows and Linux only. macOS keeps the direct `current_exe()` re-exec: it has
no problem to solve, and copying a signed Mach-O out of its notarized bundle
invites Gatekeeper questions for no benefit.

### Risks

- **Execution policy.** ~~Managed environments may block execution from
  user-writable paths.~~ Retired on inspection: Silo's Windows installer is
  already per-user and the app itself runs from `%LOCALAPPDATA%\Silo\`, so
  staging the daemon into the same tier adds no exposure that shipping the app
  doesn't already have.
- **Disk.** One app-sized copy per binary that has a live daemon. Bounded by the
  sweep; the dedicated-binary option above is the escape hatch if it bites.
- **Orphan daemons.** Sessions now genuinely survive an uninstall of an _older_
  version that lacked the uninstall hook. One-time, and they exit when their
  shell does.

## Alternatives considered

- **Suppress the installer's running-app check** (NSIS hook, custom template,
  `/P` passive mode). Doesn't work: the file lock is independent of the check,
  so this converts a prompt into a failed write.
- **Ask the app to hand off sessions across the update** — detach, let the
  installer kill everything, re-spawn after. Rejected: a killed ConPTY daemon
  takes its shell's process tree with it. The scrollback would come back (the
  buffer blob is backend-agnostic) but the running `claude`/dev server would not,
  which is the part users actually care about.
- **Install to `%LOCALAPPDATA%` (per-user) instead of `Program Files`.** Avoids
  elevation, but the lock and the image-name match are both unchanged. Orthogonal.
- **Accept it and document "close your terminals before updating."** This is the
  status quo, and it contradicts the product's headline behavior on one of three
  platforms.
- **Idle self-exit for daemons** (RFC 0010's original mitigation). Doesn't apply:
  a session holding a live shell is not idle by any useful definition.

## Phasing

1. **Windows.** `session_host_exe()` + content-addressed staging + the renamed
   image, the Windows `T_HELLO` with its legacy-tolerant transition, the NSIS
   pre-uninstall hook, and the startup sweep.
2. **Linux.** Route `session_host.rs:80` through the same resolver, gated to
   AppImage launches — RFC 0017's original case, now on shared machinery.

### Keeping Phase 1 off macOS and Linux

Phase 1 is Windows-only by construction, and the package graph already enforces
it: `session_windows` is `#[cfg(windows)]` at the module level
(`commands/mod.rs:38`), `session_host` / `session_maintenance` are
`#[cfg(unix)]`, `pty-host` is a `cfg(unix)` dependency, `active_backend()` is a
cfg split, and `spawn_daemon` is an _inherent_ method rather than a
`SessionBackend` trait method — so staging needs no trait change, which is the
one edit that would force every platform's impl to move. A Unix build never
compiles any of this.

Two implementation constraints keep it that way. Both are easy to violate while
making the code "tidier":

- **Keep the resolver inside `session_windows.rs` for Phase 1.** Writing
  `session_host_exe()` as a shared helper in `app_paths.rs` or
  `session_backend.rs` — both of which compile on every platform — puts a
  Windows-only change into Unix-compiled files for no gain. Hoist it in Phase 2,
  when Linux actually needs it.
- **Do not touch `crates/pty-host/src/proto.rs`.** §4 says _mirror_
  `pty_host::proto`, not share it. Moving `PROTO_VERSION` /
  `MIN_COMPATIBLE_PROTO` into common code edits the live Unix wire contract,
  where daemon and client must agree — a mismatch there breaks terminal reattach
  on both macOS and Linux. Windows gets its own constants.

Phase 2 is the genuinely cross-platform step, and its AppImage gate is what
bounds it: `.deb` / `.rpm` / dev-run launches must keep today's direct
`current_exe()` re-exec. macOS stays on that path permanently (see Scope).

Note that CI's `rust-windows` job is `cargo check` only — the Windows backend
needs a real ConPTY, so there is no automated behavioral coverage for it
(`.github/workflows/ci.yml`). Phase 1 therefore carries more hand-verification
than a typical change; the acceptance test below is the substitute.

## Verification

The durable trail already exists (per `AGENTS.md`): `terminal.log` under the
app-data dir records `app_boot`, `win_daemon_spawned`, and the `attach*` /
`host_incompatible` events. The acceptance test is manual and specific — open
several Windows terminals with long-running foreground programs, install a newer
build over the running app, and confirm the installer never prompts to close
Silo, the new app reattaches to every session with its foreground process intact,
and the log shows new daemons spawning from a new staged hash while the old ones
kept serving.

### Prototype result (2026-10-01, Windows 11, Silo 0.71.1)

The core mechanism was validated **before any code was written**, using the
existing `--win-session-host` argv interface:

1. `silo.exe` was copied from `%LOCALAPPDATA%\Silo\` to
   `%LOCALAPPDATA%\silo-session-host-test.exe` and started with
   `--win-session-host test-stage C:\ 80 24`, inheriting
   `SILO_DATA_DIR=%APPDATA%\com.silo.desktop`.
2. It bound a port and wrote `sessions\test-stage.port` (58862) — a relocated,
   renamed copy serves a session with no other changes, confirming the daemon's
   path-independence claim above.
3. The three real `silo.exe` daemons were killed, leaving the staged copy as the
   only session host, and the 0.71.1 installer was run over the existing install
   via "Add/Reinstall components".
4. **The installer never prompted to close Silo, completed without a file-in-use
   error, and the staged daemon was still running afterward.**

That exercises every load-bearing assumption of this RFC except the
cross-version reattach in §4, which needs the real implementation to test.

## Source of truth

The NSIS claims above are read from the template this repo builds with, not from
recollection. `@tauri-apps/cli` is pinned to **2.11.2** (`pnpm-lock.yaml`), and
the bundler's template is not vendored here — it compiles into the CLI binary.
It is readable at
`tauri-apps/tauri@tauri-cli-v2.11.2:crates/tauri-bundler/src/bundle/windows/nsis/`
(`installer.nsi` + `utils.nsh`), where `CheckIfAppIsRunning` is invoked from the
install and uninstall sections and implemented over `FindProcess`, the
reinstall-or-uninstall page is a custom page ahead of both, and all four
`NSIS_HOOK_{PRE,POST}{INSTALL,UNINSTALL}` macros exist. The same two files on
`dev` show the Restart Manager rewrite. **Re-read both when the CLI pin moves** —
this RFC's §2 depends on which mechanism ships.

A Windows bundle build also writes the fully substituted script to the target
directory, which is the closest thing to a ground-truth artifact if the upstream
file and observed behavior ever disagree.

**Confirmed on a Windows 11 test machine (2026-09-30).** With the Silo UI
stopped and terminals still alive, `Get-Process silo` returned three surviving
processes, all with `Path` = `C:\Users\<user>\AppData\Local\Silo\silo.exe`,
and opening that file for write failed with "being used by another process."
Both halves of the Motivation hold in practice: the daemons are
name-indistinguishable from the app, and the file they execute cannot be
replaced while they run.

## Decision

**Accepted 2026-10-01.** The diagnosis and the core mechanism were both
confirmed on a Windows 11 machine before implementation (see Source of truth and
the prototype result above): the session hosts are name-indistinguishable from
the app, the file they execute cannot be replaced while they run, and a
relocated copy survives an install untouched. Implementation proceeds in the two
phases above, with the Windows `T_HELLO` from §4 landing first via the session
reaping work in silo-code/silo#573.
