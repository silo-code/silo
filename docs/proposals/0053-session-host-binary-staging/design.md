# Design — 0053. Staging the session-host binary outside the app install

Phase 1 (Windows) only. Working artifact — removed when the proposal collapses.

## Architecture

Everything lands in `apps/desktop/src-tauri`, inside code the compiler already
keeps off Unix:

| Where                                    | Change                                                          |
| ---------------------------------------- | --------------------------------------------------------------- |
| `commands/session_windows.rs`            | staging resolver, `T_HELLO`, startup sweep (all `cfg(windows)`) |
| `apps/desktop/src-tauri/tauri.conf.json` | `bundle.windows.nsis.installerHooks`                            |
| `apps/desktop/src-tauri/nsis/hooks.nsh`  | new — pre-uninstall session reaping                             |

`session_windows` is `#[cfg(windows)]` at the module level (`commands/mod.rs:38`),
so a Unix build never compiles any of it. Two constraints hold that line (see
"Keeping Phase 1 off macOS and Linux" in `proposal.md`):

- the staging resolver stays **inside `session_windows.rs`** — not `app_paths.rs`
  or `session_backend.rs`, which compile everywhere. Phase 2 hoists it.
- `crates/pty-host/src/proto.rs` is **not touched**. Windows gets its own
  protocol constants; it mirrors the Unix design rather than sharing its code.

`spawn_daemon` is an inherent method on `SessionWindowsBackend`, not a
`SessionBackend` trait method, so no trait signature changes and no other
platform's impl moves.

## Components

### `session_host_exe() -> Result<PathBuf, String>`

New private fn in `session_windows.rs`. Returns the executable a _new_ daemon
should run. Existing daemons are never touched.

```
<app-data>/session-host/silo-session-host-<hash>.exe
```

- `<app-data>` = `SILO_DATA_DIR` (already exported in `lib.rs` from the bundle
  identifier, so Silo and Silo Dev stay isolated), read via the same
  `std::env::var` path `sessions_dir()` uses.
- `<hash>` = first 16 hex chars of SHA-256 over `current_exe()`'s contents.
  `sha2 = "0.10"` is **already a dependency** (registry pin verification, RFC 0014) — no new crate.
- Memoized in a `OnceLock<Result<PathBuf, String>>`: hashing a ~30 MB binary per
  terminal spawn is wasteful, and the running binary cannot change under us.

Content addressing rather than app version, for two reasons: dev rebuilds keep
one version string across many distinct binaries, and an immutable name means
staging never needs to overwrite a file some daemon is still executing — which
on Windows is impossible anyway.

### Staging (create-if-absent)

1. If the target path exists, return it. No hashing of the target, no mtime
   comparison — the name _is_ the content check.
2. Otherwise copy `current_exe()` to `…-<hash>.exe.tmp-<pid>` in the same
   directory, then `fs::rename` into place. Same-directory rename is atomic
   enough; a concurrent racer that got there first loses the rename harmlessly
   (on Windows `rename` over an existing file fails — treat "target now exists"
   as success).
3. Remove the temp file on any failure path.

### `spawn_daemon` change

One line: `std::process::Command::new(session_host_exe()?)` instead of
`Command::new(current_exe()?)`. Argv, creation flags
(`DETACHED_PROCESS | CREATE_NO_WINDOW`), the `SESSION_ENV_CARRIER` env, and the
null stdio are unchanged.

This works unmodified because the daemon is already **path-independent**: the
`--win-session-host` branch in `main.rs` resolves its session directory from
`SILO_DATA_DIR` and its identity from the RFC 0028 env carrier, and reads no
resource relative to its own binary.

### `T_HELLO` on the Windows wire

New constant in `session_windows.rs` (mirroring, not importing,
`pty_host::proto`):

```rust
const T_HELLO: u8 = 5;          // daemon → client, first frame, payload = u32 BE
const WIN_PROTO_VERSION: u32 = 1;
const WIN_MIN_COMPATIBLE_PROTO: u32 = 1;
```

- **Daemon:** writes `T_HELLO` as the first frame to every connection it
  classifies as a data client, before any replay or live data.
- **Client (`connect`/`attach`):** after connecting, peeks for a first frame
  within the existing `CLIENT_CLASSIFY_TIMEOUT` (100 ms).
  - `T_HELLO` with a compatible version → proceed.
  - `T_HELLO` with an incompatible version → log `host_incompatible` with both
    versions and fail the attach, exactly as `session_host.rs:138` does on Unix.
  - **No frame inside the window → treat as legacy and proceed.** This is the
    transition clause, and it is the whole reason the first release shipping
    this doesn't kill every pre-existing session. Remove it a release later.
- The probe path (`exists`) must keep disconnecting before the classify window
  so it never joins `clients` under `MAX_DATA_CLIENTS = 1` — the regression RFC
  0026 hit on Unix. A daemon writing `T_HELLO` to a probe that has already gone
  must tolerate the broken pipe.

### Startup sweep

Windows has no reaper at all today — `session_maintenance::spawn_maintenance_sweep`
is `#[cfg(unix)]` (`lib.rs:197`). Add a small `cfg(windows)` sweep on a
background thread at startup:

- Delete `.port` files whose port refuses a connection (shared with
  silo-code/silo#573).
- Delete staged binaries in `session-host/` whose hash is neither the running
  binary's nor named by a live session. A delete that fails because the file is
  in use is expected and ignored.

### NSIS pre-uninstall hook

`apps/desktop/src-tauri/nsis/hooks.nsh`, wired via
`bundle.windows.nsis.installerHooks`:

```nsis
!macro NSIS_HOOK_PREUNINSTALL
  ; Session hosts deliberately outlive an update (RFC 0053) — but not an
  ; uninstall. Reap them here rather than relying on the installer's
  ; running-app check, which no longer sees them.
  nsis_tauri_utils::KillProcessCurrentUser "silo-session-host.exe"
  RMDir /r "$APPDATA\com.silo.desktop\session-host"
!macroend
```

The template fires this hook _before_ its own `CheckIfAppIsRunning`
(`installer.nsi:772` vs `:776`), which is the right seam. Two details to settle
during implementation: whether `KillProcessCurrentUser` matches the
content-addressed suffix (it takes an exact image name, so the staged file may
need a stable name with the hash in the _directory_ instead — resolve by
testing), and that the hard-coded identifier must match the build's (`.dev` for
Silo Dev).

## Data flow

Creating a terminal, after the change:

```
SessionWindowsBackend::create(handle, cwd, size, cmd, env)
  └─ spawn_daemon
       ├─ session_host_exe()           ← OnceLock; hash + stage on first call
       │    └─ copy current_exe() → <app-data>/session-host/…-<hash>.exe
       └─ Command::new(staged).args(--win-session-host …).spawn()  [detached]
  └─ connect(handle) → read port file → TcpStream
       └─ read first frame: T_HELLO(version) | nothing (legacy) | data
```

## APIs / interfaces

No change to `@silo-code/sdk`, `ctx`, or the `SessionBackend` trait. Nothing
moves on the host ↔ extension boundary, so the `silo-docs-sync` workflow does
not apply. The one contract that changes is the private Windows wire protocol
(R4), which has no consumers outside this file.

## Persistence

| Path                                                   | Shape                        | Lifetime                       |
| ------------------------------------------------------ | ---------------------------- | ------------------------------ |
| `<app-data>/session-host/silo-session-host-<hash>.exe` | copy of the app binary       | until no live session needs it |
| `<app-data>/sessions/<handle>.port`                    | existing — ASCII port number | until its daemon exits (swept) |

No migration: the first run after the update simply stages a copy and spawns new
daemons from it. Daemons from the previous version keep running from
`$INSTDIR\silo.exe` and are reattached through the legacy branch of R4.

## Error handling

| Failure                                 | Handling                                                                                                                                     |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Hashing or copying fails                | Log to the Terminals channel and **fall back to `current_exe()`**, so a terminal still opens — degraded (update will kill it), never broken. |
| Staged file blocked by policy           | Same fallback. Low risk: Silo already installs and runs from `%LOCALAPPDATA%`, so this tier is already exercised.                            |
| Rename loses a race                     | Target exists → treat as success.                                                                                                            |
| Daemon writes `T_HELLO` to a gone probe | Ignore the broken pipe.                                                                                                                      |
| Sweep cannot delete an in-use file      | Ignore; retried next startup.                                                                                                                |

Logging goes to the existing `silo:terminals` channel and `terminal.log` via
`log_event` — new events `win_stage_hit` / `win_stage_copied` /
`win_stage_failed`, alongside today's `win_daemon_spawned`.

## Testing strategy

The Windows backend has **no automated behavioral coverage** — CI's
`rust-windows` job is `cargo check` only, because a real ConPTY is required
(`.github/workflows/ci.yml`). So split the work:

- **Unit-testable (pure, runs on any host via `#[cfg(test)]` with a temp dir):**
  the staged-path derivation from a hash, the create-if-absent decision, the
  sweep's keep/delete predicate given a set of filenames plus a live-session
  list, and the `T_HELLO` classify decision as a function of
  `(first_frame, elapsed)` → `Proceed | Legacy | Incompatible`. Extract each as a
  free function taking its inputs, per `.agents/skills/silo-testing/SKILL.md`.
- **Hand-verified on Windows:** everything involving a real process, a real
  installer, or a real ConPTY. The R2/R3 acceptance criteria are the script.

## Constraints and existing decisions

- **RFC 0010** — the self-forked daemon model this modifies.
- **RFC 0017** — superseded by this proposal; its Linux case becomes Phase 2.
- **RFC 0026** — `MAX_DATA_CLIENTS = 1` and the classify guard: a probe must
  never evict the live UI attach. The `T_HELLO` work touches that path.
- **RFC 0028** — the session env carrier across the re-exec; unchanged, but the
  staged binary must still inherit it.
- **RFC 0036** — replay tagging on the Unix wire; the Windows backend
  deliberately does not implement it, and this change does not add it.
- **AGENTS.md** — host logging goes to the Output panel via a channel, never
  `console.*`; `silo:terminals` already exists for this subsystem.
