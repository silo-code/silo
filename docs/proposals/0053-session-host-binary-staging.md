---
status: accepted
created: 2026-09-30
supersedes: 0017
---

# 0053. Staging the session-host binary outside the app install

> **Phase 1 (Windows) shipped 2026-10-01** — silo-code/silo#583, #584, #585,
> #586. Phase 2 (Linux / AppImage) is not built, so this stays `accepted`.

## Summary

A persistent terminal session is a detached process executing the **app's own
binary**, re-exec'd straight from `std::env::current_exe()`. That couples
session lifetime to the install artifact: on Windows the running daemons held
`silo.exe` open in the install directory and answered to its image name, so the
installer both _wanted_ to kill them and _had_ to. Updating Silo therefore
destroyed every live terminal — the exact thing terminal persistence exists to
prevent.

New daemons now run from a **content-addressed copy staged under the app-data
dir**, under their own image name, so an install has neither a reason nor a need
to touch a running session. This supersedes RFC
[0017](./0017-pty-host-daemon-outside-appimage-mount.md), which proposed the
same copy-then-exec mechanism for the Linux AppImage mount.

## Motivation

Terminals surviving restarts and updates is a headline behavior, and RFC
[0010](./0010-pty-host-daemon.md) built it by self-forking the app binary into
one detached daemon per session. Where that binary lives was treated as an
incidental detail. It is not: **the daemon's executable path is an input to the
packaging system**, and each platform's packaging reclaims that path differently.

- **Windows.** Ten open terminals were ten extra `silo.exe` processes running out
  of `%LOCALAPPDATA%\Silo\`. Installing over that failed twice: Tauri's NSIS
  template matched them by image name from _both_ its install and uninstall
  sections, and Windows locks a running executable's image file, so the
  installer could not overwrite `$INSTDIR\silo.exe` regardless. The second point
  is why no installer-side setting could fix it — NSIS hooks, `installMode`, the
  WiX restart manager, all of them only convert a prompt into a file-in-use
  error.
- **Linux AppImage** (RFC 0017's case). Same coupling, different reclaimer:
  `current_exe()` inside a FUSE-mounted squashfs means each surviving daemon
  pins its AppImage's mount open indefinitely.
- **macOS is genuinely fine**, and is why this went unnoticed: unlinking a
  running executable is legal, so replacing `Silo.app` leaves daemons executing
  the old inode undisturbed.

One sentence covers both failures: **a process meant to outlive the app must not
be executing a file the app's packaging owns.** One mechanism fixes both, which
is why this supersedes 0017 rather than sitting beside it.

## Phases

| Phase | Scope                                                                                     | Status      |
| ----- | ----------------------------------------------------------------------------------------- | ----------- |
| 1     | **Windows.** Staged binary, uninstall-only reap, wire versioning, startup sweep, CI guard | shipped     |
| 2     | **Linux.** Route the Unix `spawn_daemon` through the same resolver, gated to AppImage     | not started |

## What shipped (Phase 1)

### Staging, content-addressed

`session_host_exe()` (`commands/session_windows.rs`, memoized in a `OnceLock`)
resolves the executable a _new_ daemon runs; existing daemons are never touched.
The layout is `session-host/<hash>/silo-session-host.exe` — **the hash is the
directory, not the file name**, because the uninstall hook kills by exact image
name and a per-build name would be unkillable.

Staging is create-if-absent: an existing file is by definition the right bytes,
so staging never has to overwrite a file a running daemon holds open — which on
Windows is impossible anyway. A staging failure falls back to `current_exe()`:
the terminal still opens, merely as fragile across an update as it used to be.

### Uninstall reaps; update does not

The installer's kill used to double as session cleanup by accident. An
`NSIS_HOOK_PREUNINSTALL` now does it on purpose — **gated on `$UpdateMode`**,
because the uninstaller _also_ runs as a step of an update when the user takes
the uninstall-first branch of the "Already Installed" page. That is the very
flow that motivated this RFC; an ungated kill there would have destroyed every
terminal while appearing to implement the fix.

### A versioned wire, and a transition

The Windows ConPTY backend had no handshake, which was safe only while daemons
never survived an update. It now announces its version on accept, mirroring
`pty_host::proto` **without sharing its code** — that module is the live Unix
contract.

The transition matters more than the check: the first build expecting a hello
meets daemons spawned by the build before it. Silence is therefore classified as
a legacy peer and attached to normally, and when that peer's opening frame was
already terminal output it is carried into the reader rather than dropped.

### A sweep, where there had never been one

`session_maintenance` and `discovery::reap_stale` are both `cfg(unix)`, so
Windows reaped nothing — a real machine carried 22 `.port` files spanning four
months against three live daemons. One startup pass now removes dead `.port`
files and staged binaries from builds no longer running, and `list()` is
liveness-filtered (it previously reported every `.port` ever written as a live
session).

The staged sweep has **no liveness predicate on purpose**: Windows refuses to
delete a running executable, so the delete attempt _is_ the liveness check, and
unlike a process snapshot it cannot race.

## Decisions worth keeping

- **Staging is load-bearing; the rename is not.** Under Tauri 2.11.2 the
  running-app check matches image names, so a rename alone would hide the
  daemons — but Tauri's unreleased template already replaces that with the
  Windows **Restart Manager**, which enumerates by _the file a process has
  loaded_. A renamed copy of the install binary would still be force-shut-down;
  a copy at a different path would not be registered at all. The design rests on
  the path. **Re-read the bundler's template when the CLI pin moves.**
- **The regression guard is a CI job, not a checklist.** R2/R3 are
  process-lifecycle facts, so NSIS silent mode makes them assertable without a
  GUI or a ConPTY. `windows-installer.yml` builds a real bundle, installs over a
  live session host and requires it to survive, then uninstalls and requires it
  gone. It earned its keep before merging by catching an `RMDir` racing the
  image lock Windows had not yet released — a leftover an app-sized binary wide,
  on every uninstall, that no manual pass would plausibly have found.
- **Phase 1 stayed off macOS and Linux by construction.** `session_windows` is
  `#[cfg(windows)]` at the module level, `spawn_daemon` is an inherent method
  rather than a `SessionBackend` trait method, and the resolver was deliberately
  _not_ hoisted into a shared module. `crates/pty-host/src/proto.rs` was not
  touched.

## Alternatives considered

- **Suppress the installer's running-app check.** Does not work: the file lock is
  independent of the check, so this converts a prompt into a failed write.
- **Hand off sessions across the update** — detach, let the installer kill
  everything, re-spawn. Rejected: a killed ConPTY daemon takes its shell's
  process tree with it. Scrollback would return; the running agent or dev server
  would not, which is the part users care about.
- **A dedicated, smaller session-host binary.** Deferred, not rejected. It would
  shrink the staged copy from the whole app to a few hundred kilobytes, at the
  cost of a build target and a second thing to keep in sync. Revisit if disk
  cost bites.
- **Idle self-exit** (RFC 0010's original mitigation). Does not apply: a session
  holding a live shell is not idle by any useful definition.
- **Document it and leave it.** The status quo, and it contradicted the product's
  headline behavior on one of three platforms.

## Evidence

Diagnosed and prototyped on a Windows 11 machine before any code was written.
With the UI stopped and terminals alive, `Get-Process silo` returned three
survivors all executing `…\AppData\Local\Silo\silo.exe`, and opening that file
for write failed with "being used by another process." A copy of that binary,
renamed and started from `%LOCALAPPDATA%` with `--win-session-host`, bound a port
and then **survived an installer run that would have killed it** — no prompt, no
file-in-use error. `windows-installer.yml` now asserts the same thing on every
change.

## Follow-ups

- **Phase 2 (Linux / AppImage).** Route `session_host.rs`'s `spawn_daemon`
  through the same resolver, gated to AppImage launches so `.deb` / `.rpm` /
  dev-run keep today's path. macOS stays on the direct re-exec permanently.
- **silo-code/silo#573** stays open. Its sweep and `list()` points shipped here;
  its third — having `exists()` verify the far end is really a Silo daemon rather
  than whatever inherited a recycled port — cannot close until the handshake's
  legacy arm is removed a release later. That is also when the recycled-port
  hazard closes.
