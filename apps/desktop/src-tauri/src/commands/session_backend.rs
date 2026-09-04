// Backend seam for persistent terminal sessions.
//
// Everything above this trait — the Tauri commands in `terminal.rs`, the reader
// loop, the session registry, lifecycle logging, and the entire frontend — is
// backend-agnostic; it speaks only to `SessionBackend` and the neutral
// `Connection`. The self-owned PTY host (`session_host::SessionHostBackend`,
// RFC 0010) is the sole implementation: a daemon we own, with no external
// dependency.
//
// A "handle" is the opaque identifier for a persistent session (for the session
// host, the socket name). The app never derives it on the fly for reattach — it
// is persisted via `session_registry` at create time.

use portable_pty::PtySize;
use std::collections::HashMap;
use std::io::Write;

/// The two control capabilities the layer above the seam needs on a live
/// session: resize it and force-kill it. Kept backend-neutral (no `portable_pty`
/// types) so a socket-backed backend satisfies the seam directly.
pub trait SessionMaster: Send {
    /// Propagate a new terminal size to the session (so TUIs get `SIGWINCH`).
    fn resize(&self, size: PtySize) -> Result<(), String>;
}

pub trait SessionChild: Send {
    /// Tear down this app instance's attachment to the session.
    fn kill(&mut self) -> Result<(), String>;
}

/// One delivery of session output: how many bytes landed in the caller's
/// buffer, and whether they are history the backend is replaying rather than
/// output the session produced just now.
pub struct SessionChunk {
    pub len: usize,
    pub replay: bool,
}

/// The read half of a session. Deliberately *not* `Read`: a plain byte stream
/// cannot say when its bytes were produced, and on reattach a backend replays
/// up to a full ring buffer of history that is byte-for-byte indistinguishable
/// from live output. Consumers that paint it (double-painting scrollback) or
/// read activity from it (phantom agent bells) need the distinction, so it
/// belongs on the seam rather than in a backend-specific side channel — see
/// RFC 0036.
///
/// A single `read_chunk` never mixes replayed and live bytes.
pub trait SessionReader: Send {
    /// Fill `buf` with the next available bytes. A `len` of 0 means EOF, as
    /// with [`Read::read`].
    fn read_chunk(&mut self, buf: &mut [u8]) -> std::io::Result<SessionChunk>;
}

/// A live, attached connection to a session: the resize/kill handles plus the
/// byte streams bridging this app instance to the persistent session.
pub struct Connection {
    pub master: Box<dyn SessionMaster>,
    pub reader: Box<dyn SessionReader + Send>,
    pub writer: Box<dyn Write + Send>,
    pub child: Box<dyn SessionChild>,
}

/// A foreground-process update for a session (RFC 0010 N1): which process group
/// the PTY currently routes input to, whether that's the shell (at a prompt),
/// and the leader's name. Serialized to the frontend for tab-title logic.
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ForegroundInfo {
    pub pgid: i32,
    pub at_prompt: bool,
    pub leader: String,
    /// Working directory of the foreground leader (RFC 0010 N2); "" if unknown.
    pub cwd: String,
}

/// A live stream of foreground updates for one session. `next` blocks until the
/// next update and returns `None` when the stream ends (session gone).
pub trait ForegroundSub: Send {
    fn next(&mut self) -> Option<ForegroundInfo>;
}

pub trait SessionBackend: Send + Sync {
    /// Compute the handle for a brand-new session id. Used only at create time;
    /// reattach must use the persisted handle (see `session_registry`).
    fn handle_for(&self, session_id: &str) -> String;

    /// Create (and attach to) a new persistent session. `command` is the program
    /// + args to run (empty/None → the backend's default login shell); a leading
    /// empty string means "the user's $SHELL", resolved by the backend.
    ///
    /// `env` is the session's terminal identity (RFC 0028) plus any extra
    /// variables the caller asked for, already assembled and sanitized by the
    /// host. It is merged over the inherited environment in the session's own
    /// child process — deliberately not on the daemon that owns it, so a
    /// per-session fact never shows up one process too high.
    fn create(
        &self,
        handle: &str,
        cwd: &str,
        size: PtySize,
        command: Option<Vec<String>>,
        env: Option<HashMap<String, String>>,
    ) -> Result<Connection, String>;

    /// Reattach to an existing persistent session.
    fn attach(&self, handle: &str, size: PtySize) -> Result<Connection, String>;

    /// Whether a session with this handle currently exists in the backend.
    fn exists(&self, handle: &str) -> bool;

    /// All live session handles owned by the backend (for reconciliation /
    /// orphan detection).
    #[allow(dead_code)]
    fn list(&self) -> Vec<String>;

    /// Force-terminate the session. Must not depend on the inner shell being at
    /// a prompt (i.e. must work even while a foreground process is running).
    fn kill(&self, handle: &str) -> Result<(), String>;

    /// Subscribe to foreground-process updates for a session (RFC 0010 N1).
    /// Returns a blocking stream, or `None` if the backend doesn't support it.
    fn subscribe_foreground(&self, handle: &str) -> Option<Box<dyn ForegroundSub>>;
}

pub fn active_backend() -> Box<dyn SessionBackend> {
    #[cfg(unix)]
    {
        Box::new(super::session_host::SessionHostBackend)
    }
    #[cfg(windows)]
    {
        Box::new(super::session_windows::SessionWindowsBackend)
    }
    #[cfg(not(any(unix, windows)))]
    {
        unimplemented!("no terminal session backend on this platform")
    }
}

/// Append a structured, timestamped lifecycle event to the terminal log and
/// stderr. Epoch-millis timestamp keeps it dependency-free and greppable
/// (convert with e.g. `date -r $((ts/1000))`).
pub fn log_event(event: &str, detail: &str) {
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let line = format!("{} {} {}\n", ts, event, detail);
    eprint!("[terminal] {}", line);
    if let Some(root) = super::app_paths::data_dir() {
        let dir = root.join("logs");
        let _ = std::fs::create_dir_all(&dir);
        if let Ok(mut f) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(dir.join("terminal.log"))
        {
            let _ = f.write_all(line.as_bytes());
        }
    }
}
