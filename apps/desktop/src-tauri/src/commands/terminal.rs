use dashmap::DashMap;
use parking_lot::Mutex;
use portable_pty::PtySize;
use std::io::{Read, Write};
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use std::thread;
use uuid::Uuid;

use super::session_backend::{
    active_backend, log_event, Connection, SessionChild, SessionMaster,
};
use super::session_registry;
use super::terminal_io::{run_foreground_loop, run_reader_loop};

// This module is backend-agnostic: all backend-specific behavior lives behind
// the `SessionBackend` trait in `session_backend.rs`. The persistent handle for
// each session is stored in `session_registry` at create time and looked up on
// reattach — never re-derived — so a future rename or backend swap can't strand
// live sessions.

struct PtySession {
    handle: String,
    master: Arc<Mutex<Box<dyn SessionMaster>>>,
    reader: Arc<Mutex<Box<dyn Read + Send>>>,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    child: Option<Arc<Mutex<Box<dyn SessionChild>>>>,
    // On Windows, reader thread is deferred until terminal_start_stream to avoid
    // the blank-canvas race (cmd.exe emits its banner in ~5 ms, before JS
    // listen() completes). The bool is set to true exactly once when the thread
    // is actually spawned; terminal_start_stream is idempotent.
    #[cfg(windows)]
    streaming: Arc<AtomicBool>,
}

#[derive(Clone)]
pub struct TerminalState(Arc<DashMap<String, Arc<PtySession>>>);

impl TerminalState {
    pub fn new() -> Self {
        TerminalState(Arc::new(DashMap::new()))
    }
}

impl Default for TerminalState {
    fn default() -> Self {
        Self::new()
    }
}

/// Wrap a freshly-opened backend connection in a tracked `PtySession`.
fn build_session(handle: &str, conn: Connection) -> Arc<PtySession> {
    Arc::new(PtySession {
        handle: handle.to_string(),
        master: Arc::new(Mutex::new(conn.master)),
        reader: Arc::new(Mutex::new(conn.reader)),
        writer: Arc::new(Mutex::new(conn.writer)),
        child: Some(Arc::new(Mutex::new(conn.child))),
        #[cfg(windows)]
        streaming: Arc::new(AtomicBool::new(false)),
    })
}

#[tauri::command]
pub fn terminal_create(
    app: tauri::AppHandle,
    state: tauri::State<TerminalState>,
    cwd: String,
    cols: u16,
    rows: u16,
    command: Option<Vec<String>>,
) -> Result<String, String> {
    let backend = active_backend();
    let session_id = Uuid::new_v4().to_string();
    let handle = backend.handle_for(&session_id);

    let size = PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    };
    let conn = backend.create(&handle, &cwd, size, command)?;

    // Persist the authoritative handle so reattach never has to re-derive it.
    session_registry::save(&session_id, &handle);
    log_event(
        "create",
        &format!("session={} handle={} cwd={}", session_id, handle, cwd),
    );

    let session = build_session(&handle, conn);
    state.0.insert(session_id.clone(), session.clone());

    // On Unix, start the reader thread immediately. On Windows it is deferred to
    // terminal_start_stream so that JS listen() has time to register before the
    // first bytes (cmd.exe banner) arrive.
    #[cfg(unix)]
    {
        let reader = session.reader.clone();
        let handle_clone = handle.clone();
        let session_id_clone = session_id.clone();
        let app_clone = app.clone();
        thread::spawn(move || {
            run_reader_loop(reader, handle_clone, app_clone, session_id_clone);
        });
    }

    // Forward foreground-process updates (RFC 0010 N1) to the frontend.
    if let Some(sub) = backend.subscribe_foreground(&handle) {
        let app_fg = app.clone();
        let sid = session_id.clone();
        thread::spawn(move || run_foreground_loop(sub, app_fg, sid));
    }

    Ok(session_id)
}

#[tauri::command]
pub fn terminal_write(
    state: tauri::State<TerminalState>,
    sessionId: String,
    data: Vec<u8>,
) -> Result<(), String> {
    let session = state.0.get(&sessionId).ok_or("Session not found")?;

    let mut writer = session.writer.lock();
    writer
        .write_all(&data)
        .map_err(|e| format!("Failed to write: {}", e))?;
    writer.flush().map_err(|e| format!("Failed to flush: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn terminal_resize(
    state: tauri::State<TerminalState>,
    sessionId: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let session = state.0.get(&sessionId).ok_or("Session not found")?;

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
pub fn terminal_kill(
    state: tauri::State<TerminalState>,
    sessionId: String,
) -> Result<(), String> {
    let backend = active_backend();
    // Resolve the handle: prefer the persisted mapping, then the live session's
    // recorded handle, finally derivation (legacy sessions).
    let handle = session_registry::load(&sessionId)
        .or_else(|| state.0.get(&sessionId).map(|s| s.handle.clone()))
        .unwrap_or_else(|| backend.handle_for(&sessionId));

    // Drop our local attach client first.
    if let Some((_, session)) = state.0.remove(&sessionId) {
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

#[tauri::command]
pub fn terminal_attach(
    app: tauri::AppHandle,
    state: tauri::State<TerminalState>,
    sessionId: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    // Already live in memory (e.g. the app reloaded but the process didn't die).
    if state.0.contains_key(&sessionId) {
        return Ok(());
    }

    let backend = active_backend();
    // Use the persisted handle; only fall back to derivation for legacy sessions
    // created before the registry existed.
    let handle = session_registry::load(&sessionId).unwrap_or_else(|| backend.handle_for(&sessionId));

    // Detect a dead/missing session up front. Attaching to a session that no
    // longer exists must fail with a typed marker (not a fake "Process exited"),
    // so the frontend can show a clear "session no longer exists" state instead.
    if !backend.exists(&handle) {
        log_event(
            "attach_gone",
            &format!("session={} handle={}", sessionId, handle),
        );
        return Err("SESSION_GONE".to_string());
    }

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

    let session = build_session(&handle, conn);
    state.0.insert(sessionId.clone(), session.clone());

    #[cfg(unix)]
    {
        let reader = session.reader.clone();
        let handle_clone = handle.clone();
        let session_id_clone = sessionId.clone();
        let app_clone = app.clone();
        thread::spawn(move || {
            run_reader_loop(reader, handle_clone, app_clone, session_id_clone);
        });
    }

    // Forward foreground-process updates (RFC 0010 N1) to the frontend.
    if let Some(sub) = backend.subscribe_foreground(&handle) {
        let app_fg = app.clone();
        let sid = sessionId.clone();
        thread::spawn(move || run_foreground_loop(sub, app_fg, sid));
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
        let session = state.0.get(&sessionId).ok_or("Session not found")?;
        // Idempotent — only the first caller starts the thread.
        if session.streaming.swap(true, Ordering::AcqRel) {
            return Ok(());
        }
        let reader = session.reader.clone();
        let handle = session.handle.clone();
        thread::spawn(move || {
            run_reader_loop(reader, handle, app, sessionId);
        });
        Ok(())
    }
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
