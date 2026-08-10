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

/// Remove socket files whose daemon is gone, plus any `.log`/`.lease`
/// sidecar files left behind with no matching live socket. Returns how many
/// files were reaped. Normally a daemon removes its own sidecars on exit
/// (`teardown_and_exit`); this catches the case it never got the chance to
/// (`SIGKILL`, a crash) — the exact mirror of a daemon's socket outliving it.
/// (`.lease` files were written by interim builds of the abandonment-lease
/// design; nothing writes them anymore, this just sweeps the leftovers.)
pub fn reap_stale() -> usize {
    let mut reaped = 0;
    if let Ok(entries) = std::fs::read_dir(paths::sock_dir()) {
        for e in entries.flatten() {
            let p = e.path();
            let sock = match p.extension().and_then(|s| s.to_str()) {
                Some("sock") => p.clone(),
                Some("log") | Some("lease") => p.with_extension("sock"),
                _ => continue,
            };
            if !is_live(&sock) && std::fs::remove_file(&p).is_ok() {
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
    use crate::test_support::with_temp_dir;
    use std::os::unix::net::UnixListener;

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

    #[test]
    fn reap_stale_removes_orphaned_log_with_no_socket() {
        with_temp_dir("reap-log", |dir| {
            std::fs::write(dir.join("dead.log"), b"").unwrap();
            assert_eq!(reap_stale(), 1);
            assert!(!dir.join("dead.log").exists());
        });
    }

    #[test]
    fn reap_stale_removes_orphaned_lease_with_no_socket() {
        with_temp_dir("reap-lease", |dir| {
            std::fs::write(dir.join("dead.lease"), b"").unwrap();
            assert_eq!(reap_stale(), 1);
            assert!(!dir.join("dead.lease").exists());
        });
    }

    #[test]
    fn reap_stale_keeps_sidecars_for_a_live_socket() {
        with_temp_dir("reap-keep", |dir| {
            let _live = UnixListener::bind(dir.join("live.sock")).unwrap();
            std::fs::write(dir.join("live.log"), b"").unwrap();
            std::fs::write(dir.join("live.lease"), b"").unwrap();
            assert_eq!(reap_stale(), 0);
            assert!(dir.join("live.sock").exists());
            assert!(dir.join("live.log").exists());
            assert!(dir.join("live.lease").exists());
        });
    }
}
