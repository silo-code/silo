---
status: draft
created: 2026-07-22
---

# 0017. Relocate the pty-host daemon binary outside the AppImage mount

## Summary

On Linux, the self-forked pty-host daemon (RFC [0010](./0010-pty-host-daemon.md))
re-execs `std::env::current_exe()`, which — when Silo is running as an AppImage —
resolves to a path inside the FUSE-mounted squashfs. Any terminal session that
outlives the app window (the intended behavior) therefore keeps that AppImage's
mount pinned open for as long as the session lives, which can be indefinitely.
This proposes copying the daemon binary to a stable, non-mount path the first
time it's spawned, so daemon lifetime is decoupled from the AppImage mount.

## Motivation

Terminal persistence is a deliberate feature: `spawn_daemon`
(`apps/desktop/src-tauri/src/commands/session_host.rs`) self-forks the running
binary into a detached daemon per session, and `run_daemon`
(`crates/pty-host/src/daemon.rs`) only tears itself down when the shell child
process exits — there is no idle timeout, because idling while detached is the
point (P1/P2 in RFC 0010).

On macOS/Windows this is harmless: the app binary lives at a stable path
regardless of how long-lived daemons are. On Linux AppImage it is not — the
AppImage runtime mounts its squashfs via FUSE at `/tmp/.mount_Silo_<random>/`
for the life of the process, and `current_exe()` for a process launched from
that mount resolves inside it. A self-forked daemon is therefore a process
whose executable file lives inside a FUSE mount that the daemon itself keeps
alive, for as long as the daemon runs.

Observed in practice on a long-running Linux dev VM: session-host daemons from
terminals opened days apart (each spawned by a different AppImage version, after
updates) were all still alive, each pinning its originating version's mount
"Active" in `df`. Left running long enough, this is unbounded: one live FUSE
mount per app version that ever had a surviving terminal session, never
reclaimed until that specific daemon is killed. It also means updating Silo
while old terminal sessions are attached leaves the _old_ AppImage file's mount
open — the new install runs fine, but the old mount and its now-orphaned daemon
persist untouched.

The RFC 0010 risk table anticipated the general shape of this ("daemon survives
uninstall / leaks across updates") and proposed an idle self-exit as the
mitigation. That doesn't actually fix this case: the daemon isn't idle by any
useful definition — it's holding an intentionally long-lived shell session
open. Timing it out would defeat the feature. The mount-pinning is a side effect
of _where the daemon's own executable lives_, not of how long it runs, so the
fix belongs there.

## Design

On daemon spawn (`SessionHostBackend::spawn_daemon`,
`apps/desktop/src-tauri/src/commands/session_host.rs`), instead of re-exec'ing
`current_exe()` directly:

1. Resolve a stable cache path outside any mount, e.g.
   `<app-data>/pty-host/<version-or-hash>/silo` (app-data dir already resolved
   via `commands/app_paths.rs`, keyed by bundle identifier so Silo/Silo Dev stay
   separate as today).
2. If that path doesn't exist yet (first daemon spawn after an install/update),
   copy `current_exe()` to it and mark it executable (`0o755`).
3. Re-exec _that_ stable copy with the existing `--session-host` argv, instead
   of `current_exe()` directly.

Versioning the cache path (by app version, or a content hash of the running
binary) means an update naturally spawns new daemons from a new stable copy
without touching old ones — old daemons keep running from their own already-
copied binary, unaffected by the original AppImage mount unmounting or being
replaced. A stale-copy sweep (remove cached copies with no live daemon
referencing them) can piggyback on the existing `discovery::reap_stale` pass.

This only applies where it's needed: gate the copy-then-exec behind
`cfg!(target_os = "linux")` (or detect an AppImage launch specifically, e.g.
`APPIMAGE` env var, which the AppImage runtime sets) — macOS/Windows keep
today's direct `current_exe()` re-exec, since their binaries aren't
mount-backed.

## Alternatives considered

- **Idle self-exit (the RFC 0010 mitigation as originally sketched).** Doesn't
  fix this: the session is legitimately alive, not idle. Timing it out breaks
  the persistence feature to work around a packaging side effect.
- **Document it and leave it.** Cheapest, but the failure mode is silent and
  unbounded (mounts accumulate for the lifetime of the machine) and only
  surfaces as a confusing `df` finding, as it did here — not something users
  can self-diagnose.
- **Don't self-fork the AppImage's mounted binary at all; require the AppImage
  to extract itself once on first run** (`--appimage-extract` or similar) and
  always exec from the extracted copy. Rejected: gives up the zero-install,
  single-file AppImage model for the _main_ app launch, which is a much bigger
  behavior change than fixing the daemon's own re-exec path.

## Decision

Draft — not yet implemented.
