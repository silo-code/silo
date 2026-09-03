//! The build's **identity** — its bundle identifier, and the two per-user roots
//! derived from it.
//!
//! Silo keys every private tier by identity so "Silo Dev"
//! (`com.silo.desktop.dev`) and production "Silo" (`com.silo.desktop`) never
//! share sockets, session state, or config (ADR 0022). Until RFC 0034 the app
//! read that identifier from the Tauri context inside `run()` and exported the
//! derived roots as env vars (`SILO_PTY_NS`, `SILO_DATA_DIR`,
//! `SILO_CONFIG_ROOT`) for its own subprocesses.
//!
//! The Control API's client half runs in `main.rs` *before* Tauri init, in a
//! process the app never spawned — so it has no `AppHandle` to read and no
//! inherited env to trust. This module is the identifier without either:
//! [`IDENTIFIER`] is baked in at compile time by `build.rs` from the same Tauri
//! config the app is built from, so the client and the instance it talks to
//! agree by construction.

use std::path::PathBuf;

/// This build's bundle identifier — `com.silo.desktop` for production,
/// `com.silo.desktop.dev` for "Silo Dev", `com.silo.desktop.nightly` for
/// nightly. Resolved by `build.rs` from `tauri.conf.json` plus the Tauri CLI's
/// `--config` override, so it matches `app.config().identifier` exactly.
pub const IDENTIFIER: &str = env!("SILO_IDENTIFIER");

/// The socket namespace for an identifier: the `SILO_PTY_NS` value `lib.rs`
/// exports, and the same segment the Control socket sits under.
///
/// Reusing one namespace for both is what guarantees a Dev client and a
/// production instance can never address each other (RFC 0034 R2) — a second,
/// independently-derived namespace could drift into agreeing.
pub fn namespace(identifier: &str) -> &str {
    if identifier == "com.silo.desktop" {
        "prod"
    } else {
        identifier
            .strip_prefix("com.silo.desktop.")
            .unwrap_or("other")
    }
}

/// This build's socket namespace.
pub fn ns() -> &'static str {
    namespace(IDENTIFIER)
}

/// Map a bundle identifier to its user-config root folder name under
/// `~/.config` — must mirror `configRootName` in
/// `packages/extension-host/src/services/user-config.ts` exactly, since the
/// workspace files under that root are written by TypeScript and read by Rust
/// (the session-maintenance sweep, and `silo ws list`).
pub fn config_root_name(identifier: &str) -> String {
    const STABLE: &str = "com.silo.desktop";
    if identifier == STABLE {
        return "silo".to_string();
    }
    let suffix = identifier
        .strip_prefix("com.silo.desktop.")
        .unwrap_or(identifier);
    format!("silo-{suffix}")
}

/// The TS-owned user-config root — `~/.config/silo[-suffix]`, or the
/// `SILO_CONFIG_DIR` override. Must resolve to the same directory
/// `user-config.ts` writes to, since `silo ws list` reads the workspace files
/// it persists there (RFC 0034 R10).
///
/// Deliberately does *not* consult `SILO_CONFIG_ROOT`: that env var is exported
/// by the app for its own subprocesses, and a `silo` invocation from an
/// unrelated shell has no reason to have it. Resolving from scratch means the
/// client answers the same way whether or not it was launched from inside Silo.
pub fn config_root() -> Option<PathBuf> {
    if let Ok(dir) = std::env::var("SILO_CONFIG_DIR") {
        if !dir.is_empty() {
            return Some(PathBuf::from(dir));
        }
    }
    dirs::home_dir().map(|home| home.join(".config").join(config_root_name(IDENTIFIER)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn namespace_maps_stable_to_prod_and_suffixes_to_themselves() {
        assert_eq!(namespace("com.silo.desktop"), "prod");
        assert_eq!(namespace("com.silo.desktop.dev"), "dev");
        assert_eq!(namespace("com.silo.desktop.nightly"), "nightly");
    }

    #[test]
    fn namespace_falls_back_for_an_unrecognized_identifier() {
        // Never a panic and never an empty segment — an unknown identifier gets
        // its own bucket rather than silently landing in production's.
        assert_eq!(namespace("com.example.other"), "other");
        assert_eq!(namespace(""), "other");
    }

    #[test]
    fn identifier_is_baked_in_and_is_a_silo_identity() {
        // build.rs resolves this from the Tauri config; an empty or foreign
        // value means the merge broke, which would silently cross dev and prod.
        assert!(
            IDENTIFIER.starts_with("com.silo.desktop"),
            "unexpected SILO_IDENTIFIER {IDENTIFIER:?}"
        );
        assert_ne!(ns(), "other");
    }

    #[test]
    fn config_root_name_mirrors_ts_mapping() {
        assert_eq!(config_root_name("com.silo.desktop"), "silo");
        assert_eq!(config_root_name("com.silo.desktop.dev"), "silo-dev");
        assert_eq!(
            config_root_name("com.example.other"),
            "silo-com.example.other"
        );
    }

    #[test]
    fn config_root_honours_the_override() {
        let _g = super::super::app_paths::env_lock();
        let prev = std::env::var("SILO_CONFIG_DIR").ok();

        std::env::set_var("SILO_CONFIG_DIR", "/tmp/silo-config-override");
        assert_eq!(
            config_root(),
            Some(PathBuf::from("/tmp/silo-config-override"))
        );

        // Empty is treated as unset, so it falls back to ~/.config/silo*.
        std::env::set_var("SILO_CONFIG_DIR", "");
        let resolved = config_root().expect("a home dir on supported platforms");
        assert!(
            resolved
                .file_name()
                .and_then(|s| s.to_str())
                .is_some_and(|name| name.starts_with("silo")),
            "expected a silo config root, got {resolved:?}"
        );

        match prev {
            Some(v) => std::env::set_var("SILO_CONFIG_DIR", v),
            None => std::env::remove_var("SILO_CONFIG_DIR"),
        }
    }
}
