//! Shared test-only helpers for `crates/pty-host`. `discovery.rs` and
//! `daemon.rs` both need a private, namespace-neutral socket dir to test
//! against — this is the one place that guard lives, so their tests can't
//! race each other over the process-global `XDG_RUNTIME_DIR`/`SILO_PTY_NS`
//! env vars (cargo runs `#[test]`s in parallel threads within one binary).

use std::path::{Path, PathBuf};
use std::sync::Mutex;

static GUARD: Mutex<()> = Mutex::new(());

/// Run `f` with `XDG_RUNTIME_DIR` redirected to a private temp dir and
/// `SILO_PTY_NS` neutralized (unset for the duration, restored after), so
/// `paths::sock_dir()` resolves to `<dir>/silo-pty` regardless of the ambient
/// environment (e.g. a dev shell exporting `SILO_PTY_NS=prod`). Serializes on
/// a shared guard, recovering from a poisoned lock so one failing test
/// doesn't cascade into the rest.
///
/// Short base under `/tmp` — Unix socket paths are capped (~104 bytes on
/// macOS via `sun_path`), so the deeper `std::env::temp_dir()` can overflow.
pub(crate) fn with_temp_dir<T>(tag: &str, f: impl FnOnce(&Path) -> T) -> T {
    let _g = GUARD.lock().unwrap_or_else(|e| e.into_inner());
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
