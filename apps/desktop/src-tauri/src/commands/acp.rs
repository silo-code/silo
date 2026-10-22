//! **Spike (RFC 0038 exploration) — not a shipped surface.** A long-lived
//! child process with *piped* stdio, speaking newline-delimited JSON-RPC: the
//! transport the Agent Client Protocol needs and that nothing in Silo currently
//! provides. See `docs/acp-recon.md` for why this exists and what the probes
//! against real agents found.
//!
//! ## Why this can't reuse anything already here
//!
//! - `session_host` / `terminal.rs` give a **PTY**. A PTY echoes what you write,
//!   applies line discipline, and rewrites bytes at canonical-mode boundaries.
//!   JSON-RPC over one appears to work on small frames and silently corrupts
//!   large ones — the exact failure class RFC 0033 phase 3 exists to avoid.
//! - `process_exec` is **one-shot and buffered**: it waits for the child to exit
//!   and hands back the whole of stdout. An agent connection is duplex and lives
//!   for the length of a conversation.
//!
//! ## The two things this module claims
//!
//! 1. **The host owns framing.** Readers deliver whole lines, so a consumer
//!    never sees half a JSON-RPC frame. `spawn_roundtrip_large_frame` proves
//!    this holds for a payload far larger than a pipe buffer, which is the case
//!    a naive implementation gets wrong.
//! 2. **stderr is captured, not discarded.** Agents die before `initialize`
//!    routinely (missing `node`, a bad auth state, a vendor deprecation — see
//!    the recon doc's Gemini finding). stderr is the only place that says why,
//!    so a bounded ring of it is kept and handed back on exit. Zed keeps the
//!    same buffer for the same reason.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicI32, AtomicI64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, OnceLock, PoisonError};
use std::time::Duration;

use serde::Serialize;

/// How many trailing stderr lines to keep per connection. Enough to carry a
/// stack trace or a vendor error message; bounded so a chatty agent (both
/// probed agents log routine timing to stderr) can't grow without limit.
const STDERR_RING: usize = 200;

/// Reported when a child is terminated by a signal, matching `ExecResult`'s
/// convention in `process.rs` rather than inventing a second one.
const EXIT_SIGNALLED: i32 = -1;

/// How long a graceful `close` gives the process group to act on SIGTERM
/// before escalating to SIGKILL. Matches `process.rs`'s `process_exec_kill`.
const KILL_GRACE: Duration = Duration::from_secs(2);

/// How long `acp_close` blocks waiting for the signalled group to actually be
/// gone before giving up and leaving it to the `KILL_GRACE` escalation.
///
/// Why block at all: a caller that awaits `acp_close` and immediately spawns
/// a new connection would otherwise race the old process, which may still
/// hold a lock on the agent CLI's config directory and its session store.
/// Mirrors `session_host.rs`'s `KILL_TIMEOUT`, for the same reason and with
/// the same bounded-best-effort contract — a cooperative agent is gone in
/// tens of milliseconds, and an uncooperative one must not hang a tab close.
const CLOSE_WAIT: Duration = Duration::from_millis(1000);

/// Poll interval for both waits above. Matches `session_host.rs`'s kill poll.
const EXIT_POLL: Duration = Duration::from_millis(20);

/// Lock a mutex, ignoring poisoning.
///
/// Every mutex in this module guards data that stays structurally valid
/// across a panic — an `Option<ChildStdin>`, a bounded `Vec<String>`, the
/// registry map — so there is nothing for poisoning to protect. What it would
/// cost is real: `close_all` runs inside `RunEvent::Exit` as the last chance
/// to reap the agent children, and a `lock().unwrap()` panicking there would
/// leak every connection after the one that panicked, which is precisely the
/// orphan class this module exists to prevent.
fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(PoisonError::into_inner)
}

/// The child's process group id, but **only** when the child is that group's
/// own leader — which is what `spawn`'s `process_group(0)` arranges, making
/// `pgid == pid`.
///
/// Verified rather than assumed, because the consequence of being wrong is
/// severe in both directions: `killpg` is now the only thing that reaches a
/// grandchild, and a pid that is *not* a group leader names some **other**
/// process's group, so a `killpg` aimed at it would signal unrelated
/// processes. `None` therefore means "signal the pid only" — exactly the
/// pre-fix behaviour, never worse than it.
///
/// `getpgid` failing (`ESRCH`) means the child was reaped between `spawn` and
/// here; there is nothing left to group-kill in that case either.
fn own_process_group(pid: u32) -> Option<i32> {
    #[cfg(unix)]
    {
        let pid = pid as i32;
        (unsafe { libc::getpgid(pid) } == pid).then_some(pid)
    }
    #[cfg(not(unix))]
    {
        let _ = pid;
        None
    }
}

/// What a connection reports once its stdout reaches EOF.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AcpExit {
    /// Exit code, or -1 if terminated by a signal.
    pub code: i32,
    /// The tail of stderr. The whole point: an agent that dies before it ever
    /// answers `initialize` explains itself only here.
    pub stderr: Vec<String>,
}

/// A live connection to an ACP agent subprocess.
///
/// Deliberately callback-shaped rather than Tauri-shaped so the transport can
/// be tested headlessly — the `#[tauri::command]` wrappers below are a thin
/// layer that turns the callbacks into `app.emit`. (The repo's testing
/// convention: extract the logic, test that, keep the shell trivial.)
pub struct AcpConnection {
    stdin: Arc<Mutex<Option<ChildStdin>>>,
    stderr: Arc<Mutex<Vec<String>>>,
    pid: u32,
    /// The process group to signal, when this child leads one. See
    /// {@link own_process_group}.
    pgid: Option<i32>,
    /// Flipped by the stdout reaper thread the moment `wait` returns, i.e.
    /// the moment the child is really gone and its pid is free for the OS to
    /// recycle. Two jobs: it stops the delayed SIGKILL from firing at a
    /// *recycled* process group, and it is what `close`'s grace period and
    /// `acp_close`'s bounded wait poll.
    exited: Arc<AtomicBool>,
    /// Set by `close`/`close_now`. A closing connection stays in the registry
    /// until its process is actually gone (see `acp_close`), so this is how
    /// `has_live_connections` tells "a tab the user still has open" from "a
    /// tab they closed, mid-teardown".
    closing: AtomicBool,
}

impl AcpConnection {
    /// Spawn `command` with all three streams piped and start the reader
    /// threads.
    ///
    /// `on_line` receives one **whole** stdout line per call, `\n` stripped.
    /// `on_exit` fires exactly once, when stdout reaches EOF, carrying the exit
    /// code and the trailing stderr.
    pub fn spawn(
        command: &str,
        args: &[String],
        cwd: Option<&str>,
        env: &HashMap<String, String>,
        on_line: impl Fn(String) + Send + 'static,
        on_stderr: impl Fn(String) + Send + 'static,
        on_exit: impl FnOnce(AcpExit) + Send + 'static,
    ) -> Result<Self, String> {
        let mut cmd = Command::new(command);
        cmd.args(args)
            .envs(env)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        if let Some(dir) = cwd {
            cmd.current_dir(dir);
        }
        // On Windows a GUI (windows-subsystem) app spawning a console program
        // allocates a fresh console window for it. An ACP agent's console would
        // otherwise stay visible for the life of the chat; suppress it, matching
        // every other Windows spawn site in this crate (process.rs, fs.rs,
        // session_windows.rs). No effect on the piped stdio streams.
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }
        // Give the child its own process group (same pattern as `process.rs`'s
        // `process_exec`) so `close`/`close_now` can reach what IT spawns, not
        // just it. An agent launched via `npx` (`codex`, `pi`) forks a `node`
        // child; `cursor-agent` bundles its own node runtime as a child. A
        // plain `Child::kill()` only ever signals the top-level pid, so that
        // grandchild survived every close/quit, orphaned under `PPID 1`
        // (confirmed live, 2026-09-xx restart-fidelity recon). A child inherits
        // its parent's pgid unless it explicitly detaches (`setsid`), so
        // `killpg(this_pid, _)` reaches the whole tree in the common case.
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            cmd.process_group(0);
        }

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("failed to spawn {command}: {e}"))?;

        let pid = child.id();
        let stdout = child.stdout.take().ok_or("no stdout pipe")?;
        let stderr_pipe = child.stderr.take().ok_or("no stderr pipe")?;
        let stdin = child.stdin.take().ok_or("no stdin pipe")?;

        let stderr_ring: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
        let exited = Arc::new(AtomicBool::new(false));

        // stderr on its own thread. It must not share the stdout thread: a
        // child that fills the stderr pipe while we are blocked reading stdout
        // deadlocks, and an agent that writes only to stderr before dying would
        // otherwise never be heard at all.
        {
            let ring = Arc::clone(&stderr_ring);
            std::thread::spawn(move || {
                for line in BufReader::new(stderr_pipe).lines().map_while(Result::ok) {
                    {
                        let mut r = lock(&ring);
                        if r.len() == STDERR_RING {
                            r.remove(0);
                        }
                        r.push(line.clone());
                    }
                    on_stderr(line);
                }
            });
        }

        // stdout: whole lines only. `BufReader::lines` is what makes the host
        // the owner of framing — it accumulates across `read` boundaries, so a
        // frame larger than the pipe buffer arrives in one piece.
        //
        // `child` moves into this thread wholesale — it is the only place
        // left that touches it. `close`/`close_now` signal the process group
        // directly (`killpg`, below) rather than going through `Child`, so no
        // second owner (and no `Arc<Mutex<_>>` to share one) is needed.
        {
            let ring = Arc::clone(&stderr_ring);
            let exited = Arc::clone(&exited);
            std::thread::spawn(move || {
                for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                    on_line(line);
                }
                // EOF. Reap so the exit code is real rather than inferred, and
                // give stderr's thread a moment to drain what the child wrote
                // on its way out — otherwise the most useful lines are missed
                // by a few milliseconds precisely when they matter most.
                std::thread::sleep(std::time::Duration::from_millis(50));
                let code = child
                    .wait()
                    .ok()
                    .and_then(|s| s.code())
                    .unwrap_or(EXIT_SIGNALLED);
                // Flip this before the callbacks, not after: `wait` reaping
                // the child is the instant its pid becomes available for the
                // OS to hand to someone else, and a `close` grace period may
                // be counting down on a SIGKILL aimed at that pid's group.
                // `on_exit` evicts the connection from the registry and can
                // run arbitrary host code, so it must not sit in between.
                exited.store(true, Ordering::SeqCst);
                let stderr = lock(&ring).clone();
                on_exit(AcpExit { code, stderr });
            });
        }

        Ok(AcpConnection {
            stdin: Arc::new(Mutex::new(Some(stdin))),
            stderr: stderr_ring,
            pid,
            pgid: own_process_group(pid),
            exited,
            closing: AtomicBool::new(false),
        })
    }

    /// Write one JSON-RPC frame. The newline is appended here so a caller can
    /// never forget it — a frame without its terminator wedges the agent's
    /// reader with no error anywhere.
    pub fn send(&self, message: &str) -> Result<(), String> {
        let mut guard = lock(&self.stdin);
        let stdin = guard.as_mut().ok_or("connection closed")?;
        stdin
            .write_all(message.as_bytes())
            .and_then(|_| stdin.write_all(b"\n"))
            .and_then(|_| stdin.flush())
            .map_err(|e| format!("write failed: {e}"))
    }

    /// Current trailing stderr without waiting for exit — for diagnosing a
    /// connection that came up but is not answering.
    pub fn stderr_tail(&self) -> Vec<String> {
        lock(&self.stderr).clone()
    }

    pub fn pid(&self) -> u32 {
        self.pid
    }

    /// Close stdin first, then kill gracefully: SIGTERM now, SIGKILL after
    /// {@link KILL_GRACE} if the child is still alive. Dropping stdin is how a
    /// well-behaved agent is asked to exit; the signal is the backstop for one
    /// that ignores it.
    ///
    /// The grace period is only sound here because the app keeps running
    /// afterward (`acp_close`, one Chat tab closing) — there is a future tick
    /// for the escalation to fire on. Two things make that safe rather than
    /// merely likely: the connection stays in the registry until its process
    /// is actually gone, so a quit landing inside the grace window still
    /// finds it (`close_all`); and the escalation polls {@link exited}, so it
    /// cannot fire at a pid the OS has already recycled. `close_now` is the
    /// app-exit counterpart.
    pub fn close(&self) {
        self.closing.store(true, Ordering::SeqCst);
        *lock(&self.stdin) = None;
        self.kill_group(false);
    }

    /// Immediate, ungraceful kill — no delayed escalation. Used only when the
    /// app is exiting right behind this call (`close_all`, reached from both
    /// `force_quit` and `RunEvent::Exit`): there is no guaranteed future tick
    /// left to run a deferred SIGKILL, and quitting must not stall on a grace
    /// period. Safe to call on a connection already mid-`close`.
    pub fn close_now(&self) {
        self.closing.store(true, Ordering::SeqCst);
        *lock(&self.stdin) = None;
        self.kill_group(true);
    }

    /// Whether `close`/`close_now` has been called — i.e. this connection is
    /// torn down from the user's point of view even if its process is still
    /// on its way out. See `has_live_connections`.
    pub fn is_closing(&self) -> bool {
        self.closing.load(Ordering::SeqCst)
    }

    /// Whether the child has been reaped. Only true once the stdout reaper
    /// thread's `wait` has returned, so it means "really gone", not "signalled".
    pub fn has_exited(&self) -> bool {
        self.exited.load(Ordering::SeqCst)
    }

    /// Block up to `timeout` for the child to actually exit. Returns whether
    /// it did. Polls rather than joining the reaper thread so a caller is
    /// never held hostage by an agent that refuses to die.
    pub fn wait_for_exit(&self, timeout: Duration) -> bool {
        poll_exited(&self.exited, timeout)
    }

    /// Signal this connection's whole process group — not just its own pid —
    /// so a grandchild an `npx`-launched or bundled-runtime agent forked dies
    /// with it (`spawn`'s `process_group(0)` is what makes that possible: the
    /// pid and the pgid are the same process). Mirrors `process.rs`'s
    /// `process_exec_kill` / `process_kill_group`.
    #[cfg(unix)]
    fn kill_group(&self, immediate: bool) {
        let pid = self.pid as i32;
        let pgid = self.pgid;
        signal_tree(pid, pgid, if immediate { libc::SIGKILL } else { libc::SIGTERM });
        if immediate {
            return;
        }
        // Escalation, not a timer: it polls `exited` and bails the moment the
        // child is reaped. A bare `sleep(KILL_GRACE)` then `killpg` would fire
        // unconditionally at the deadline, and a pid freed early in that
        // window can be recycled — on macOS pids wrap at 99998, and any shell
        // job is a process-group leader — so the stale SIGKILL could land on
        // an unrelated process group.
        let exited = Arc::clone(&self.exited);
        tauri::async_runtime::spawn(async move {
            tauri::async_runtime::spawn_blocking(move || {
                if !poll_exited(&exited, KILL_GRACE) {
                    signal_tree(pid, pgid, libc::SIGKILL);
                }
            })
            .await
            .ok();
        });
    }

    /// Windows has no process-group signal; `taskkill /T` walks the process
    /// tree by parent-child relationship instead, which Windows already
    /// tracks natively — no spawn-time flag needed (unlike Unix). Already
    /// forceful and immediate, so both `close` and `close_now` share it.
    #[cfg(windows)]
    fn kill_group(&self, _immediate: bool) {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let _ = Command::new("taskkill")
            .args(["/F", "/T", "/PID", &self.pid.to_string()])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
    }
}

/// Poll `exited` until it is set or `timeout` elapses; returns whether it was
/// set. Shared by `close`'s SIGKILL escalation and `acp_close`'s bounded wait.
fn poll_exited(exited: &AtomicBool, timeout: Duration) -> bool {
    let deadline = std::time::Instant::now() + timeout;
    loop {
        if exited.load(Ordering::SeqCst) {
            return true;
        }
        if std::time::Instant::now() >= deadline {
            return false;
        }
        std::thread::sleep(EXIT_POLL);
    }
}

/// Signal the child and, when it leads one, its whole process group.
///
/// `killpg` is the part this fix exists for — it is what reaches the `node`
/// grandchild an `npx`-launched agent forks. The direct `kill` is insurance:
/// `Child::kill()` is gone (the handle lives in the reaper thread now), so
/// without it a `pgid` of `None` would mean *nothing* dies — strictly worse
/// than the code this replaced, which at least always got the direct child.
/// Signalling the leader twice in the common case is harmless.
#[cfg(unix)]
fn signal_tree(pid: i32, pgid: Option<i32>, sig: i32) {
    unsafe {
        if let Some(pgid) = pgid {
            libc::killpg(pgid, sig);
        }
        libc::kill(pid, sig);
    }
}

// ---------------------------------------------------------------------------
// Tauri surface — deliberately thin.
// ---------------------------------------------------------------------------

fn registry() -> &'static Mutex<HashMap<String, Arc<AcpConnection>>> {
    static R: OnceLock<Mutex<HashMap<String, Arc<AcpConnection>>>> = OnceLock::new();
    R.get_or_init(|| Mutex::new(HashMap::new()))
}

fn next_connection_id() -> String {
    static N: AtomicI64 = AtomicI64::new(0);
    format!("acp{}", N.fetch_add(1, Ordering::Relaxed))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AcpSpawnResult {
    pub connection_id: String,
    pub pid: u32,
    /// Effective values of the variables the caller asked about in
    /// `report_env` — the explicit override when one was passed, otherwise
    /// whatever this process inherited. Absent variables are omitted.
    ///
    /// An agent CLI reads its config directory (and with it, its *session
    /// store*) from an env var, so which store a Chat session lands in is
    /// decided by the environment Silo itself was launched from. Silo records
    /// what the child actually got, so a later restore can spawn against the
    /// same store instead of silently looking in a different one.
    pub env_report: HashMap<String, String>,
}

/// Spawn an ACP agent. Emits `acp_message:<id>` per stdout line,
/// `acp_stderr:<id>` per stderr line, and `acp_closed:<id>` once with
/// {@link AcpExit}.
#[tauri::command]
pub async fn acp_spawn(
    app: tauri::AppHandle,
    command: String,
    args: Vec<String>,
    cwd: Option<String>,
    env: Option<HashMap<String, String>>,
    report_env: Option<Vec<String>>,
) -> Result<AcpSpawnResult, String> {
    use tauri::Emitter;

    let id = next_connection_id();
    let mut env = env.unwrap_or_default();

    // Resolve the agent binary against the *user's* PATH, not the one this
    // process inherited. A Finder-launched app gets launchd's
    // `/usr/bin:/bin:/usr/sbin:/sbin`, where no agent CLI lives — Homebrew,
    // nvm and `~/.local/bin` are all missing — so every Chat session died with
    // `failed to spawn npx: No such file or directory`, while the same build
    // started from a terminal worked. Terminals never saw it because a PTY
    // session runs a login shell that re-derives PATH; a Chat session `exec`s
    // with no shell in between (see this module's header). See `user_path`.
    //
    // The child gets that PATH too: `npx` immediately looks up `node`, so
    // resolving only the first binary would move the failure one level down.
    let path = env
        .get("PATH")
        .cloned()
        .unwrap_or_else(super::user_path::effective_path);
    let program = super::user_path::resolve_program(&command, &path).ok_or_else(|| {
        format!("failed to spawn {command}: not found on PATH. Silo reads PATH from your login shell — make sure {command} is on it.")
    })?;
    env.insert("PATH".to_string(), path);
    let env = env;

    let env_report: HashMap<String, String> = report_env
        .unwrap_or_default()
        .into_iter()
        .filter_map(|name| {
            let value = env
                .get(&name)
                .cloned()
                .or_else(|| std::env::var(&name).ok())?;
            Some((name, value))
        })
        .collect();

    let (a, b, c) = (app.clone(), app.clone(), app);
    let (m, s, x) = (
        format!("acp_message:{id}"),
        format!("acp_stderr:{id}"),
        format!("acp_closed:{id}"),
    );
    let evicted = id.clone();

    let conn = AcpConnection::spawn(
        &program.to_string_lossy(),
        &args,
        cwd.as_deref(),
        &env,
        move |line| {
            let _ = a.emit(&m, line);
        },
        move |line| {
            let _ = b.emit(&s, line);
        },
        move |exit| {
            let _ = c.emit(&x, exit);
            lock(registry()).remove(&evicted);
        },
    )?;

    let pid = conn.pid();
    lock(registry()).insert(id.clone(), Arc::new(conn));
    Ok(AcpSpawnResult {
        connection_id: id,
        pid,
        env_report,
    })
}

#[tauri::command]
pub async fn acp_send(connection_id: String, message: String) -> Result<(), String> {
    let conn = lock(registry())
        .get(&connection_id)
        .cloned()
        .ok_or("unknown connection")?;
    conn.send(&message)
}

#[tauri::command]
pub async fn acp_stderr_tail(connection_id: String) -> Result<Vec<String>, String> {
    let conn = lock(registry())
        .get(&connection_id)
        .cloned()
        .ok_or("unknown connection")?;
    Ok(conn.stderr_tail())
}

/// Close one connection: ask the agent to exit, signal its process group, and
/// resolve only once the process is really gone (bounded by
/// {@link CLOSE_WAIT}).
///
/// **Deliberately does not evict from the registry.** The eviction point is
/// the stdout reaper's `on_exit`, i.e. the moment the child is actually dead,
/// so a quit landing inside `close`'s grace window still finds this
/// connection and can force-kill it (`close_all`). Evicting here instead left
/// exactly one hole: a tab closed against an agent that ignores SIGTERM,
/// followed by a quit before the escalation fired — nothing could reach the
/// group any more, and the grandchild leaked, which is the whole bug this
/// module's `close` path exists to prevent.
///
/// **Why it waits.** A caller that awaits this and immediately respawns —
/// the reconnect flow (RFC 0042) — would otherwise race the old process,
/// which may still hold the agent CLI's config directory and session store.
/// Bounded and best-effort, the same contract as `session_host.rs`'s `kill`:
/// a cooperative agent is gone in tens of milliseconds, and an uncooperative
/// one must not hang a tab close, so after {@link CLOSE_WAIT} this returns
/// and leaves the rest to the SIGKILL escalation.
#[tauri::command]
pub async fn acp_close(connection_id: String) -> Result<(), String> {
    let conn = lock(registry()).get(&connection_id).cloned();
    let Some(conn) = conn else { return Ok(()) };
    conn.close();
    // On a blocking worker: this is a sleep-poll loop, not something to park
    // an executor thread on.
    tauri::async_runtime::spawn_blocking(move || conn.wait_for_exit(CLOSE_WAIT))
        .await
        .ok();
    Ok(())
}

/// Whether at least one ACP child is currently alive. Backs the close/quit
/// gate (`lib.rs`'s `CloseRequested` handler): a close with none alive
/// proceeds immediately, with no round trip to the webview at all. This is
/// intentionally coarser than "an agent is actually working" — that finer
/// activity state lives only in the webview (`agent-close-guard.ts`), which
/// decides whether a connected-but-idle agent should let the close through
/// silently or actually warn the user.
pub fn has_live_connections() -> bool {
    // Closing connections are excluded: they stay registered until their
    // process is reaped (see `acp_close`), but the user has already closed
    // that tab and must not be prompted about it again on quit.
    lock(registry()).values().any(|c| !c.is_closing())
}

/// Force-close every live agent and quit immediately. Invoked by the webview
/// once it's decided the close should go through — either the user confirmed
/// losing a working agent, or none were actually working — bypassing
/// `CloseRequested` since that decision is already made.
#[tauri::command]
pub fn force_quit(app: tauri::AppHandle) {
    close_all();
    app.exit(0);
}

/// Kill every live ACP child. Wired into `RunEvent::Exit` in `lib.rs`.
///
/// Unlike a PTY session — which is owned by a detached daemon and deliberately
/// survives the UI process — an ACP connection is a *piped child of this
/// process*. Nothing reparents it cleanly: on quit it is inherited by `init`
/// and keeps running. `acp_close` already does the right thing per connection;
/// nothing was calling it on app exit, so every quit with a live session leaked
/// an agent (69 found orphaned on 2026-09-08, all `PPID 1`).
///
/// Ungraceful on purpose (`close_now`, not `close`): there is no future tick
/// left for a deferred SIGKILL to fire on, and quitting must not stall. This
/// is also why a closing connection stays registered until its process is
/// reaped — otherwise a quit inside `close`'s grace window would find nothing
/// to force-kill. The other signalled-exit paths (Ctrl-C in `pnpm dev`,
/// `kill <pid>`) never reach `RunEvent::Exit` at all; see
/// {@link install_signal_reaper}.
pub fn close_all() {
    let conns: Vec<Arc<AcpConnection>> = {
        let mut r = lock(registry());
        r.drain().map(|(_, conn)| conn).collect()
    };
    for conn in conns {
        // Including ones already mid-`close`: their escalation is scheduled on
        // the Tokio runtime, which dies with this process, so this is the last
        // chance to force one that ignored SIGTERM. Already-reaped ones are
        // skipped so no signal is aimed at a recycled pid.
        if !conn.has_exited() {
            conn.close_now();
        }
    }
}

/// Kill every ACP child left behind by a page that is going away. Wired into
/// `on_page_load` in `lib.rs`.
///
/// A webview reload — `core.reloadWindow`, or WebKit reloading the document
/// itself after a renderer crash — throws away the JS heap without running a
/// single `dispose()`. The React cleanup that normally calls `acp_close` never
/// fires, so every connection stays here with its child alive, while the page
/// that comes back has no handle to any of them: it restores each Chat panel
/// and reconnects it with `session/resume`, spawning a *second* agent for the
/// same session. Nothing ever closed the first. One leaked agent per live
/// session per reload, until the app finally exits (45 live `claude` children,
/// 2-3 per session id, found on 2026-10-21).
///
/// Graceful (`close`, not `close_all`'s `close_now`): the app keeps running
/// behind this, so there are future ticks for the SIGKILL escalation to fire
/// on, and the agent gets to flush its own session file before it goes.
///
/// Connections are left registered rather than drained, exactly as `acp_close`
/// leaves them: the entry is what a later `close_all` needs in order to force
/// a child that ignored SIGTERM, and the reaper evicts it once the process is
/// actually gone.
pub fn close_abandoned() {
    let conns: Vec<Arc<AcpConnection>> = lock(registry()).values().cloned().collect();
    for conn in conns {
        if !conn.has_exited() {
            conn.close();
        }
    }
}

/// Write end of the self-pipe the exit-signal handler pokes. See
/// {@link install_signal_reaper}.
#[cfg(unix)]
static SIGNAL_PIPE_WRITE: AtomicI32 = AtomicI32::new(-1);

/// The signal handler itself. Does the one async-signal-safe thing it is
/// allowed to: a single `write` to the self-pipe. Reaping locks the registry
/// and shells out to `killpg`, neither of which may happen in handler context.
#[cfg(unix)]
extern "C" fn on_exit_signal(sig: std::os::raw::c_int) {
    let fd = SIGNAL_PIPE_WRITE.load(Ordering::SeqCst);
    if fd >= 0 {
        let byte = sig as u8;
        unsafe {
            libc::write(fd, std::ptr::addr_of!(byte).cast(), 1);
        }
    }
}

/// Reap ACP children when **Silo itself** is signalled — the one quit path
/// `RunEvent::Exit` cannot cover.
///
/// `process_group(0)` is what lets `close` reach a grandchild, but it also
/// moves the children *out* of Silo's own process group, and in `pnpm dev`
/// that was the thing quietly saving them: Ctrl-C in the terminal SIGINTs the
/// whole foreground group, children included. Now it doesn't reach them, and
/// a default-disposition SIGINT terminates this process without ever running
/// `RunEvent::Exit` — so every Ctrl-C'd dev session would leak an agent and
/// its grandchild, which is the orphan class this module exists to close.
/// Also covers a plain `kill <silo-pid>`, which never reached them.
///
/// The self-pipe is the point: a handler may call only async-signal-safe
/// functions, and `close_all` locks a mutex. Blocking the signals and using
/// `sigwait` instead would be simpler but is wrong here — the signal mask is
/// inherited across `fork` *and* `exec`, so the self-forked PTY-host daemon
/// (`main.rs`) would come up with SIGTERM blocked and `session_host`'s
/// SIGTERM-based kill sequence would stop working. A handler changes nothing
/// a child inherits.
///
/// Call once, early in `run()`. No-op on Windows: there is no `sigaction`,
/// and the console-control equivalent has no bearing on a windowed app.
#[cfg(unix)]
pub fn install_signal_reaper() {
    let read_fd = unsafe {
        let mut fds = [0 as libc::c_int; 2];
        if libc::pipe(fds.as_mut_ptr()) != 0 {
            return;
        }
        SIGNAL_PIPE_WRITE.store(fds[1], Ordering::SeqCst);

        let mut action: libc::sigaction = std::mem::zeroed();
        action.sa_sigaction = on_exit_signal as *const () as libc::sighandler_t;
        libc::sigemptyset(&mut action.sa_mask);
        // SA_RESTART so installing a handler where there was none cannot start
        // surfacing EINTR in blocking reads elsewhere in the app.
        action.sa_flags = libc::SA_RESTART;
        for sig in [libc::SIGINT, libc::SIGTERM] {
            libc::sigaction(sig, &action, std::ptr::null_mut());
        }
        fds[0]
    };

    std::thread::spawn(move || {
        let mut byte = 0u8;
        // 0 means the write end went away; anything else is a signal.
        if unsafe { libc::read(read_fd, std::ptr::addr_of_mut!(byte).cast(), 1) } != 1 {
            return;
        }
        close_all();
        // 128 + signo — the shell's convention for a signalled exit.
        std::process::exit(128 + i32::from(byte));
    });
}

#[cfg(not(unix))]
pub fn install_signal_reaper() {}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;
    use std::time::Duration;

    fn env() -> HashMap<String, String> {
        HashMap::new()
    }

    /// The registry is process-wide and `close_all` *drains* it, while Cargo
    /// runs these tests concurrently in one process. Any test that registers
    /// a connection holds this first, so one test's `close_all` can never
    /// reap another's connection (or fail its own `is_empty` assertion on a
    /// neighbour's entry).
    fn registry_guard() -> MutexGuard<'static, ()> {
        static L: Mutex<()> = Mutex::new(());
        lock(&L)
    }

    /// Register a connection under a fresh id, as `acp_spawn` does.
    fn register(conn: AcpConnection) -> (String, Arc<AcpConnection>) {
        let id = next_connection_id();
        let conn = Arc::new(conn);
        lock(registry()).insert(id.clone(), Arc::clone(&conn));
        (id, conn)
    }

    /// `kill(pid, 0)` only probes for existence; signals are asynchronous, so
    /// every assertion about a process being gone needs a bounded poll.
    #[cfg(unix)]
    fn wait_until_dead(pid: i32, timeout: Duration) -> bool {
        let deadline = std::time::Instant::now() + timeout;
        while std::time::Instant::now() < deadline {
            if unsafe { libc::kill(pid, 0) } != 0 {
                return true;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        false
    }

    /// Spawn a shell that forks a background grandchild, reports its pid on
    /// stdout, and waits. With `ignore_term` the shell sets SIGTERM to
    /// *ignored* before forking — a disposition that is inherited across both
    /// `fork` and `exec`, so the grandchild ignores it too. That stands in
    /// for the agent this module's graceful path has to survive: one where
    /// only SIGKILL works.
    #[cfg(unix)]
    fn spawn_with_grandchild(ignore_term: bool) -> (AcpConnection, i32) {
        let trap = if ignore_term { r#"trap "" TERM; "# } else { "" };
        let (tx, rx) = mpsc::channel();
        let conn = AcpConnection::spawn(
            "sh",
            &["-c".into(), format!("{trap}sleep 30 & echo $!; wait")],
            None,
            &env(),
            move |line| {
                let _ = tx.send(line);
            },
            |_| {},
            |_| {},
        )
        .expect("spawn sh");
        let pid: i32 = rx
            .recv_timeout(Duration::from_secs(5))
            .expect("no grandchild pid reported")
            .trim()
            .parse()
            .expect("grandchild pid was not a number");
        assert_eq!(
            unsafe { libc::kill(pid, 0) },
            0,
            "grandchild never started"
        );
        (conn, pid)
    }

    /// The claim that separates this from a PTY: a single frame far larger than
    /// any pipe buffer round-trips **byte-exact**, delivered as one line.
    ///
    /// 1 MiB is ~16x the largest common pipe buffer (64 KiB) and ~256x the
    /// 4 KiB canonical-mode line limit a PTY would silently truncate at.
    #[test]
    fn spawn_roundtrip_large_frame() {
        let payload = format!(r#"{{"jsonrpc":"2.0","big":"{}"}}"#, "x".repeat(1024 * 1024));
        let (tx, rx) = mpsc::channel();

        // `cat` echoes stdin to stdout unchanged: a perfect loopback agent.
        let conn = AcpConnection::spawn(
            "cat",
            &[],
            None,
            &env(),
            move |line| {
                let _ = tx.send(line);
            },
            |_| {},
            |_| {},
        )
        .expect("spawn cat");

        conn.send(&payload).expect("send");
        let got = rx
            .recv_timeout(Duration::from_secs(10))
            .expect("no line received");

        assert_eq!(got.len(), payload.len(), "frame was truncated or split");
        assert_eq!(got, payload, "frame was not byte-exact");
        conn.close();
    }

    /// Several frames in a row stay separate and ordered — no coalescing, no
    /// splitting.
    #[test]
    fn frames_stay_separate_and_ordered() {
        let (tx, rx) = mpsc::channel();
        let conn = AcpConnection::spawn(
            "cat",
            &[],
            None,
            &env(),
            move |line| {
                let _ = tx.send(line);
            },
            |_| {},
            |_| {},
        )
        .expect("spawn cat");

        for i in 0..50 {
            conn.send(&format!(r#"{{"id":{i}}}"#)).expect("send");
        }
        for i in 0..50 {
            let got = rx
                .recv_timeout(Duration::from_secs(5))
                .expect("missing frame");
            assert_eq!(got, format!(r#"{{"id":{i}}}"#));
        }
        conn.close();
    }

    /// An agent that dies before saying anything on stdout must still explain
    /// itself. Without this, the user gets "connection closed" and nothing else
    /// — the failure mode the recon doc found Gemini hitting for real.
    #[test]
    fn stderr_is_captured_when_child_dies_before_output() {
        let (tx, rx) = mpsc::channel();
        let conn = AcpConnection::spawn(
            "sh",
            &["-c".into(), "echo 'ENOENT: node not found' >&2; exit 3".into()],
            None,
            &env(),
            |_| {},
            |_| {},
            move |exit| {
                let _ = tx.send(exit);
            },
        )
        .expect("spawn sh");

        let exit = rx
            .recv_timeout(Duration::from_secs(10))
            .expect("no exit reported");
        assert_eq!(exit.code, 3);
        assert!(
            exit.stderr.iter().any(|l| l.contains("node not found")),
            "stderr was lost: {:?}",
            exit.stderr
        );
        conn.close();
    }

    /// A command that isn't on PATH fails at spawn with a usable message,
    /// rather than producing a connection that never answers.
    #[test]
    fn missing_binary_fails_at_spawn() {
        let result = AcpConnection::spawn(
            "silo-no-such-agent-binary",
            &[],
            None,
            &env(),
            |_| {},
            |_| {},
            |_| {},
        );
        let err = match result {
            Ok(_) => panic!("should not spawn"),
            Err(e) => e,
        };
        assert!(err.contains("silo-no-such-agent-binary"), "got: {err}");
    }

    /// stderr is bounded: a chatty agent cannot grow the ring without limit.
    /// Both probed agents log routine timing to stderr, so this is the normal
    /// case, not an adversarial one.
    #[test]
    fn stderr_ring_is_bounded() {
        let (tx, rx) = mpsc::channel();
        let conn = AcpConnection::spawn(
            "sh",
            &[
                "-c".into(),
                format!("i=0; while [ $i -lt {} ]; do echo line$i >&2; i=$((i+1)); done", STDERR_RING * 3),
            ],
            None,
            &env(),
            |_| {},
            |_| {},
            move |exit| {
                let _ = tx.send(exit);
            },
        )
        .expect("spawn sh");

        let exit = rx
            .recv_timeout(Duration::from_secs(20))
            .expect("no exit reported");
        assert_eq!(exit.stderr.len(), STDERR_RING);
        // The ring keeps the *tail* — the lines nearest the failure.
        assert!(exit.stderr.last().unwrap().contains(&format!("line{}", STDERR_RING * 3 - 1)));
        conn.close();
    }

    /// `has_live_connections` is what gates the close/quit confirmation: false
    /// with nothing running (the fast, ungated path), true the moment a
    /// connection is registered, false again once it's reaped.
    #[test]
    fn has_live_connections_tracks_registry_occupancy() {
        let _guard = registry_guard();
        let conn = AcpConnection::spawn("cat", &[], None, &env(), |_| {}, |_| {}, |_| {})
            .expect("spawn cat");
        let (id, _conn) = register(conn);

        assert!(has_live_connections());

        let removed = lock(registry()).remove(&id);
        if let Some(conn) = removed {
            conn.close_now();
        }
        assert!(!has_live_connections());
    }

    /// The quit gate must not re-prompt about a tab the user already closed.
    /// A closing connection stays in the registry until its process is reaped
    /// (that retention is what lets `close_all` still force-kill it), so
    /// `has_live_connections` has to read the `closing` flag, not occupancy.
    #[test]
    fn has_live_connections_ignores_a_closing_connection() {
        let _guard = registry_guard();
        let conn = AcpConnection::spawn("cat", &[], None, &env(), |_| {}, |_| {}, |_| {})
            .expect("spawn cat");
        let (id, conn) = register(conn);

        assert!(has_live_connections());
        conn.close();
        assert!(
            lock(registry()).contains_key(&id),
            "close must not evict — close_all has to be able to find it"
        );
        assert!(
            !has_live_connections(),
            "a closed tab's dying process must not gate the quit"
        );

        lock(registry()).remove(&id);
        conn.close_now();
    }

    /// `close_all` drains the registry and closes every live connection — the
    /// app-exit reap that stops ACP agents orphaning on every quit.
    #[test]
    fn close_all_reaps_every_connection() {
        let _guard = registry_guard();
        let ids: Vec<String> = (0..3)
            .map(|_| {
                let conn =
                    AcpConnection::spawn("cat", &[], None, &env(), |_| {}, |_| {}, |_| {})
                        .expect("spawn cat");
                register(conn).0
            })
            .collect();

        assert!(ids.iter().all(|id| lock(registry()).contains_key(id)));

        close_all();

        assert!(
            lock(registry()).is_empty(),
            "close_all left connections in the registry"
        );
    }

    /// A webview reload runs no JS cleanup, so `close_abandoned` is the only
    /// thing that reaps the outgoing page's agents. Without it the reloaded
    /// page resumes each session into a *second* child and the first one runs
    /// until the app quits.
    #[cfg(unix)]
    #[test]
    fn close_abandoned_reaps_the_outgoing_pages_children() {
        let _guard = registry_guard();
        let pids: Vec<i32> = (0..3)
            .map(|_| {
                let (conn, grandchild) = spawn_with_grandchild(false);
                register(conn);
                grandchild
            })
            .collect();

        close_abandoned();

        for pid in pids {
            assert!(
                wait_until_dead(pid, Duration::from_secs(5)),
                "close_abandoned left agent {pid} alive"
            );
        }
    }

    /// Unlike `close_all`, this one runs with the app still up — so a
    /// connection stays registered until its process is actually reaped, which
    /// is what lets a later `close_all` force one that ignored SIGTERM.
    #[cfg(unix)]
    #[test]
    fn close_abandoned_keeps_a_stubborn_connection_registered() {
        let _guard = registry_guard();
        let (conn, _grandchild) = spawn_with_grandchild(true);
        let (id, _conn) = register(conn);

        close_abandoned();

        assert!(
            lock(registry()).contains_key(&id),
            "close_abandoned dropped a connection still on its way out"
        );
    }

    /// `close_abandoned` reaps **every** registered connection, which is only
    /// the right thing to do while Silo has exactly one window: a reload there
    /// abandons every agent in the app. The day a second window exists, one
    /// window reloading would reap the other's agents, and this fix has to
    /// grow a per-window owner before that ships. Fail loudly here rather than
    /// silently killing a live session, because nothing else would catch it.
    #[test]
    fn close_abandoned_assumes_a_single_window() {
        let conf: serde_json::Value =
            serde_json::from_str(include_str!("../../tauri.conf.json"))
                .expect("tauri.conf.json is not valid JSON");
        let windows = conf["app"]["windows"]
            .as_array()
            .expect("tauri.conf.json declares no app.windows array");
        assert_eq!(
            windows.len(),
            1,
            "Silo grew a second window — scope `close_abandoned` to the \
             reloading webview's own connections before this ships"
        );
    }

    /// The invariant everything else here rests on: the child really is its
    /// own process-group leader, so `pid == pgid` and a `killpg` aimed at it
    /// can only ever reach our own tree. If `process_group(0)` ever stopped
    /// taking effect, `pgid` would be `None` and the group kill would be
    /// silently skipped rather than mis-aimed at a stranger's group.
    #[cfg(unix)]
    #[test]
    fn the_child_leads_its_own_process_group() {
        let conn = AcpConnection::spawn("cat", &[], None, &env(), |_| {}, |_| {}, |_| {})
            .expect("spawn cat");
        assert_eq!(
            conn.pgid,
            Some(conn.pid() as i32),
            "the child is not its own process-group leader"
        );
        conn.close_now();
    }

    /// `has_exited`/`wait_for_exit` must mean "really reaped", not
    /// "signalled" — the SIGKILL escalation and `acp_close`'s bounded wait
    /// both gate on it, and a false positive would aim a kill at a pid the OS
    /// is free to have recycled.
    #[test]
    fn wait_for_exit_distinguishes_reaped_from_running() {
        let live = AcpConnection::spawn("cat", &[], None, &env(), |_| {}, |_| {}, |_| {})
            .expect("spawn cat");
        assert!(
            !live.wait_for_exit(Duration::from_millis(100)),
            "a running child reported itself exited"
        );
        assert!(!live.has_exited());

        let done = AcpConnection::spawn(
            "sh",
            &["-c".into(), "exit 0".into()],
            None,
            &env(),
            |_| {},
            |_| {},
            |_| {},
        )
        .expect("spawn sh");
        assert!(
            done.wait_for_exit(Duration::from_secs(5)),
            "a child that exited was never reported reaped"
        );
        assert!(done.has_exited());

        live.close_now();
    }

    /// `close_now` reaches more than the direct child: a grandchild (`npx`
    /// forking `node`, `cursor-agent` bundling its own node runtime) must die
    /// with it, not survive as an orphan under `PPID 1`. `process_group(0)`
    /// at spawn plus `killpg` at close is what makes that true; this test
    /// forks a background grandchild to stand in for one, run through
    /// `close_now` (the app-exit path) so the assertion is deterministic —
    /// no dependency on the `close` grace-period escalation actually firing.
    #[cfg(unix)]
    #[test]
    fn close_now_reaps_the_whole_process_group() {
        let (conn, grandchild) = spawn_with_grandchild(false);

        conn.close_now();

        assert!(
            wait_until_dead(grandchild, Duration::from_secs(2)),
            "grandchild pid {grandchild} survived close_now — the leak this fix exists for"
        );
    }

    /// The graceful path's own escalation: an agent that ignores SIGTERM —
    /// and whose grandchild inherits that ignored disposition — still dies,
    /// because `close` schedules a SIGKILL after `KILL_GRACE`.
    #[cfg(unix)]
    #[test]
    fn close_escalates_to_sigkill_when_sigterm_is_ignored() {
        let (conn, grandchild) = spawn_with_grandchild(true);

        conn.close();

        // Must outlast SIGTERM...
        assert!(
            !wait_until_dead(grandchild, Duration::from_millis(500)),
            "the SIGTERM-ignoring fixture is not actually ignoring SIGTERM"
        );
        // ...and then be killed by the escalation.
        assert!(
            wait_until_dead(grandchild, KILL_GRACE + Duration::from_secs(3)),
            "grandchild pid {grandchild} survived close's SIGKILL escalation"
        );
    }

    /// The close-then-quit hole, closed.
    ///
    /// Quitting inside `close`'s grace window used to lose the connection
    /// entirely: `acp_close` evicted it from the registry before signalling,
    /// `close_all` only drains the registry, and the deferred SIGKILL lives
    /// on the Tokio runtime, which dies with the process on `app.exit(0)`. An
    /// agent that ignored SIGTERM therefore leaked its grandchild — the exact
    /// orphan this module exists to prevent, reintroduced by going from an
    /// instant SIGKILL to a graceful close. Keeping a closing connection
    /// registered until its process is actually reaped is what fixes it.
    ///
    /// The 1s assertion window is deliberately shorter than `KILL_GRACE`, so
    /// a pass cannot be the escalation firing on its own.
    #[cfg(unix)]
    #[test]
    fn close_all_force_kills_a_connection_still_inside_its_grace_period() {
        let _guard = registry_guard();
        let (conn, grandchild) = spawn_with_grandchild(true);
        let (id, conn) = register(conn);

        // What `acp_close` does: SIGTERM, no eviction.
        conn.close();
        assert!(
            lock(registry()).contains_key(&id),
            "close evicted the connection — close_all can no longer reach it"
        );

        // The user quits, well inside the grace period.
        close_all();

        assert!(
            wait_until_dead(grandchild, Duration::from_secs(1)),
            "grandchild pid {grandchild} survived a quit inside close's grace window"
        );
        assert!(lock(registry()).is_empty());
    }

    /// Risk #3, closed: `acp_close` must resolve only once the process is
    /// really gone, not once the signal is sent. A caller that awaits it and
    /// immediately respawns — the reconnect flow — would otherwise race the
    /// old process for the agent CLI's config directory and session store.
    #[cfg(unix)]
    #[test]
    fn acp_close_resolves_only_once_the_process_is_gone() {
        let _guard = registry_guard();
        let (conn, grandchild) = spawn_with_grandchild(false);
        let (id, conn) = register(conn);

        tauri::async_runtime::block_on(acp_close(id.clone())).expect("acp_close");

        assert!(
            conn.has_exited(),
            "acp_close resolved while the agent was still alive"
        );
        assert_eq!(
            unsafe { libc::kill(grandchild, 0) },
            -1,
            "acp_close resolved while the grandchild was still alive"
        );
    }

    /// ...and when the agent will *not* go quietly, `acp_close` still has to
    /// come back (bounded by `CLOSE_WAIT`) and leave the connection where
    /// `close_all` can finish the job. This is the pairing that closes risk
    /// #1: no eviction before the process is reaped, so a quit inside the
    /// grace window is not a leak.
    #[cfg(unix)]
    #[test]
    fn acp_close_returns_on_an_uncooperative_agent_and_leaves_it_reachable() {
        let _guard = registry_guard();
        let (conn, grandchild) = spawn_with_grandchild(true);
        let (id, conn) = register(conn);

        let started = std::time::Instant::now();
        tauri::async_runtime::block_on(acp_close(id.clone())).expect("acp_close");

        assert!(
            started.elapsed() < KILL_GRACE,
            "acp_close hung past the grace period on an agent that ignores SIGTERM"
        );
        assert!(!conn.has_exited());
        assert!(
            lock(registry()).contains_key(&id),
            "acp_close evicted a still-running connection — the close-then-quit leak"
        );

        close_all();
        assert!(
            wait_until_dead(grandchild, Duration::from_secs(1)),
            "grandchild pid {grandchild} survived the quit after acp_close"
        );
    }

    /// The blast-radius guarantee this fix depends on: closing one connection
    /// must not touch another's process. Each `AcpConnection` gets its own
    /// pid (and, after `process_group(0)`, its own pgid) at spawn, so
    /// `killpg(this_pid, _)` cannot reach a sibling connection's child —
    /// proven here by behavior, not just by reading the code.
    #[test]
    fn close_now_does_not_touch_a_different_connection() {
        let (tx_a, _rx_a) = mpsc::channel();
        let conn_a = AcpConnection::spawn(
            "cat",
            &[],
            None,
            &env(),
            move |l| {
                let _ = tx_a.send(l);
            },
            |_| {},
            |_| {},
        )
        .expect("spawn cat a");

        let (tx_b, rx_b) = mpsc::channel();
        let conn_b = AcpConnection::spawn(
            "cat",
            &[],
            None,
            &env(),
            move |l| {
                let _ = tx_b.send(l);
            },
            |_| {},
            |_| {},
        )
        .expect("spawn cat b");

        conn_a.close_now();

        // b is untouched and still answers after a's close.
        conn_b.send(r#"{"ping":true}"#).expect("send to b");
        let got = rx_b
            .recv_timeout(Duration::from_secs(5))
            .expect("b did not answer after a's close");
        assert_eq!(got, r#"{"ping":true}"#);
        conn_b.close();
    }

    /// `install_signal_reaper` actually takes: both exit signals end up with
    /// our handler rather than their default terminate-immediately
    /// disposition, which is what gives `close_all` a chance to run on a
    /// Ctrl-C'd dev session. The behaviour *after* delivery (reap, then exit
    /// 128+signo) cannot be asserted in-process — it ends the test binary —
    /// so that half is verified by running the dev app and Ctrl-C'ing it.
    #[cfg(unix)]
    #[test]
    fn install_signal_reaper_takes_over_the_exit_signals() {
        install_signal_reaper();

        assert!(
            SIGNAL_PIPE_WRITE.load(Ordering::SeqCst) >= 0,
            "self-pipe was never opened"
        );
        for sig in [libc::SIGINT, libc::SIGTERM] {
            let mut current: libc::sigaction = unsafe { std::mem::zeroed() };
            assert_eq!(
                unsafe { libc::sigaction(sig, std::ptr::null(), &mut current) },
                0
            );
            assert_eq!(
                current.sa_sigaction,
                on_exit_signal as *const () as libc::sighandler_t,
                "signal {sig} is not routed to the reaper"
            );
        }
    }

    /// The end-to-end claim: a **real** ACP agent, initialized through this
    /// transport, over the real wire. A `cat` loopback proves framing; only
    /// this proves the transport is actually usable for the protocol.
    ///
    /// `#[ignore]` because it needs the agent installed, network, and a
    /// logged-in account — the same reason RFC 0033's per-agent recon was run
    /// by hand rather than in CI. Run it deliberately:
    ///
    /// ```sh
    /// cargo test --lib commands::acp::tests::real_agent -- --ignored --nocapture
    /// ```
    #[test]
    #[ignore]
    fn real_agent_initializes_over_this_transport() {
        let (tx, rx) = mpsc::channel();
        let conn = AcpConnection::spawn(
            "cursor-agent",
            &["acp".into()],
            None,
            &std::env::vars().collect(),
            move |line| {
                let _ = tx.send(line);
            },
            |line| eprintln!("[agent stderr] {line}"),
            |exit| eprintln!("[agent exit] {exit:?}"),
        )
        .expect("spawn cursor-agent");

        conn.send(
            r#"{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":1,"clientCapabilities":{"fs":{"readTextFile":true,"writeTextFile":true},"terminal":true},"clientInfo":{"name":"silo-spike","version":"0.0.1"}}}"#,
        )
        .expect("send initialize");

        let reply = rx
            .recv_timeout(Duration::from_secs(60))
            .expect("no initialize reply");
        eprintln!("[initialize reply] {reply}");

        let v: serde_json::Value = serde_json::from_str(&reply).expect("reply is not JSON");
        assert_eq!(v["id"], 0, "reply did not answer our request: {reply}");
        assert_eq!(
            v["result"]["protocolVersion"], 1,
            "unexpected protocol version: {reply}"
        );
        conn.close();
    }
}
