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
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

use serde::Serialize;

/// How many trailing stderr lines to keep per connection. Enough to carry a
/// stack trace or a vendor error message; bounded so a chatty agent (both
/// probed agents log routine timing to stderr) can't grow without limit.
const STDERR_RING: usize = 200;

/// Reported when a child is terminated by a signal, matching `ExecResult`'s
/// convention in `process.rs` rather than inventing a second one.
const EXIT_SIGNALLED: i32 = -1;

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
    child: Arc<Mutex<Child>>,
    stdin: Arc<Mutex<Option<ChildStdin>>>,
    stderr: Arc<Mutex<Vec<String>>>,
    pid: u32,
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

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("failed to spawn {command}: {e}"))?;

        let pid = child.id();
        let stdout = child.stdout.take().ok_or("no stdout pipe")?;
        let stderr_pipe = child.stderr.take().ok_or("no stderr pipe")?;
        let stdin = child.stdin.take().ok_or("no stdin pipe")?;

        let stderr_ring: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
        let child = Arc::new(Mutex::new(child));

        // stderr on its own thread. It must not share the stdout thread: a
        // child that fills the stderr pipe while we are blocked reading stdout
        // deadlocks, and an agent that writes only to stderr before dying would
        // otherwise never be heard at all.
        {
            let ring = Arc::clone(&stderr_ring);
            std::thread::spawn(move || {
                for line in BufReader::new(stderr_pipe).lines().map_while(Result::ok) {
                    {
                        let mut r = ring.lock().unwrap();
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
        {
            let ring = Arc::clone(&stderr_ring);
            let child = Arc::clone(&child);
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
                    .lock()
                    .unwrap()
                    .wait()
                    .ok()
                    .and_then(|s| s.code())
                    .unwrap_or(EXIT_SIGNALLED);
                let stderr = ring.lock().unwrap().clone();
                on_exit(AcpExit { code, stderr });
            });
        }

        Ok(AcpConnection {
            child,
            stdin: Arc::new(Mutex::new(Some(stdin))),
            stderr: stderr_ring,
            pid,
        })
    }

    /// Write one JSON-RPC frame. The newline is appended here so a caller can
    /// never forget it — a frame without its terminator wedges the agent's
    /// reader with no error anywhere.
    pub fn send(&self, message: &str) -> Result<(), String> {
        let mut guard = self.stdin.lock().unwrap();
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
        self.stderr.lock().unwrap().clone()
    }

    pub fn pid(&self) -> u32 {
        self.pid
    }

    /// Close stdin first, then kill. Dropping stdin is how a well-behaved agent
    /// is asked to exit; the kill is the backstop for one that ignores it.
    pub fn close(&self) {
        *self.stdin.lock().unwrap() = None;
        let _ = self.child.lock().unwrap().kill();
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
) -> Result<AcpSpawnResult, String> {
    use tauri::Emitter;

    let id = next_connection_id();
    let env = env.unwrap_or_default();

    let (a, b, c) = (app.clone(), app.clone(), app);
    let (m, s, x) = (
        format!("acp_message:{id}"),
        format!("acp_stderr:{id}"),
        format!("acp_closed:{id}"),
    );
    let evicted = id.clone();

    let conn = AcpConnection::spawn(
        &command,
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
            registry().lock().unwrap().remove(&evicted);
        },
    )?;

    let pid = conn.pid();
    registry()
        .lock()
        .unwrap()
        .insert(id.clone(), Arc::new(conn));
    Ok(AcpSpawnResult {
        connection_id: id,
        pid,
    })
}

#[tauri::command]
pub async fn acp_send(connection_id: String, message: String) -> Result<(), String> {
    let conn = {
        let r = registry().lock().unwrap();
        r.get(&connection_id).cloned()
    }
    .ok_or("unknown connection")?;
    conn.send(&message)
}

#[tauri::command]
pub async fn acp_stderr_tail(connection_id: String) -> Result<Vec<String>, String> {
    let conn = {
        let r = registry().lock().unwrap();
        r.get(&connection_id).cloned()
    }
    .ok_or("unknown connection")?;
    Ok(conn.stderr_tail())
}

#[tauri::command]
pub async fn acp_close(connection_id: String) -> Result<(), String> {
    let conn = registry().lock().unwrap().remove(&connection_id);
    if let Some(conn) = conn {
        conn.close();
    }
    Ok(())
}

/// Kill every live ACP child. Wired into `RunEvent::Exit` in `lib.rs`.
///
/// Unlike a PTY session — which is owned by a detached daemon and deliberately
/// survives the UI process — an ACP connection is a *piped child of this
/// process*. Nothing reparents it cleanly: on quit it is inherited by `init`
/// and keeps running. `acp_close` already does the right thing per connection;
/// nothing was calling it on app exit, so every quit with a live session leaked
/// an agent (69 found orphaned on 2026-09-08, all `PPID 1`).
pub fn close_all() {
    let conns: Vec<Arc<AcpConnection>> = {
        let mut r = registry().lock().unwrap();
        r.drain().map(|(_, conn)| conn).collect()
    };
    for conn in conns {
        conn.close();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;
    use std::time::Duration;

    fn env() -> HashMap<String, String> {
        HashMap::new()
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

    /// `close_all` drains the registry and closes every live connection — the
    /// app-exit reap that stops ACP agents orphaning on every quit.
    #[test]
    fn close_all_reaps_every_connection() {
        let ids: Vec<String> = (0..3)
            .map(|_| {
                let conn =
                    AcpConnection::spawn("cat", &[], None, &env(), |_| {}, |_| {}, |_| {})
                        .expect("spawn cat");
                let id = next_connection_id();
                registry()
                    .lock()
                    .unwrap()
                    .insert(id.clone(), Arc::new(conn));
                id
            })
            .collect();

        assert!(ids
            .iter()
            .all(|id| registry().lock().unwrap().contains_key(id)));

        close_all();

        assert!(
            registry().lock().unwrap().is_empty(),
            "close_all left connections in the registry"
        );
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
