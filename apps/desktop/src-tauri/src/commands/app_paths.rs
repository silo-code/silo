// Resolves the root directory for Silo's per-user runtime state: the terminal
// session registry, scrollback buffers, and backend logs.
//
// This lives in the OS application-data directory keyed by the *bundle
// identifier* (on macOS `~/Library/Application Support/com.silo.desktop`, and
// `…/com.silo.desktop.dev` for the "Silo Dev" build), matching where Tauri's
// own plugins (store, window-state) persist. Keying by identity means dev and
// prod never share state — the same isolation principle as `SILO_PTY_NS` (see
// `lib.rs`).
//
// The path is computed once at startup in `run()` and exported as
// `SILO_DATA_DIR`, because the self-forked PTY-host daemon (`main.rs`'s
// `--session-host` branch) has no Tauri `AppHandle` to resolve paths from — it
// inherits the value from the spawning app's environment, exactly like
// `SILO_PTY_NS`.

use std::path::PathBuf;

/// Root directory for Silo's per-user runtime state.
///
/// Prefers `SILO_DATA_DIR` (set at startup from the bundle identifier, and
/// inherited by the PTY-host daemon). Falls back to the production identifier
/// under the OS data dir for processes/tests started without the env set; in
/// that fallback dev/prod isolation is not guaranteed, which is why startup
/// always exports the env explicitly.
pub fn data_dir() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("SILO_DATA_DIR") {
        if !p.is_empty() {
            return Some(PathBuf::from(p));
        }
    }
    dirs::data_dir().map(|d| d.join("com.silo.desktop"))
}

/// Serializes tests across this crate that mutate the process-global
/// `SILO_DATA_DIR` (here and in `terminal_buffer`), since Rust runs `#[test]`s
/// in parallel within a crate. Recover from poisoning so one panicking test
/// doesn't cascade.
#[cfg(test)]
pub(crate) fn env_lock() -> std::sync::MutexGuard<'static, ()> {
    static LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
    LOCK.lock().unwrap_or_else(|e| e.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_from_env_with_prod_fallback() {
        let _g = env_lock();

        // Explicit env wins.
        let mut dir = std::env::temp_dir();
        dir.push(format!("silo-data-dir-test-{}", std::process::id()));
        std::env::set_var("SILO_DATA_DIR", &dir);
        assert_eq!(data_dir(), Some(dir));

        // Empty env is treated as unset → fall back to the prod identifier.
        std::env::set_var("SILO_DATA_DIR", "");
        let resolved = data_dir().expect("a data dir on supported platforms");
        assert!(
            resolved.ends_with("com.silo.desktop"),
            "expected fallback under the prod identifier, got {resolved:?}"
        );

        std::env::remove_var("SILO_DATA_DIR");
    }
}
