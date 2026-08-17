---
status: draft
created: 2026-08-16
---

# 0026. Terminal session-host backpressure — no UI freeze, bounded stalls, startup status

## Summary

Stop Silo from freezing the entire window when a session host (or PTY stdin)
stalls, bound those stalls so they become errors instead of multi-minute hangs,
and give the user **busy status** in the StatusBar (host-owned multi-writer
slot, proven with first-party consumers before any stable public API) plus
per-terminal feedback when a session can't accept input. This is the holistic
follow-on to the freeze diagnosed as main-thread `terminal_write` blocked in
`UnixStream::write` (sync Tauri IPC + daemon accept/PTY backpressure).

## Motivation

### What users see

After launching or restarting Silo (dev or production), the window paints, then
becomes unresponsive for seconds to minutes with **no spinner, no status, no
CPU burn** — it looks dead. Force-quit + relaunch sometimes clears it; sometimes
it freezes again. The session hosts are designed to outlive the app, so a wedged
host/PTY can survive "restart Silo."

### What is actually wrong (stacked bugs)

1. **App / UI thread (symptom amplifier).** `terminal_write` is a synchronous
   Tauri command. It runs on the AppKit main thread and does an unbounded
   blocking write to the session-host Unix socket. Any backpressure freezes
   painting, input, and every other invoke. JS often fire-and-forgets the
   invoke (`sendInput`), so the webview is not "awaiting" — the **UI thread**
   is.
2. **Daemon accept path.** On attach, the host writes up to `RING_CAP`
   (256 KiB) of scrollback as one frame **before** spawning the thread that
   reads client→daemon input. During that window, `terminal_write` cannot be
   drained. Startup attach storms + xterm auto-replies to replayed/restored
   sequences make this fire without the user typing.
3. **Daemon PTY write.** Client `T_DATA` is forwarded with a blocking
   `write(2)` to the PTY master. If the child is not reading stdin (full TTY
   input queue), the host reader blocks; the socket stops draining; the app
   blocks again. This state survives app restart.
4. **Amplifier.** Master→client broadcast holds the global `clients` mutex
   across blocking socket writes. Leaked / idle dead clients (reattach churn)
   make attach and output pathologically slow.

A writer thread alone fixes (1) for the UI, but leaves (2)–(4) as "terminal
looks fine but input vanishes" and can still stall sync `terminal_attach` on
the main thread. Feedback is impossible while the UI thread is inside
`write`.

### Confirmed repro

See [Verification / consistent repro](#verification--consistent-repro) below.
The harness is `apps/desktop/scripts/repro-terminal-ui-freeze.sh`.

## Verification / consistent repro

Natural freezes (restart storms, full ring, full PTY stdin) are timing-dependent.
For **before/after verification of Phase 1** we induce the same backpressure
deterministically: stop the session host so it cannot drain the Unix socket,
then push a large write through the real `terminal_write` path.

### Signature (what “frozen” means)

| Probe                                                           | Meaning                                                                 |
| --------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `ping` still returns `pong`                                     | Automation HTTP server is on a **background** thread — process is alive |
| `eval` times out (~3 s)                                         | **UI / AppKit main thread** is wedged (cannot run webview JS)           |
| `sample <app_pid>` shows `terminal_write` → `UnixStream::write` | Confirms the stall is the sync write, not a JS loop                     |

After Phase 1: under the same stall, `eval` must still succeed (UI responsive).
Writes may error, queue, or hang on a worker thread — that is fine for Phase 1
exit criteria.

### Harness (preferred)

Requires Silo Dev with automation (`pnpm dev`, bridge on `127.0.0.1:7878`).

```bash
# Watch it yourself — UI paints, then freezes; hold so you can poke at it
./apps/desktop/scripts/repro-terminal-ui-freeze.sh visual

# Before any fix — must print VERDICT: FROZEN and exit 0 (no countdown)
./apps/desktop/scripts/repro-terminal-ui-freeze.sh before

# After Phase 1 — must print VERDICT: RESPONSIVE and exit 0
./apps/desktop/scripts/repro-terminal-ui-freeze.sh after

# Report only (no pass/fail expectation)
./apps/desktop/scripts/repro-terminal-ui-freeze.sh detect
```

`visual` soft-closes the sandbox workspace, countdowns (`COUNTDOWN_SEC`,
default 8) so you can focus Silo Dev, re-activates with the session host
stopped, then writes — so the window is on screen before it wedges. It holds
the freeze (`HOLD_SEC`, default 20; Enter unfreezes early).

**Recovery uses `SIGKILL` on the session host, not `SIGCONT`.** Continuing a
stopped host flushes the large pending write into the live shell; the shell
echoes it and floods `terminal_output` into the webview — a second lockup that
looks like the original freeze even though the Rust main thread is idle. Killing
the host makes the blocked write fail (EPIPE) with nothing delivered to the PTY.

What `before` / `after` / `detect` do every run:

1. Opens a throwaway sandbox workspace + terminal (never touches real workspaces).
2. Force-spawns the PTY via `sendText`, resolves `sessionId` → handle → host PID.
3. Baseline: `ping` + `eval` succeed.
4. `kill -STOP` the session-host (socket no longer drained).
5. Background `sendText` with a 256 KiB payload (fills the send buffer).
6. Concurrently: `ping` (expect ok) and `eval` with a short timeout (freeze ⇒ timeout).
7. Optionally `sample`s the app for `terminal_write` when frozen.
8. `kill -CONT` the host, deletes the sandbox workspace, never leaves a stopped host.

**Before/after ritual:** run `before` on current `main` (or pre-fix branch) and
keep the log; land Phase 1; run `after` on the fix branch. Same machine, same
`pnpm dev` identity, same script — only the binary under test changes.

### Manual UI check (optional, same mechanism)

If you want to _see_ the window freeze rather than trust `eval`:

1. Focus a terminal in Silo Dev.
2. From a shell: `ps aux | grep 'session-host silo-'` → note the PID for that tab’s handle (`silo-` + first 8 of `sessionId`).
3. `kill -STOP <pid>` then paste a large clipboard into the terminal (or hold a key).
4. Window stops accepting input/repaint; traffic lights may still redraw via the OS.
5. `kill -CONT <pid>` → recovers.

Prefer the script for verification — it is objective and cleans up.

### Durable attach / restart trace (dogfood)

After a cold UI restart (or any “terminals look wrong” report), do **not** rely
on Output alone — the webview buffer is gone. Grep the durable log:

```bash
# Dev identity
rg 'app_boot|ui_|host_attach|host_incompatible|attach_gone|host_create' \
  ~/Library/Application\ Support/com.silo.desktop.dev/logs/terminal.log | tail -80
```

| Event                              | Source                   | Meaning                                                 |
| ---------------------------------- | ------------------------ | ------------------------------------------------------- |
| `app_boot`                         | Rust UI process          | `pid`, `proto`, bundle `identifier`                     |
| `ui_attach_start` / `ui_attach_ok` | `logTerminalAttachTrace` | Panel reattach path                                     |
| `ui_spawn_start` / `ui_spawn_ok`   | same                     | New shell (empty `sessionId` or recreate)               |
| `ui_init_miss`                     | same                     | “Terminal record not found” (active vs owner workspace) |
| `ui_attach_gone` / `ui_recreate`   | same (+ client)          | `SESSION_GONE` → clear `sessionId` / spawn              |
| `ui_attach_fail`                   | same                     | Non-404 attach error                                    |
| `host_attach` / `attach`           | Rust                     | Daemon connect succeeded                                |
| `host_incompatible`                | Rust                     | HELLO proto mismatch (often surfaces as gone)           |

Healthy restart: `app_boot` → `ui_attach_start` → `host_attach`/`attach` →
`ui_attach_ok`. Trouble: `ui_init_miss`, or `ui_attach_gone`→`ui_recreate`→
`ui_spawn_*` when attach was expected. Per-host daemon lines live under
`$TMPDIR/silo-pty/<ns>/silo-<handle>.log` (`client attached` / `detached`).

Implementation: `terminal-attach-trace.ts`, `terminal_diag_log`, `log_event` →
`terminal.log`. Live mirror: Output → **Terminals** (`silo:terminals`).

### What this does _not_ cover yet

| Scenario                              | Covered by SIGSTOP harness?                                        | When         |
| ------------------------------------- | ------------------------------------------------------------------ | ------------ |
| Phase 1 UI freeze (main-thread write) | **Yes**                                                            | Now          |
| Phase 2 attach/ring ordering          | No (needs a peer that accepts but delays replay, or a test double) | With Phase 2 |
| Phase 2 PTY stdin full                | No (needs a child that never reads stdin + large paste)            | With Phase 2 |
| Phase 3 status phrase                 | No (visual / StatusItem assert)                                    | With Phase 3 |

Phase 0 exit for this RFC: the Phase 1 harness above is checked in and
documented; Phase 2+ get their own recipes in follow-up commits on this doc.

## Design

### Goals

- The **window never wedges** on PTY/session-host I/O.
- Stalls become **bounded** (timeout → error / retry / reconnect), not
  unbounded sleeps.
- Startup (and other in-flight work) can show **busy status** in the StatusBar
  via a host-owned, multi-writer slot — not a one-off `StatusItem` per feature.
- A wedged session can tell the user **what** is wrong once the UI thread is
  free to paint.

### Non-goals (this RFC)

- Replacing the pty-host protocol or dropping ring replay.
- Graduating busy status to a **stable public** extension API on day one —
  prove it with bundled first-party consumers first (see below). Third-party
  extensions keep using `registerStatusItem` / toasts until we promote.
- Replacing RFC 0001’s full `ctx.ui.progress` (cancellable tasks, modal/notification
  locations). Busy status is the ambient StatusBar aggregate; progress may later
  _feed_ it or sit beside it.
- Windows ConPTY parity details beyond "same backpressure rules apply."

---

### Busy status (StatusBar) — shared slot, not “context”

**Do not call this “context.”** In Silo that word already means ExtensionContext,
context keys, and focus-region context. The product term is **busy status**
(glossary).

Today the only reusable primitive is `registerStatusItem` (drop a React widget
in the bar). Pending-remove worktree (ADR 0025) is a **one-off** StatusItem in
`silo.git-explorer` — explicitly deferred generalizing until a second consumer.
Terminal restore is that second consumer; we build the shared mechanism now
instead of a second private StatusItem.

#### Shape

Host owns **one** StatusBar slot in the informal status area (left side, toward
the spacer — after the workspace name, before extension chrome).

| Active entries | What the slot shows                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------- |
| 0              | Hidden                                                                                                              |
| 1              | That entry’s short label (optional spinner) — **no** badge                                                          |
| 2+             | Primary entry’s label **plus a trailing numbered badge** (the count of active entries). The whole slot is clickable |

**Click (when any entry is active; especially useful when N≥2):** open a **host
informational popover** anchored to the slot (not `showMenu` / not a blocking
modal) listing every active entry with spinner + label + optional detail.
Rows are not actionable — dismiss on outside click / Esc. Same stacking band as
toasts (below floating menus).

**Primary line when N≥2:** any `urgency: "high"` entry beats all `"normal"`;
within the same urgency, **most recently updated** wins.

**In-flight only.** Busy status is for work that is still happening. Terminals
that **failed** to restore (or other errors) use **`ctx.ui.notify`** (toast),
not a sticky busy-status row — same pattern as pending-remove’s failure toast
(ADR 0025). The busy-status entry clears when the in-flight cohort finishes;
failures are announced as notifications (with optional action if we add one
later, e.g. focus Output).

Writers do not render their own StatusBar widgets. They **push/update/clear
entries** in a host registry; the host renders the aggregate.

#### Entry contract (host-internal / unstable)

```ts
type BusyStatusUrgency = "normal" | "high";

type BusyStatusEntry = {
  /** Stable id for update/clear — namespaced by owner, e.g. `terminals.restore`. */
  id: string;
  /** Single-line StatusBar / popover title. */
  label: string;
  /** Optional second line / tooltip detail in the popover. */
  detail?: string;
  /**
   * Which summary line wins when several entries are active.
   * Default `"normal"`. `"high"` always outranks `"normal"`; within the same
   * tier, most-recently-updated wins.
   */
  urgency?: BusyStatusUrgency;
};

// Push or replace by id; returns Disposable that clears this id.
busyStatus.set(entry): Disposable
busyStatus.clear(id): void
```

No numeric priority — callers should not invent ranking scales. Guidance for
first-party writers:

| `urgency`          | Use when                                                                                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `normal` (default) | Ambient / expected background work — restore terminals, removing a worktree                                                                        |
| `high`             | User-blocking or surprising in-flight work we want on the summary line if anything else is also busy (rare for v1; leave unused until a real case) |

No `onAction` on busy-status entries for v1 — errors and follow-ups go through
notifications. The popover is informational (what’s in flight); click the slot
to see the full list when the badge shows N>1.

Naming in code: `busyStatus` (module / method), not `context` / `setContext`.

#### Visibility to extensions

| Audience                                    | Access                                                                                                                            |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Host (terminal restore, attach bookkeeping) | Direct registry import                                                                                                            |
| Bundled first-party (`core.*` / `silo.*`)   | Unstable `ctx.ui.busyStatus` (or equivalent) marked `@internal`, **omitted from public docs / roadmap stable table** until proven |
| Third-party                                 | **Not supported** until a follow-up RFC graduates the surface (likely alongside or into RFC 0001)                                 |

`silo.*` cannot import `@silo-code/extension-host/internal` (package graph). So
either the unstable `ctx.ui` method exists for builtins, or git pending-remove
stays on its private StatusItem until graduation. Prefer the unstable `ctx.ui`
hook so we can **migrate ADR 0025’s StatusItem onto busy status** in the same
effort and actually prove multi-writer (restore + pending-remove concurrently).

#### First consumers

1. **Terminal restore / reconnect** (this RFC) — `Restoring terminals…`, then
   failure summary `N terminals need reconnect`.
2. **Pending remove worktree** (ADR 0025) — migrate off
   `git-pending-worktree-remove` StatusItem onto the same slot.

Suggested restore copy:

| Phase                             | Where                                                                                     |
| --------------------------------- | ----------------------------------------------------------------------------------------- |
| Attach in flight                  | Busy status: `Restoring terminals…`                                                       |
| Wall-clock budget / still working | Busy status: `Still restoring terminals…` (or keep the first label)                       |
| Done, all ok                      | Clear busy-status entry                                                                   |
| Done, some failed                 | Clear busy-status entry **and** `ctx.ui.notify` error (e.g. `N terminals need reconnect`) |

**Caveat:** the slot can only update while the UI thread is free. **Phase 1 is
a prerequisite** for useful busy status during restore.

#### Settled product choices

1. **Primary line when N≥2:** `urgency: "high"` beats `"normal"`; same tier →
   most recently updated. API is a **normal/high flag**, not a numeric priority.
2. **Multiplicity:** trailing **numbered badge** with the active count (hidden
   when count is 1).
3. **Errors:** notifications (`ctx.ui.notify`), not sticky busy-status entries.

---

### Timeout budget (proposed starting points)

These are **product timeouts**, not kernel defaults. Tune with the SIGSTOP
repro + a full-ring attach stress test. Prefer failing a session over freezing
the app.

| Scope                                                                       | Soft                                 | Hard                          | On hard                                                                                              |
| --------------------------------------------------------------------------- | ------------------------------------ | ----------------------------- | ---------------------------------------------------------------------------------------------------- |
| Unix socket **write** (app→host or host→client)                             | —                                    | **1 s**                       | Error; writer thread surfaces backpressure; prune dead client on host                                |
| Per-session **attach handshake** (connect + HELLO + ring drain + reader up) | **2 s** (log / "slow")               | **5 s**                       | Fail that attach with typed error; tab shows reconnect; do not block other sessions                  |
| Per-session **input accept** (queued write not drained)                     | **500 ms** (status on that terminal) | **3 s**                       | Error to caller; chrome: "Session not accepting input"; offer Restart session                        |
| **PTY master write** inside host (`T_DATA` → master)                        | —                                    | **1 s** (or `EAGAIN` + queue) | Keep reading the socket; queue/drop with backpressure signal — never block the client-reader forever |
| Startup **cohort** (all sessions for the activating workspace)              | —                                    | **10 s** wall                 | Clear "Restoring…"; if any pending/failed → `N terminals need reconnect`                             |

Rationale:

- Local Unix sockets normally move 256 KiB in well under 100 ms; **5 s**
  attach is generous for "something is wrong" without matching the
  multi-minute freezes users hit today.
- **1 s** socket/PTY write matches "human notices lag" without false positives
  on a busy machine.
- **10 s** cohort keeps startup honest when many tabs restore in parallel;
  serial `5 s × N` would be worse than the bug.
- Soft **500 ms** input stall is what makes mid-session feedback feel live
  once writes are off the UI thread.

Open question for iteration: should attach hard timeout be **3 s** on warm
reattach (daemon already up) vs **5 s** on cold create? Start with one number
(5 s) unless metrics say otherwise.

---

### Sequenced implementation plan

Ship in order. Each phase is independently valuable and testable; later phases
assume earlier ones.

#### Phase 0 — Spec + repro harness (this doc + tests)

- [x] Deterministic Phase 1 harness:
      `apps/desktop/scripts/repro-terminal-ui-freeze.sh` (`before` / `after` /
      `detect`) — see [Verification](#verification--consistent-repro).
- [ ] Post–Phase 1: promote the responsive case into an integration test that
      fails if `eval` times out under SIGSTOP (CI gate).
- [ ] Phase 2+ recipes (ring ordering, PTY stdin full) added here when those
      phases start.
- Log channel: reuse or add `silo:terminals` / extend existing session-host
  logging for attach timing and backpressure events.

**Exit:** Phase 1 before/after ritual works on a running `pnpm dev`; timeout
table above agreed (or revised in this RFC).

#### Phase 1 — Never wedge the UI (app) — **highest priority**

1. [x] **Per-session writer thread** (or equivalent ordered queue owned off the
       main thread): `terminal_write` enqueues bytes and returns immediately;
       one thread per session owns the socket write + ordering.
2. [x] Mark `terminal_write` safe for the UI thread (sync command that only
       enqueues is fine; do **not** leave blocking `write_all` on the invoke
       path).
3. Apply the same rule to any other sync command that can block on the
   session socket (`terminal_attach` wait paths, `terminal_resize` if it can
   stall, kill's "wait until socket gone" loop — move waits off-main or make
   async).
4. [x] Bounded queue + `set_write_timeout` / write deadline (**1 s**) so a stall
       becomes an error the writer thread records, not an eternal sleep.
5. Surface queue depth / last write error into host state the frontend can
   read (for Phase 3 chrome). — `last_write_error` recorded in-session; not
   yet exposed to JS.

**Exit:** SIGSTOP repro — window stays interactive; `eval` works; writes
fail or queue with visible state instead of freezing.

**User-visible:** still may not show rich status yet; may silently drop or
error writes — acceptable if the app remains usable and Output logs the
failure.

#### Phase 2 — Bound stalls in the session host (daemon)

1. [x] **Spawn the client input reader before ring replay** (or otherwise ensure
       client→daemon is always being read while replay runs).
2. [x] Chunk ring replay; every socket write uses the **1 s** deadline; failed
       clients are pruned.
3. [x] Replace blocking `libc::write(master, …)` with non-blocking / timed writes
   - a small input queue; never park the client-reader forever on a full
     stdin queue. (Windows: dedicated ConPTY writer thread + bounded
     `sync_channel` / `try_send`.)
4. [x] **Do not hold `clients` across blocking writes** — snapshot the list,
       write outside the lock, prune failures.
5. [x] Cap clients per session (data + foreground subscribe); on reattach,
       close the previous data connection so fds cannot climb indefinitely.
       **Note:** classify `T_SUBSCRIBE_FG` sockets _before_ they join the data
       list — Silo opens a second socket for fg events; treating it as data under
       a cap of 1 evicted the live data client on every restore (visible as
       `10;rgb:…` / OSC color-query garbage in the shell).

**Exit:** full-ring reattach under SIGSTOP-style peer stall fails the
session within the attach budget; host remains responsive to other clients;
leaked client count stays flat across app restart storms.

#### Phase 3 — Busy status + per-terminal feedback

Depends on Phase 1 (UI can paint during restore/stalls).

1. [x] **Host busy-status registry + StatusBar slot + popover** (internal /
       `@internal` `ctx.ui.busyStatus` for builtins — not a stable public API).
       DEV scratch panel: **Window → Busy Status Test** (`core.busy-status-test`).
2. [x] **Terminal restore** as first writer (`Restoring terminals…` → clear on
       settle; failures via **notify**, not sticky status). During **cold start**,
       the host **startup status** sequence owns the StatusBar line; terminal
       restore feeds that cohort instead of a second entry.
3. [x] **Migrate pending-remove worktree** (ADR 0025) onto the same slot — proves
       multi-writer (restore + remove overlapping). Badge shows `2` when both run.
       3b. [x] **Startup status** — host-owned sequence: Starting / Loading workspaces /
       Loading extensions / Restoring workspace / Restoring terminals (busy status)
       → brief host **status flash** “Silo is ready” (not busy status; not a toast).
       Busy status stays in-flight-only; `flashStatus` is host-internal.
4. Per-terminal chrome when input soft/hard timeouts fire (tab adornment or
   in-panel banner): e.g. `Session not accepting input` with **Reconnect** /
   **Restart session**.
5. Optional: defer wiring xterm `onData` → `session.write` until attach
   handshake reports ready (defense in depth).

**Exit:** cold start shows busy status (and shares the slot correctly if a
worktree remove is also running); never freezes; lands on clear or actionable
reconnect within ~10 s; pending-remove no longer uses a private StatusItem.

#### Phase 4 — Polish / observability (as needed)

- Metrics or Output summaries: attach p50/p99, write-timeout counts, client
  cap hits.
- Consider warm vs cold attach timeout split if Phase 0/1 data warrants it.
- Windows ConPTY path: same deadlines and off-UI-thread rules (daemon-side
  deadlines landed with Phase 2 in `session_windows.rs`; app write-path
  parity was Phase 1).
- If the busy-status interface held up: draft graduation RFC (or extend
  RFC 0001) before exposing to third parties.

---

### Alternatives considered

| Option                                                        | Why not (as the whole fix)                                                                                                                                                                    |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Only `#[tauri::command(async)]` on `terminal_write`           | Moves work off the main thread but concurrent invokes can interleave without a per-session writer; still no daemon bounds or UX. Acceptable as a **temporary** mitigation, not the end state. |
| Only `set_write_timeout` on the existing sync command         | Turns freeze into a thrown error on the UI thread invoke path — better than forever, still janky; no startup status; daemon can still stall attach.                                           |
| Kill all session hosts on app quit                            | Breaks the product promise of persistent sessions (RFC 0010); paper over the bug.                                                                                                             |
| One-off `StatusItem` for terminal restore (like ADR 0025)     | Works, but a second private StatusItem is exactly what ADR 0025 said to avoid — build the shared busy-status slot instead.                                                                    |
| Ship stable public `ctx.ui.progress` / busy status on day one | Rejected for now: prove the aggregate UX with bundled consumers first; graduate later.                                                                                                        |
| Call it “context” in the StatusBar                            | Rejected: overloaded with ExtensionContext / context keys / focus context.                                                                                                                    |
| Bigger ring / no ring replay                                  | Avoids some accept-path pressure but loses reattach UX; doesn't fix PTY stdin or UI-thread writes.                                                                                            |

### Decision

_Filled when this leaves `draft`._
