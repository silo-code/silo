//! Where the Control socket lives (RFC 0034 R2).
//!
//! ADR 0022 tier 3 — ephemeral per-user runtime state, alongside the PTY host's
//! session sockets and namespaced the same way. `pty_host::paths::runtime_base`
//! owns the `$XDG_RUNTIME_DIR` → `$TMPDIR` → `/tmp` precedence; this module
//! hangs a **sibling** directory off it rather than reaching inside the PTY
//! namespace, so reaping one never touches the other.
//!
//! - Unix: `<runtime-base>/silo-ctl/<ns>/control.sock`, dir `0700`, socket `0600`.
//! - Windows: `\\.\pipe\silo-control-<ns>`, owner-only security descriptor. No
//!   filesystem path, so the length constraint below does not apply.
//!
//! `silo-ctl` is deliberately short. On macOS the runtime base is
//! `/var/folders/…/T` (~49 chars) and the whole path must stay under
//! `sockaddr_un`'s ~104-byte `sun_path` limit; spelling it `silo-control` would
//! spend 8 of those bytes for nothing.

use std::path::PathBuf;

use crate::commands::identity;

/// The `sun_path` capacity of a `sockaddr_un` on the platforms Silo ships —
/// 104 on macOS/BSD, 108 on Linux. Asserted against the macOS figure because
/// that is the tighter one and the resolved path must fit on both.
/// Asserted against by `resolved_path_fits_sun_path_for_every_platform_default`
/// — overflowing it fails at bind with a bare `EINVAL`, which is a miserable
/// thing to debug, so it is a test rather than a comment.
#[cfg(unix)]
#[allow(dead_code)]
pub const SUN_PATH_LIMIT: usize = 104;

/// The Control directory: `<runtime-base>/silo-ctl/<ns>`.
#[cfg(unix)]
pub fn control_dir() -> PathBuf {
    pty_host::paths::runtime_base()
        .join("silo-ctl")
        .join(identity::ns())
}

/// The Control socket path for this build.
#[cfg(unix)]
pub fn socket_path() -> PathBuf {
    control_dir().join("control.sock")
}

/// Create the Control directory `0700`, returning it.
///
/// `0700` is the outer half of the authorization story: the socket inside is
/// `0600`, and a directory only the owner can traverse means no other user can
/// even reach it to try (R2). Applied explicitly rather than left to the umask,
/// which is a default, not a guarantee.
#[cfg(unix)]
pub fn ensure_dir() -> std::io::Result<PathBuf> {
    use std::os::unix::fs::PermissionsExt;

    let dir = control_dir();
    std::fs::create_dir_all(&dir)?;
    let mut perm = std::fs::metadata(&dir)?.permissions();
    perm.set_mode(0o700);
    std::fs::set_permissions(&dir, perm)?;
    Ok(dir)
}

/// The Windows named-pipe name for this build.
///
/// `pty-host` is a `cfg(unix)` dependency, so this arm resolves the namespace
/// from the identity directly instead of reaching for that crate.
#[cfg(windows)]
pub fn pipe_name() -> String {
    format!(r"\\.\pipe\silo-control-{}", identity::ns())
}

/// The address to bind or connect to, as a printable string.
pub fn endpoint() -> String {
    #[cfg(unix)]
    {
        socket_path().to_string_lossy().into_owned()
    }
    #[cfg(windows)]
    {
        pipe_name()
    }
}

/// [`endpoint`] as an `interprocess` name, for both `bind` and `connect`.
///
/// One builder for both halves on purpose: a listener and a client that
/// disagreed about how to spell the same address would fail as "not running",
/// which is the least debuggable outcome available.
pub fn name() -> std::io::Result<interprocess::local_socket::Name<'static>> {
    #[cfg(unix)]
    {
        use interprocess::local_socket::{GenericFilePath, ToFsName};
        endpoint().to_fs_name::<GenericFilePath>()
    }
    #[cfg(windows)]
    {
        // `\\.\pipe\<name>` already carries the namespace prefix, so it is a
        // *filesystem* name to `interprocess` rather than a namespaced one —
        // which is what lets the listener's security descriptor apply to the
        // pipe we actually named.
        use interprocess::local_socket::ToFsName;
        use interprocess::os::windows::local_socket::NamedPipe;
        endpoint().to_fs_name::<NamedPipe>()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Resolve the socket path with the runtime base redirected to `base` and
    /// the namespace left to this build's identity.
    ///
    /// The design named `pty-host`'s `test_support::with_temp_dir` as the shared
    /// env-redirection helper, but that module is `#[cfg(test)]` inside its own
    /// crate and is therefore unreachable from here. This crate already owns a
    /// serializing guard for process-global env in tests
    /// (`app_paths::env_lock`), so tests here take that instead — same purpose,
    /// and it serializes against the *other* env-mutating tests in this crate,
    /// which a helper in `pty-host` could not.
    #[cfg(unix)]
    fn with_runtime_base<T>(base: &str, f: impl FnOnce() -> T) -> T {
        let _g = crate::commands::app_paths::env_lock();
        let prev_xdg = std::env::var("XDG_RUNTIME_DIR").ok();
        std::env::set_var("XDG_RUNTIME_DIR", base);
        let out = f();
        match prev_xdg {
            Some(v) => std::env::set_var("XDG_RUNTIME_DIR", v),
            None => std::env::remove_var("XDG_RUNTIME_DIR"),
        }
        out
    }

    #[test]
    #[cfg(unix)]
    fn socket_is_a_sibling_of_the_pty_namespace_not_inside_it() {
        with_runtime_base("/run/user/1000", || {
            let sock = socket_path();
            assert_eq!(
                sock,
                PathBuf::from(format!(
                    "/run/user/1000/silo-ctl/{}/control.sock",
                    identity::ns()
                ))
            );
            // Not under silo-pty: a $TMPDIR reap or a PTY-side cleanup of one
            // must never take the other with it.
            assert!(!sock.starts_with("/run/user/1000/silo-pty"));
        });
    }

    #[test]
    #[cfg(unix)]
    fn namespace_separates_dev_from_prod() {
        // Derived from the same `identity::namespace` the PTY sockets use, so a
        // Dev client and a production instance resolve different paths and
        // cannot address each other (R2).
        assert_ne!(
            identity::namespace("com.silo.desktop"),
            identity::namespace("com.silo.desktop.dev")
        );
        let prod = PathBuf::from("/run/user/1000/silo-ctl")
            .join(identity::namespace("com.silo.desktop"))
            .join("control.sock");
        let dev = PathBuf::from("/run/user/1000/silo-ctl")
            .join(identity::namespace("com.silo.desktop.dev"))
            .join("control.sock");
        assert_ne!(prod, dev);
    }

    #[test]
    #[cfg(unix)]
    fn resolved_path_fits_sun_path_for_every_platform_default() {
        // The three bases `pty_host::paths::runtime_base` can pick, with the
        // macOS one at a realistic depth. Overflowing `sun_path` fails at bind
        // with a bare EINVAL, which is a miserable thing to debug — so it is a
        // test, not a comment.
        for base in [
            "/run/user/1000",
            "/var/folders/q7/k8_3n9zs4lb2r0p1x_hy8w7c0000gn/T",
            "/tmp",
        ] {
            let len = with_runtime_base(base, || socket_path().as_os_str().len());
            assert!(
                len < SUN_PATH_LIMIT,
                "{base} resolves to a {len}-byte socket path, over the {SUN_PATH_LIMIT}-byte sun_path limit"
            );
        }
    }

    #[test]
    #[cfg(unix)]
    fn ensure_dir_creates_it_0700() {
        use std::os::unix::fs::PermissionsExt;

        let base = format!("/tmp/silo-ctl-test-{}", std::process::id());
        let _ = std::fs::remove_dir_all(&base);
        let dir = with_runtime_base(&base, || ensure_dir().expect("create the control dir"));
        let mode = std::fs::metadata(&dir).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o700, "control dir mode was {mode:o}");
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    #[cfg(windows)]
    fn pipe_name_is_namespaced() {
        assert!(pipe_name().starts_with(r"\\.\pipe\silo-control-"));
        assert!(pipe_name().ends_with(identity::ns()));
    }
}
