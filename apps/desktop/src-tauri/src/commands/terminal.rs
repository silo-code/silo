use dashmap::DashMap;
use parking_lot::Mutex;
use portable_pty::PtySize;
use std::io::Write;
use std::sync::atomic::AtomicBool;
use std::sync::mpsc::{sync_channel, SyncSender, TrySendError};
use std::sync::Arc;
use std::thread;
use uuid::Uuid;

use super::session_backend::{
    active_backend, log_event, Connection, ForegroundInfo, SessionBackend, SessionChild,
    SessionMaster, SessionReader,
};
use super::session_registry;
use super::terminal_io::{run_foreground_loop, run_reader_loop};

// This module is backend-agnostic: all backend-specific behavior lives behind
// the `SessionBackend` trait in `session_backend.rs`. The persistent handle for
// each session is stored in `session_registry` at create time and looked up on
// reattach — never re-derived — so a future rename or backend swap can't strand
// live sessions.

/// Cap on queued write chunks per session (RFC 0026 Phase 1). Each
/// `terminal_write` is one chunk; a large paste is a single enqueue. When full,
/// the invoke returns immediately with an error instead of blocking the UI
/// thread on the socket.
const WRITE_QUEUE_CAP: usize = 64;

struct PtySession {
    handle: String,
    master: Arc<Mutex<Box<dyn SessionMaster>>>,
    reader: Arc<Mutex<Box<dyn SessionReader + Send>>>,
    /// Ordered off-main writer (RFC 0026): `terminal_write` only enqueues.
    write_tx: SyncSender<Vec<u8>>,
    /// Last socket write failure observed by the writer thread (for Phase 3 UX).
    #[allow(dead_code)] // recorded now; surfaced to JS in a follow-up
    last_write_error: Arc<Mutex<Option<String>>>,
    child: Option<Arc<Mutex<Box<dyn SessionChild>>>>,
    // On Windows, reader thread is deferred until terminal_start_stream to avoid
    // the blank-canvas race (cmd.exe emits its banner in ~5 ms, before JS
    // listen() completes). The bool is set to true exactly once when the thread
    // is actually spawned; terminal_start_stream is idempotent.
    #[cfg(windows)]
    streaming: Arc<AtomicBool>,
}

#[derive(Clone)]
pub struct TerminalState {
    sessions: Arc<DashMap<String, Arc<PtySession>>>,
    /// Last known foreground info per session — written by `run_foreground_loop`,
    /// read by `terminal_foreground_snapshot`. Lets the extension SDK seed the
    /// initial process state without waiting for the next change event.
    pub fg_cache: Arc<DashMap<String, ForegroundInfo>>,
}

impl TerminalState {
    pub fn new() -> Self {
        TerminalState {
            sessions: Arc::new(DashMap::new()),
            fg_cache: Arc::new(DashMap::new()),
        }
    }
}

impl Default for TerminalState {
    fn default() -> Self {
        Self::new()
    }
}

/// Spawn the per-session writer thread that owns the socket/PTY write half.
/// Dropping all `SyncSender` clones ends the thread (recv disconnects).
fn spawn_session_writer(
    mut writer: Box<dyn Write + Send>,
    session_id: &str,
) -> (SyncSender<Vec<u8>>, Arc<Mutex<Option<String>>>) {
    let (tx, rx) = sync_channel::<Vec<u8>>(WRITE_QUEUE_CAP);
    let last_write_error = Arc::new(Mutex::new(None));
    let err_slot = last_write_error.clone();
    let sid = session_id.to_string();
    thread::spawn(move || {
        while let Ok(data) = rx.recv() {
            let result = writer
                .write_all(&data)
                .and_then(|_| writer.flush())
                .map_err(|e| e.to_string());
            match result {
                Ok(()) => {
                    *err_slot.lock() = None;
                }
                Err(e) => {
                    log_event(
                        "write_failed",
                        &format!("session={sid} err={e}"),
                    );
                    *err_slot.lock() = Some(e);
                    // Stop. A timed-out write_frame can leave a half-frame on
                    // the wire; writing further frames desyncs the daemon
                    // (tag/len bytes become PTY payload, misread T_KILL, …).
                    // SocketWriter/TcpWriter shut the socket down on error so
                    // the reader loop sees EOF and the UI can recover.
                    break;
                }
            }
        }
    });
    (tx, last_write_error)
}

/// Wrap a freshly-opened backend connection in a tracked `PtySession`.
fn build_session(handle: &str, session_id: &str, conn: Connection) -> Arc<PtySession> {
    let (write_tx, last_write_error) = spawn_session_writer(conn.writer, session_id);
    Arc::new(PtySession {
        handle: handle.to_string(),
        master: Arc::new(Mutex::new(conn.master)),
        reader: Arc::new(Mutex::new(conn.reader)),
        write_tx,
        last_write_error,
        child: Some(Arc::new(Mutex::new(conn.child))),
        #[cfg(windows)]
        streaming: Arc::new(AtomicBool::new(false)),
    })
}

/// Add `SILO_BIN` to a session environment that already carries the host's
/// identity stamp. The webview can't resolve Silo's own bin directory, so this
/// is the layer that knows it (RFC 0028).
///
/// Only added to a session Silo is already claiming as its own — an env map
/// with no `SILO` flag is a caller's plain environment and is left untouched.
fn with_bin_dir(
    env: Option<std::collections::HashMap<String, String>>,
) -> Option<std::collections::HashMap<String, String>> {
    let mut env = env?;
    if !env.contains_key("SILO") {
        return Some(env);
    }
    if let Some(bin) = super::cli::managed_bin_dir() {
        env.insert("SILO_BIN".to_string(), bin.to_string_lossy().to_string());
    }
    Some(env)
}

#[tauri::command]
pub fn terminal_create(
    app: tauri::AppHandle,
    state: tauri::State<TerminalState>,
    cwd: String,
    cols: u16,
    rows: u16,
    command: Option<Vec<String>>,
    env: Option<std::collections::HashMap<String, String>>,
) -> Result<String, String> {
    let backend = active_backend();
    let session_id = Uuid::new_v4().to_string();
    let handle = backend.handle_for(&session_id);
    // The host stamps the identity it knows (RFC 0028); `SILO_BIN` is added
    // here because only the native side can resolve the app's own bin
    // directory. Each layer stamps what it actually knows.
    let env = with_bin_dir(env);

    let size = PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    };
    let conn = backend.create(&handle, &cwd, size, command, env)?;

    // Persist the authoritative handle so reattach never has to re-derive it.
    session_registry::save(&session_id, &handle);
    log_event(
        "create",
        &format!("session={} handle={} cwd={}", session_id, handle, cwd),
    );

    let session = build_session(&handle, &session_id, conn);
    state.sessions.insert(session_id.clone(), session.clone());

    // On Unix, start the reader thread immediately. On Windows it is deferred to
    // terminal_start_stream so that JS listen() has time to register before the
    // first bytes (cmd.exe banner) arrive.
    #[cfg(unix)]
    {
        let reader = session.reader.clone();
        let handle_clone = handle.clone();
        let session_id_clone = session_id.clone();
        let app_clone = app.clone();
        let on_gone = evict_on_gone(&state, &session_id, &session);
        thread::spawn(move || {
            run_reader_loop(reader, handle_clone, app_clone, session_id_clone, on_gone);
        });
    }

    // Forward foreground-process updates (RFC 0010 N1) to the frontend.
    if let Some(sub) = backend.subscribe_foreground(&handle) {
        let app_fg = app.clone();
        let sid = session_id.clone();
        let cache = state.fg_cache.clone();
        thread::spawn(move || run_foreground_loop(sub, app_fg, sid, cache));
    }

    Ok(session_id)
}

/// Build the reader loop's `on_gone` callback: evict `session_id` from
/// `state.sessions`, but only if it still points at this exact session — a
/// kill+reattach (or a fresh recreate under the same id) may have already
/// replaced the entry by the time this stream's reader loop notices EOF, and
/// blindly removing by key would evict that newer, live session instead.
fn evict_on_gone(
    state: &TerminalState,
    session_id: &str,
    session: &Arc<PtySession>,
) -> impl FnOnce() + Send + 'static {
    let sessions = state.sessions.clone();
    let session_id = session_id.to_string();
    let session = session.clone();
    move || {
        sessions.remove_if(&session_id, |_, v| Arc::ptr_eq(v, &session));
    }
}

#[tauri::command]
pub fn terminal_write(
    state: tauri::State<TerminalState>,
    sessionId: String,
    data: Vec<u8>,
) -> Result<(), String> {
    // Enqueue only — never block the UI thread on the session socket
    // (RFC 0026 Phase 1). Ordering is preserved by the per-session writer thread.
    let session = state.sessions.get(&sessionId).ok_or("Session not found")?;
    match session.write_tx.try_send(data) {
        Ok(()) => Ok(()),
        Err(TrySendError::Full(_)) => Err("Write queue full".into()),
        Err(TrySendError::Disconnected(_)) => Err("Session writer gone".into()),
    }
}

#[tauri::command]
pub fn terminal_resize(
    state: tauri::State<TerminalState>,
    sessionId: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let session = state.sessions.get(&sessionId).ok_or("Session not found")?;

    let size = PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    };

    let master = session.master.lock();
    master
        .resize(size)
        .map_err(|e| format!("Failed to resize: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn terminal_kill(state: tauri::State<TerminalState>, sessionId: String) -> Result<(), String> {
    let backend = active_backend();
    // Resolve the handle: prefer the persisted mapping, then the live session's
    // recorded handle, finally derivation (legacy sessions).
    let handle = session_registry::load(&sessionId)
        .or_else(|| state.sessions.get(&sessionId).map(|s| s.handle.clone()))
        .unwrap_or_else(|| backend.handle_for(&sessionId));

    // Drop our local attach client first.
    if let Some((_, session)) = state.sessions.remove(&sessionId) {
        if let Some(child) = &session.child {
            let mut child = child.lock();
            let _ = child.kill();
        }
    }

    // Force-terminate the persistent session. Unlike the old "write exit\n"
    // approach, this works even while a foreground program is running in the
    // shell (claude, vim, a dev server, a command mid-run).
    let result = backend.kill(&handle);
    session_registry::remove(&sessionId);
    log_event(
        "kill",
        &format!(
            "session={} handle={} ok={}",
            sessionId,
            handle,
            result.is_ok()
        ),
    );

    result
}

/// Outcome of resolving a session id to an attachable handle: either it's
/// already tracked in memory and live (nothing left to do), or it needs a
/// fresh `backend.attach()` at the returned handle.
#[cfg_attr(test, derive(Debug))]
enum AttachPlan {
    AlreadyLive,
    NeedsAttach(String),
}

/// The handle/liveness resolution at the top of `terminal_attach`, pulled out
/// as a pure function of `backend` + `state` so it's unit-testable without a
/// `tauri::AppHandle`. Detects a dead/missing session up front — attaching to
/// a session that no longer exists must fail with a typed marker (not a fake
/// "Process exited"), so the frontend can show a clear "session no longer
/// exists" state instead — and evicts a stale in-memory entry left after kill
/// / daemon crash. An early-return "already live" here used to skip this
/// check entirely, which made post-kill probes report alive forever.
fn resolve_attach(
    backend: &dyn SessionBackend,
    state: &TerminalState,
    session_id: &str,
) -> Result<AttachPlan, String> {
    // Use the persisted handle; only fall back to derivation for legacy
    // sessions created before the registry existed.
    let handle = session_registry::load(session_id)
        .or_else(|| state.sessions.get(session_id).map(|s| s.handle.clone()))
        .unwrap_or_else(|| backend.handle_for(session_id));

    if !backend.exists(&handle) {
        state.sessions.remove(session_id);
        session_registry::remove(session_id);
        log_event(
            "attach_gone",
            &format!("session={} handle={}", session_id, handle),
        );
        return Err("SESSION_GONE".to_string());
    }

    // Already live in memory (e.g. the app reloaded but the process didn't die)
    // and the daemon still owns the session.
    if state.sessions.contains_key(session_id) {
        return Ok(AttachPlan::AlreadyLive);
    }

    Ok(AttachPlan::NeedsAttach(handle))
}

#[tauri::command]
pub fn terminal_attach(
    app: tauri::AppHandle,
    state: tauri::State<TerminalState>,
    sessionId: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let backend = active_backend();
    let handle = match resolve_attach(backend.as_ref(), &state, &sessionId)? {
        AttachPlan::AlreadyLive => return Ok(()),
        AttachPlan::NeedsAttach(handle) => handle,
    };

    let size = PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    };
    let conn = backend.attach(&handle, size)?;
    session_registry::save(&sessionId, &handle);
    log_event(
        "attach",
        &format!("session={} handle={}", sessionId, handle),
    );

    let session = build_session(&handle, &sessionId, conn);
    state.sessions.insert(sessionId.clone(), session.clone());

    #[cfg(unix)]
    {
        let reader = session.reader.clone();
        let handle_clone = handle.clone();
        let session_id_clone = sessionId.clone();
        let app_clone = app.clone();
        let on_gone = evict_on_gone(&state, &sessionId, &session);
        thread::spawn(move || {
            run_reader_loop(reader, handle_clone, app_clone, session_id_clone, on_gone);
        });
    }

    // Forward foreground-process updates (RFC 0010 N1) to the frontend.
    if let Some(sub) = backend.subscribe_foreground(&handle) {
        let app_fg = app.clone();
        let sid = sessionId.clone();
        let cache = state.fg_cache.clone();
        thread::spawn(move || run_foreground_loop(sub, app_fg, sid, cache));
    }

    Ok(())
}

/// Signal the backend to start forwarding terminal output to the frontend.
///
/// On Windows, the reader thread is intentionally not started during
/// `terminal_create` / `terminal_attach` so that JS has time to register its
/// `listen()` handler before the first bytes arrive (cmd.exe emits its banner
/// in ~5 ms). Call this once immediately after `setupSessionListeners` resolves.
/// On all other platforms this is a no-op.
#[tauri::command]
pub fn terminal_start_stream(
    app: tauri::AppHandle,
    state: tauri::State<TerminalState>,
    sessionId: String,
) -> Result<(), String> {
    #[cfg(not(windows))]
    {
        let _ = (app, state, sessionId);
        return Ok(());
    }
    #[cfg(windows)]
    {
        use std::sync::atomic::Ordering;
        let session = state.sessions.get(&sessionId).ok_or("Session not found")?;
        // Idempotent — only the first caller starts the thread.
        if session.streaming.swap(true, Ordering::AcqRel) {
            return Ok(());
        }
        let reader = session.reader.clone();
        let handle = session.handle.clone();
        let on_gone = evict_on_gone(&state, &sessionId, session.value());
        thread::spawn(move || {
            run_reader_loop(reader, handle, app, sessionId, on_gone);
        });
        Ok(())
    }
}

/// Append a frontend attach/restore diagnostic line to `terminal.log` (same
/// file as host_create / host_attach). Fire-and-forget from the webview so a
/// stalled disk write cannot block restore. Event names use the `ui_` prefix.
#[tauri::command]
pub fn terminal_diag_log(event: String, detail: String) {
    log_event(&event, &detail);
}

/// Persist the frontend's serialized terminal buffer (xterm.js SerializeAddon
/// output) to disk. Called on a throttle and on teardown so a restart can
/// restore the screen + scrollback.
#[tauri::command]
pub fn terminal_save_buffer(sessionId: String, data: String) -> Result<(), String> {
    super::terminal_buffer::save_buffer(&sessionId, &data)
}

/// Return the persisted serialized buffer for a session (empty string if none).
/// The frontend writes this back into a freshly created, same-size terminal.
#[tauri::command]
pub fn terminal_get_buffer(sessionId: String) -> Result<String, String> {
    Ok(super::terminal_buffer::load_buffer(&sessionId).unwrap_or_default())
}

/// Return the last known foreground state for a session, or `null` if none has
/// been received yet. Used by the `ctx.processes` service to seed the initial
/// display without waiting for the next foreground-change event (which may never
/// come if the terminal is idle and nothing changes after the listener registers).
#[tauri::command]
pub fn terminal_foreground_snapshot(
    state: tauri::State<TerminalState>,
    sessionId: String,
) -> Option<ForegroundInfo> {
    state.fg_cache.get(&sessionId).map(|r| r.value().clone())
}

#[cfg(test)]
mod tests {
    use super::super::session_backend::{ForegroundSub, SessionChunk};
    use super::*;

    /// A `SessionBackend` whose `exists()` answer is fixed for the test —
    /// the only thing `resolve_attach` needs to make its decision.
    struct FakeBackend {
        exists: bool,
    }

    impl SessionBackend for FakeBackend {
        fn handle_for(&self, session_id: &str) -> String {
            format!("fake-{session_id}")
        }
        fn create(
            &self,
            _handle: &str,
            _cwd: &str,
            _size: PtySize,
            _command: Option<Vec<String>>,
            _env: Option<std::collections::HashMap<String, String>>,
        ) -> Result<Connection, String> {
            unimplemented!("not exercised by resolve_attach")
        }
        fn attach(&self, _handle: &str, _size: PtySize) -> Result<Connection, String> {
            unimplemented!("not exercised by resolve_attach")
        }
        fn exists(&self, _handle: &str) -> bool {
            self.exists
        }
        fn list(&self) -> Vec<String> {
            vec![]
        }
        fn kill(&self, _handle: &str) -> Result<(), String> {
            Ok(())
        }
        fn subscribe_foreground(&self, _handle: &str) -> Option<Box<dyn ForegroundSub>> {
            None
        }
    }

    struct NoopMaster;
    impl SessionMaster for NoopMaster {
        fn resize(&self, _size: PtySize) -> Result<(), String> {
            Ok(())
        }
    }

    /// A `SessionReader` that is immediately at EOF — the `std::io::empty()`
    /// of the seam.
    struct EmptyReader;

    impl SessionReader for EmptyReader {
        fn read_chunk(&mut self, _buf: &mut [u8]) -> std::io::Result<SessionChunk> {
            Ok(SessionChunk {
                len: 0,
                replay: false,
            })
        }
    }

    /// A tracked-in-memory session with no real backend behind it — enough to
    /// populate `state.sessions` for a test.
    fn fake_session(handle: &str) -> Arc<PtySession> {
        let (write_tx, last_write_error) =
            spawn_session_writer(Box::new(std::io::sink()), "fake");
        Arc::new(PtySession {
            handle: handle.to_string(),
            master: Arc::new(Mutex::new(Box::new(NoopMaster) as Box<dyn SessionMaster>)),
            reader: Arc::new(Mutex::new(
                Box::new(EmptyReader) as Box<dyn SessionReader + Send>
            )),
            write_tx,
            last_write_error,
            child: None,
            #[cfg(windows)]
            streaming: Arc::new(AtomicBool::new(false)),
        })
    }

    /// Redirects `session_registry` to a scratch file for the duration of
    /// `f`, under the crate-wide test lock (see `session_registry::test_lock`).
    fn with_registry(f: impl FnOnce()) {
        let _guard = session_registry::test_lock().lock().unwrap();
        let mut file = std::env::temp_dir();
        file.push(format!(
            "silo-terminal-attach-test-{}.json",
            std::process::id()
        ));
        std::env::set_var("SILO_SESSION_REGISTRY", &file);
        let _ = std::fs::remove_file(&file);
        f();
        let _ = std::fs::remove_file(&file);
        std::env::remove_var("SILO_SESSION_REGISTRY");
    }

    #[test]
    fn dead_backend_evicts_stale_in_memory_entry_and_returns_session_gone() {
        with_registry(|| {
            let state = TerminalState::new();
            session_registry::save("s1", "fake-s1");
            // Simulate exactly the bug this fixes: a session still tracked in
            // memory (e.g. after a daemon crash) whose backend no longer has it.
            state
                .sessions
                .insert("s1".to_string(), fake_session("fake-s1"));

            let backend = FakeBackend { exists: false };
            let result = resolve_attach(&backend, &state, "s1");

            assert_eq!(result.unwrap_err(), "SESSION_GONE");
            assert!(
                !state.sessions.contains_key("s1"),
                "stale entry must be evicted, not left to report alive forever"
            );
            assert_eq!(session_registry::load("s1"), None);
        });
    }

    #[test]
    fn live_backend_with_tracked_session_short_circuits_as_already_live() {
        with_registry(|| {
            let state = TerminalState::new();
            session_registry::save("s2", "fake-s2");
            state
                .sessions
                .insert("s2".to_string(), fake_session("fake-s2"));

            let backend = FakeBackend { exists: true };
            let plan = resolve_attach(&backend, &state, "s2").unwrap();

            assert!(matches!(plan, AttachPlan::AlreadyLive));
            assert!(
                state.sessions.contains_key("s2"),
                "must not evict a live session"
            );
        });
    }

    #[test]
    fn live_backend_without_tracked_session_resolves_to_needs_attach() {
        with_registry(|| {
            let state = TerminalState::new();
            session_registry::save("s3", "fake-s3");

            let backend = FakeBackend { exists: true };
            let plan = resolve_attach(&backend, &state, "s3").unwrap();

            match plan {
                AttachPlan::NeedsAttach(handle) => assert_eq!(handle, "fake-s3"),
                AttachPlan::AlreadyLive => panic!("expected NeedsAttach, not AlreadyLive"),
            }
        });
    }
}
