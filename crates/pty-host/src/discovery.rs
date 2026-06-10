//! Session reconciliation: which session sockets are live, and reaping the
//! stale ones a crashed daemon may have left behind. Shared by the standalone
//! `pty-host list` and the Silo `SessionHostBackend` so both agree on liveness.

use crate::paths;
use std::os::unix::net::UnixStream;
use std::path::Path;

/// A session is live iff its socket accepts a connection. A leftover socket
/// file from a crashed daemon refuses (`ECONNREFUSED`), so this also
/// distinguishes live from stale.
pub fn is_live(sock: &Path) -> bool {
    UnixStream::connect(sock).is_ok()
}

/// Live session names (socket stems) in the session dir.
pub fn list_sessions() -> Vec<String> {
    let mut out = Vec::new();
    if let Ok(entries) = std::fs::read_dir(paths::sock_dir()) {
        for e in entries.flatten() {
            let p = e.path();
            if is_session_socket(&p) && is_live(&p) {
                if let Some(name) = p.file_stem().and_then(|s| s.to_str()) {
                    out.push(name.to_string());
                }
            }
        }
    }
    out.sort();
    out
}

/// Remove socket files whose daemon is gone. Returns how many were reaped.
pub fn reap_stale() -> usize {
    let mut reaped = 0;
    if let Ok(entries) = std::fs::read_dir(paths::sock_dir()) {
        for e in entries.flatten() {
            let p = e.path();
            if is_session_socket(&p) && !is_live(&p) && std::fs::remove_file(&p).is_ok() {
                reaped += 1;
            }
        }
    }
    reaped
}

fn is_session_socket(p: &Path) -> bool {
    p.extension().and_then(|s| s.to_str()) == Some("sock")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::net::UnixListener;
    use std::path::PathBuf;

    // These tests bind real sockets but in a private temp dir, overriding the
    // session dir via XDG_RUNTIME_DIR. They serialize on a guard, recovering
    // from a poisoned lock so one failure doesn't cascade into the others. We
    // also neutralize SILO_PTY_NS for the duration: if it's set in the ambient
    // environment (e.g. a dev shell exports SILO_PTY_NS=prod), `sock_dir()`
    // would append that namespace subdir and miss the sockets these tests write
    // at the un-namespaced base.
    fn with_temp_dir<T>(tag: &str, f: impl FnOnce(&Path) -> T) -> T {
        use std::sync::Mutex;
        static GUARD: Mutex<()> = Mutex::new(());
        let _g = GUARD.lock().unwrap_or_else(|e| e.into_inner());
        // Short base under /tmp — Unix socket paths are capped (~104 bytes on
        // macOS), so the deeper `std::env::temp_dir()` can overflow `sun_path`.
        let dir = PathBuf::from("/tmp").join(format!("ph-{}-{}", std::process::id(), tag));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("silo-pty")).unwrap();
        let prev_xdg = std::env::var("XDG_RUNTIME_DIR").ok();
        let prev_ns = std::env::var("SILO_PTY_NS").ok();
        std::env::set_var("XDG_RUNTIME_DIR", &dir);
        std::env::remove_var("SILO_PTY_NS");
        let out = f(&dir.join("silo-pty"));
        match prev_xdg {
            Some(v) => std::env::set_var("XDG_RUNTIME_DIR", v),
            None => std::env::remove_var("XDG_RUNTIME_DIR"),
        }
        if let Some(v) = prev_ns {
            std::env::set_var("SILO_PTY_NS", v);
        }
        let _ = std::fs::remove_dir_all(&dir);
        out
    }

    #[test]
    fn is_live_true_for_bound_socket_false_for_missing() {
        with_temp_dir("live", |dir| {
            let sock = dir.join("a.sock");
            let _listener = UnixListener::bind(&sock).unwrap();
            assert!(is_live(&sock));
            assert!(!is_live(&dir.join("nope.sock")));
        });
    }

    #[test]
    fn list_sessions_returns_only_live_bound_sockets() {
        with_temp_dir("list", |dir| {
            let _live = UnixListener::bind(dir.join("live.sock")).unwrap();
            // A stale socket file with no listener behind it.
            std::fs::write(dir.join("dead.sock"), b"").unwrap();
            assert_eq!(list_sessions(), vec!["live".to_string()]);
        });
    }

    #[test]
    fn reap_stale_removes_only_dead_sockets() {
        with_temp_dir("reap", |dir| {
            let _live = UnixListener::bind(dir.join("live.sock")).unwrap();
            std::fs::write(dir.join("dead.sock"), b"").unwrap();
            assert_eq!(reap_stale(), 1);
            assert!(dir.join("live.sock").exists());
            assert!(!dir.join("dead.sock").exists());
        });
    }
}
