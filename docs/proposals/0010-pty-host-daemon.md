---
status: implemented
created: 2026-06-04
---

# 0010. Self-owned PTY host daemon (replace abduco)

_Lifted from the former `PTY-HOST-PLAN.md`; this is the RFC of record._

**Priority: pre-open-source.** This must land **before Silo goes public** —
shipping a project that requires `brew install abduco` on first run is a
non-starter for open-source onboarding and portability. **Owner:** _unassigned_.

This RFC captures the functionality we must preserve, the design we're leaning
toward, and the risks/advantages, so the work can be scoped when we pick it up.

---

## Why

Today persistent terminal sessions are provided by **abduco**, an external
binary the user must install (`brew install abduco`). It's a good stopgap, but:

- **External dependency.** As Silo goes 100% open source, "first run requires a
  Homebrew package" is a sharp edge for install/onboarding and a portability
  problem (Linux distros package it inconsistently; Windows has nothing).
- **Opaque process model.** abduco daemonizes the session and reparents the
  shell to its own server. We attach as a _client_, so the PTY master fd we hold
  is one hop removed from the shell. That blocks any capability that needs the
  real terminal's state — see [Foreground-process awareness](#new-capabilities)
  below.
- **Coarse control.** We drive abduco lifecycle by shelling out (`pkill -f
<handle>` to terminate — see `session_backend.rs` `kill()`), and detect
  liveness by parsing `abduco`'s plain-text session list. It works, but it's
  string-scraping a CLI rather than a protocol we own.

Owning the session host removes the dependency, makes the model ours to extend,
and unlocks terminal capabilities we can't get through abduco.

The swap point already exists: the **`SessionBackend` trait**
(`src-tauri/src/commands/session_backend.rs`). Its header comment names this
destination explicitly — _"When we replace abduco with a self-owned pty-host
daemon, that is a single new impl of `SessionBackend`; nothing above the seam
changes."_ Everything above the seam (Tauri commands, the reader loop, the
session registry, lifecycle logging, the entire frontend) is already
backend-agnostic. **This plan is one new `SessionBackend` impl** (plus the
daemon it talks to).

---

## Current architecture (what we're replacing)

Persistence today is **two independent mechanisms**, and it's important to keep
them separate when reasoning about the replacement:

1. **Process persistence (abduco).** Keeps the shell _and any foreground program
   inside it_ (claude, vim, a dev server) alive when no window is attached and
   across app restarts. This is the part abduco owns and the part we must
   reimplement.
2. **Screen/scrollback persistence (ours, backend-agnostic).** The frontend
   serializes the xterm.js buffer (SerializeAddon) to a self-contained string;
   `terminal_buffer.rs` stores it as an opaque keyed blob
   (`~/.app-editor/terminal-buffers/<sessionId>.term`); on reattach the frontend
   writes it back into a fresh same-size terminal. This is VS Code-style "process
   revive" and **does not depend on abduco** — it stays as-is.

### The seam (`SessionBackend`)

```
trait SessionBackend {
    fn handle_for(&self, session_id) -> String;          // opaque session id → backend handle
    fn create(&self, handle, cwd, size) -> Connection;   // create + attach
    fn attach(&self, handle, size)      -> Connection;   // reattach to existing
    fn exists(&self, handle)            -> bool;          // liveness
    fn list(&self)                      -> Vec<String>;   // reconciliation
    fn kill(&self, handle)              -> Result<()>;    // force-terminate (even mid-foreground-program)
}
struct Connection { master, reader, writer, child }       // a live attached PTY bridge
```

Supporting pieces, all backend-agnostic and **kept**:

- `session_registry.rs` — persists `sessionId → handle` to
  `~/.app-editor/terminal-sessions.json` so reattach never re-derives a handle.
  Stores opaque strings; survives the swap untouched.
- `terminal_io.rs` `run_reader_loop` — reads PTY bytes, UTF-8 decodes (carrying
  partial codepoints), emits `terminal_output:<sessionId>` Tauri events.
- `terminal.rs` — the Tauri commands (`terminal_create/attach/write/resize/kill`,
  `terminal_save_buffer/get_buffer`).

### How abduco satisfies the trait today (`AbducoBackend`)

- `create` → spawn `abduco -A <handle> $SHELL -l` under a local PTY; sets
  `TERM=xterm-256color`, `COLORTERM=truecolor`.
- `attach` → spawn `abduco -a <handle>` under a local PTY.
- `exists`/`list` → run `abduco` (no args) and parse the session-list text.
- `kill` → `pkill -TERM -f -- <handle>`, 150 ms grace, then `pkill -KILL`.

---

## Functionality we need

### Must preserve (parity with abduco)

| #   | Capability                       | Notes                                                                                                                                                    |
| --- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | **Detached survival**            | Shell + foreground program stay alive when the window/app detaches or quits.                                                                             |
| P2  | **Reattach across app restarts** | New app process reconnects to a still-running session by persisted handle.                                                                               |
| P3  | **Multiple/again attach**        | Reattach must redraw correctly (today the frontend strips abduco's alt-screen re-enter — `stripLeadingAltEnter`; replacement should not need that hack). |
| P4  | **Resize propagation**           | `SIGWINCH` reaches the real PTY so TUIs (claude, vim) redraw.                                                                                            |
| P5  | **Force-kill mid-program**       | Terminate a session even while a foreground program runs — not "write `exit\n`".                                                                         |
| P6  | **Liveness / reconciliation**    | Answer "does handle X still exist?" and "list live handles" to match persisted tabs against reality and reap orphans.                                    |
| P7  | **Clean lifecycle signals**      | Surface real process exit (code) distinct from "session gone".                                                                                           |
| P8  | **Env + cwd fidelity**           | Spawn login shell in the right cwd with `TERM`/`COLORTERM` (and future env).                                                                             |

### New capabilities (the reason this is more than a dependency swap)

| #   | Capability                          | Unlocks                                                                                                                                        |
| --- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| N1  | **Foreground process group + name** | The daemon owns the real PTY, so it can `tcgetpgrp()` the master and resolve the foreground leader's name. Frontend consumer of this gets:     |
| N1a | → **Tab-title revert**              | foreground == shell ⇒ at a prompt ⇒ clear any program-set OSC title, fall back to base name (fixes the "title sticks after Claude exits" gap). |
| N1b | → **VS Code-style program names**   | show `python`, `node`, `vim` in the tab while they run — **shell-agnostic, no shell injection**.                                               |
| N2  | **cwd reporting**                   | foreground process cwd → "reveal in files", new-terminal-here, smarter titles.                                                                 |
| N3  | **No external install**             | bundled host binary / in-process daemon; zero `brew install`.                                                                                  |

> **Why abduco can't do N1:** abduco's daemon owns the shell's PTY; we're a
> client one hop away, so `tcgetpgrp(our_master)` returns the _client's_
> foreground group, not the shell's. A self-owned daemon holds the real master
> and can report foreground pgrp + name **over its own control protocol**. That
> is the crux of this whole effort — N1 is not a free side effect of owning the
> fd in the app; it's a capability we deliberately build into the daemon's
> protocol.

---

## Proposed design

A small **session-host daemon** that owns the real PTYs and outlives any app
window, plus a thin client (`SessionHostBackend: SessionBackend`) the app speaks
to.

### Shape

```
 app process (Tauri)                      session-host daemon (detached, long-lived)
 ┌─────────────────────┐                  ┌───────────────────────────────────────┐
 │ SessionHostBackend  │ ── control IPC ──│ session table: handle → {pty, child,   │
 │  (impl SessionBackend)                 │   ring buffer, fg-state}               │
 │                     │ ── data stream ──│ owns real PTY master per session       │
 └─────────────────────┘                  │ tcgetpgrp + proc lookup for N1/N2      │
                                           └───────────────────────────────────────┘
```

- **Daemon ownership.** The daemon `forkpty`/opens a PTY per session and execs
  `$SHELL -l`. It is the session's controlling process, so the shell survives
  client disconnect (P1) and the daemon survives app exit (P2). On macOS/Linux:
  double-fork + `setsid`, reparented to init.
- **Transport.** A Unix domain socket per host (e.g.
  `~/.app-editor/host.sock`), framed protocol with two channels:
  - **control** — `create/attach/resize/kill/exists/list/foreground` requests.
  - **data** — raw PTY bytes in/out, multiplexed by handle (or one socket per
    attached session — TBD, see open questions).
- **Mapping to the seam.** `SessionHostBackend::create` opens the control
  socket (spawning the daemon if absent — the classic "connect, else fork the
  daemon, retry" dance), sends `create`, and returns a `Connection` whose
  reader/writer are the data channel for that handle. `attach/exists/list/kill`
  are one control request each. **Nothing above the seam changes.**
- **Foreground reporting (N1).** Daemon periodically (or on output-idle
  transition) calls `tcgetpgrp(master_fd)`, compares to the shell's pgid, and
  resolves the leader's `comm`. It pushes `foreground:<handle>` events the app
  forwards to the frontend as a Tauri event, mirroring `terminal_output`. The
  frontend's title logic consumes it: leader == shell → revert; else → optional
  program-name title. Polling cadence ~500ms–1s, only while attached.
- **Buffer persistence unchanged.** SerializeAddon → `terminal_buffer.rs` blob
  store stays exactly as is. The daemon could _optionally_ keep a small
  server-side output ring buffer to replace the client-side replay hacks
  (`stripLeadingAltEnter`) — nice-to-have, not required for parity.

### Reuse / prior art

- `portable_pty` already underpins the current backend; reuse it in the daemon
  for cross-platform PTY + spawn.
- The detach/persist/reattach model is well-trodden (dtach, abduco, tmux,
  VS Code's pty-host, Zellij). We can study dtach (tiny, ~single-file, BSD) as
  the minimal reference for the socket + PTY relay, and VS Code's pty-host for
  the foreground/cwd reporting protocol shape.

### Monorepo location

The **daemon** lives in its own Rust crate, **`crates/pty-host`**, under a root
Cargo workspace (`[workspace] members = ["apps/desktop/src-tauri", "crates/*"]`).
It has no Tauri/UI coupling — pure PTY ownership + socket protocol + foreground/cwd
reporting — so it builds and (critically, given the High-risk persistence logic)
**tests standalone**. The **client** (`SessionHostBackend: SessionBackend`) stays
in `apps/desktop/src-tauri/src/commands/` beside today's `AbducoBackend`, since it's
Tauri-coupled glue. This crate boundary is correct regardless of the packaging
open question below (a separate binary = the crate gets a `[[bin]]`; a self-fork
subcommand = `silo_lib` depends on the crate and dispatches into it). The monorepo
layout **reserves** `crates/` for this. (A later
`crates/pty-host-protocol` for shared client/daemon types is possible but not worth
it until the client needs to share types.)

---

## Risks

| Risk                                                                                                                                         | Severity | Mitigation                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Reimplementing persistence correctly** — detached daemon, reattach, orphan reaping. This is the real cost; subtle bugs lose user sessions. | **High** | Keep `SessionBackend` seam; ship `SessionHostBackend` behind `active_backend()` and dogfood with abduco as fallback before flipping the default. Heavy reconciliation tests (P6). |
| **Daemon lifecycle edge cases** — crash, zombie, stale socket, version skew between app and a daemon from an older build.                    | High     | Version handshake on connect; stale-socket detection + respawn; daemon self-exits when its session table empties for N minutes.                                                   |
| **Cross-platform PTY** — macOS vs Linux differences (and Windows later via ConPTY).                                                          | Med      | Lean on `portable_pty`; scope v1 to macOS + Linux, Windows explicitly out.                                                                                                        |
| **Security/permissions** — a local socket that spawns shells is a capability. Another local user/process must not attach.                    | Med      | Socket in user-private dir, `0700`; verify peer uid (`SO_PEERCRED`/`LOCAL_PEERCRED`); no network surface.                                                                         |
| **Reattach redraw correctness** — matching today's behavior without the alt-screen-strip hack.                                               | Med      | Optional server-side ring buffer; otherwise preserve existing client replay. Verify with `verify-gui` against claude/vim.                                                         |
| **Scope creep** — N1/N2/cwd are tempting; persistence parity must land first.                                                                | Med      | Phase it (below). Parity is the gate; capabilities are phase 3.                                                                                                                   |
| **Daemon survives uninstall / leaks across updates**                                                                                         | Low      | Handle in socket path keyed to app identity (Silo vs Silo Dev); shutdown command; idle self-exit.                                                                                 |

---

## Advantages

- **Zero external dependency** — no `brew install abduco`; bundled/in-process.
- **A protocol we own** — liveness, kill, resize become typed requests, not
  CLI string-scraping.
- **Foreground awareness (N1)** — tab-title revert + VS Code-style program
  names, **for every shell**, no zsh/bash/fish injection. Directly answers the
  "limited impact" concern that shelved the shell-integration approach.
- **cwd awareness (N2)** — reveal-in-files, new-terminal-here, better titles.
- **Cleaner reattach** — option to drop the `stripLeadingAltEnter` workaround.
- **Portability path** — owning the host is the only route to Windows (ConPTY)
  terminals later.

---

## Phasing

1. **Phase 0 — spike (no committed product code). ✅ DONE (2026-06-08).** Prove the
   daemon: forkpty + detached survival + reattach over a socket, on macOS. Confirm
   `tcgetpgrp(master)` reports the real foreground group (the thing we _couldn't_
   verify through abduco). De-risks the two hardest unknowns cheaply.
   _Validated in a standalone throwaway project (`pty-host-spike`, a ~few-hundred-line
   `libc::forkpty` daemon + socket client). Both proofs passed manually on macOS:
   detached survival / terminal-close survival / reattach / resize / mid-program
   force-kill, and the foreground flip (shell → `vim` → shell) via
   `tcgetpgrp(real master)`. The keystone fd-access risk is cleared. Open questions
   it informed (transport, ring buffer, foreground cadence, `portable_pty` vs `libc`,
   Linux gaps) are captured in the spike's README and carried into Phase 1._
2. **Phase 1 — parity. ✅ DONE.** `SessionHostBackend` (`crates/pty-host` +
   `commands/session_host.rs`) implementing P1–P8 behind `active_backend()`, with
   abduco kept as the default during dogfooding. Hardening: per-session daemon
   logfile, `T_HELLO` version handshake, `getpeereid` peer-uid check,
   reconciliation (`discovery`), dev/prod socket namespacing keyed on the bundle
   identifier, and SESSION_GONE on an incompatible leftover daemon. The
   release-bundle gate passed (GUI-launch shell env, reattach, prod isolation).
3. **Phase 2 — flip the default. ✅ DONE.** `active_backend()` now returns the
   session host as the **sole** backend. We **removed abduco outright** — the
   `AbducoBackend`, `find_abduco()`, the frontend `stripLeadingAltEnter`
   alt-screen workaround, and the `brew install abduco` dependency — rather than
   keeping a one-release fallback; the gate + dogfooding gave the confidence to go
   clean. (Windows has no backend yet; terminals are Unix-only — see Phase 3 /
   future ConPTY work.)
4. **Phase 3 — new capabilities.** N1 (foreground events) → tab-title revert +
   program-name titles: **✅ DONE.** The daemon polls `tcgetpgrp` and pushes
   foreground changes to subscribers; the host forwards them as
   `terminal_foreground:<id>` events; the terminal consumes them via a core-only
   `onTerminalForeground` (internal barrel, not public SDK) to drop a stale title
   at a prompt (N1a) and show the running program's name (N1b). **N2 (cwd
   reporting)** — reveal-in-files / new-terminal-here / cwd-in-titles — remains to
   build.

---

## Open questions

- **Transport:** one multiplexed data socket vs one socket per attached session?
  (Per-session is simpler to reason about; multiplexed is fewer fds.)
- **Daemon packaging:** separate bundled binary vs a `--session-host` subcommand
  of the main app binary (self-fork). The latter avoids shipping a second
  artifact. (Either way the daemon's code lives in `crates/pty-host` — see
  [Monorepo location](#monorepo-location); only the build target / dispatch differs.)
- **Ring buffer:** does the daemon keep server-side scrollback (enabling true
  reattach without client replay), or do we keep the SerializeAddon blob model
  and leave the daemon stateless beyond the live PTY?
- **Foreground cadence:** poll interval vs event-driven (e.g. only re-check on
  output-activity edges) — balance latency of title revert against idle CPU.
- **Windows:** ConPTY has no detached-survival primitive like a Unix daemon
  holding a pty. Out of scope for v1; note it shapes the protocol so we don't
  paint ourselves in.

---

## References (current code)

- `src-tauri/src/commands/session_backend.rs` — the `SessionBackend` seam +
  `AbducoBackend` (the impl to replace) + `active_backend()` (the one-line swap).
- `src-tauri/src/commands/session_registry.rs` — opaque `sessionId → handle`
  persistence (kept).
- `src-tauri/src/commands/terminal_buffer.rs` — SerializeAddon blob store, screen
  revive (kept, backend-agnostic).
- `src-tauri/src/commands/terminal_io.rs` — PTY reader loop → `terminal_output`
  events (kept).
- `src-tauri/src/commands/terminal.rs` — Tauri commands over the seam (kept).
- `src/extensions/core/terminal/TerminalPanel.tsx` — frontend: attach, buffer
  save/restore, and the **title-resolution** effect that will consume N1.
- [ADR 0011](../decisions/0011-editor-and-terminal-are-core.md) — the `ctx.terminals`
  core-service work (orthogonal boundary cleanup; not this).
