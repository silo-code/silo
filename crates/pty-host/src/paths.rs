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
/// state, not editable config** (ADR 0022, tier 3), so they live in the OS
/// runtime/temp dir — never under `~/.config/silo`. Prefer `$XDG_RUNTIME_DIR`
/// (Linux — a 0700 tmpfs auto-cleared on logout); otherwise the per-user temp
/// dir `$TMPDIR` (the macOS analog, `/var/folders/…/T`), which is auto-cleaned
/// and short enough to keep socket paths under `sockaddr_un`'s ~104-byte
/// `sun_path` limit; failing both, `/tmp`.
fn base_dir() -> PathBuf {
    resolve_base(
        std::env::var("XDG_RUNTIME_DIR").ok(),
        std::env::var("TMPDIR").ok(),
    )
}

/// Pick the runtime base from env values. Pure, for testing.
fn resolve_base(xdg_runtime_dir: Option<String>, tmpdir: Option<String>) -> PathBuf {
    if let Some(x) = xdg_runtime_dir {
        if !x.is_empty() {
            return PathBuf::from(x).join("silo-pty");
        }
    }
    if let Some(t) = tmpdir {
        if !t.is_empty() {
            return PathBuf::from(t).join("silo-pty");
        }
    }
    PathBuf::from("/tmp").join("silo-pty")
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

    #[test]
    fn base_prefers_xdg_then_tmpdir_then_tmp() {
        // XDG_RUNTIME_DIR wins (Linux).
        assert_eq!(
            resolve_base(Some("/run/user/1000".into()), Some("/var/T".into())),
            PathBuf::from("/run/user/1000/silo-pty")
        );
        // No XDG → TMPDIR (macOS).
        assert_eq!(
            resolve_base(None, Some("/var/folders/ab/cd/T".into())),
            PathBuf::from("/var/folders/ab/cd/T/silo-pty")
        );
        // Empty values are treated as unset.
        assert_eq!(
            resolve_base(Some(String::new()), Some("/var/T".into())),
            PathBuf::from("/var/T/silo-pty")
        );
        // Neither set → /tmp.
        assert_eq!(resolve_base(None, None), PathBuf::from("/tmp/silo-pty"));
        assert_eq!(
            resolve_base(None, Some(String::new())),
            PathBuf::from("/tmp/silo-pty")
        );
    }
}
