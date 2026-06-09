//! Where session sockets live. Private, per-user, `0700`.
//!
//! The dir is **namespaced** by the `SILO_PTY_NS` env var (set by the Silo app
//! to its identity, e.g. "dev" vs "prod") so independent Silo instances never
//! share sockets — a dev build can't list, reap, or attach a production app's
//! sessions, and vice versa. Unset → the base dir (the standalone `pty-host`
//! bin; set `SILO_PTY_NS=dev` to inspect a dev app's sessions).

use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::PathBuf;

/// The un-namespaced base for session sockets. These are **ephemeral runtime
/// state, not editable config**, so prefer the OS runtime dir
/// (`$XDG_RUNTIME_DIR/silo-pty` — a 0700 tmpfs auto-cleared on logout on Linux);
/// otherwise fall back to a dedicated `pty/` subdir of Silo's config root
/// (`~/.config/silo/pty`) so everything stays under one tree on macOS.
fn base_dir() -> PathBuf {
    if let Ok(x) = std::env::var("XDG_RUNTIME_DIR") {
        if !x.is_empty() {
            return PathBuf::from(x).join("silo-pty");
        }
    }
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    PathBuf::from(home).join(".config/silo/pty")
}

/// Apply an optional namespace as a subdir of the base. Pure, for testing.
fn namespaced(base: PathBuf, ns: Option<String>) -> PathBuf {
    match ns {
        Some(n) if !n.is_empty() => base.join(n),
        _ => base,
    }
}

pub fn sock_dir() -> PathBuf {
    namespaced(base_dir(), std::env::var("SILO_PTY_NS").ok())
}

/// Ensure the socket dir exists and is `0700`.
pub fn ensure_dir() -> std::io::Result<PathBuf> {
    let dir = sock_dir();
    fs::create_dir_all(&dir)?;
    let mut perm = fs::metadata(&dir)?.permissions();
    perm.set_mode(0o700);
    fs::set_permissions(&dir, perm)?;
    Ok(dir)
}

pub fn sock_path(name: &str) -> PathBuf {
    sock_dir().join(format!("{name}.sock"))
}

/// Per-session daemon log. The detached daemon's stdout/stderr are redirected
/// here so failures are diagnosable instead of vanishing into `/dev/null`.
pub fn log_path(name: &str) -> PathBuf {
    sock_dir().join(format!("{name}.log"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn namespace_is_a_subdir_when_set() {
        let base = PathBuf::from("/run/silo-pty");
        assert_eq!(
            namespaced(base.clone(), Some("dev".to_string())),
            PathBuf::from("/run/silo-pty/dev")
        );
    }

    #[test]
    fn no_namespace_uses_base() {
        let base = PathBuf::from("/run/silo-pty");
        assert_eq!(namespaced(base.clone(), None), base.clone());
        assert_eq!(namespaced(base.clone(), Some(String::new())), base);
    }
}
