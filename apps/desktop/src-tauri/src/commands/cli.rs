//! `silo` terminal entry point — path open, extension install/uninstall.
//!
//! Launching the `silo` binary a second time is forwarded to the already-running
//! instance by `tauri-plugin-single-instance` (registered in `lib.rs`): the
//! plugin hands us the second process's `argv` + `cwd`, we focus the window and
//! emit a `cli:open` event the webview acts on. A *cold* launch (no instance yet)
//! stashes the resolved request in [`PendingLaunchArg`] for the webview to drain via
//! [`cli_consume_launch_args`] once it's ready — avoiding the race where the emit
//! lands before any listener exists.
//!
//! Subcommands:
//! - `silo <path>`                 — open path (dir, file, or missing)
//! - `silo install <path>`         — install extension from folder
//! - `silo uninstall <id>`         — uninstall extension by id

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::{AppHandle, Manager, State};

/// A resolved CLI request. `action` is `"open"`, `"install"`, or `"uninstall"`.
#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub struct CliRequest {
    pub action: String,
    /// Resolved absolute path — set for `"open"` and `"install"`.
    pub path: Option<String>,
    /// `"dir"`, `"file"`, or `"missing"` — only set for `"open"`.
    pub kind: Option<String>,
    /// Extension id — only set for `"uninstall"`.
    pub id: Option<String>,
}

/// Cold-launch holding cell: the request parsed in `setup`, kept until the
/// webview pulls it via [`cli_consume_launch_args`]. Warm launches go straight
/// through the `cli:open` event and never touch this.
#[derive(Default)]
pub struct PendingLaunchArg(pub Mutex<Option<CliRequest>>);

/// Resolve an `argv` + `cwd` pair into a structured [`CliRequest`].
///
/// - `silo install <path>` → `{ action: "install", path: <abs> }`
/// - `silo uninstall <id>` → `{ action: "uninstall", id: <id> }`
/// - `silo <path>` → `{ action: "open", path: <abs>, kind: "dir"|"file"|"missing" }`
/// - `silo` (bare) → `None` (only focus the window)
pub fn resolve_cli_request(argv: &[String], cwd: &str) -> Option<CliRequest> {
    let mut pos = argv.iter().skip(1).filter(|a| !a.starts_with('-'));
    let first = pos.next()?;

    match first.as_str() {
        "install" => {
            let raw = pos.next()?;
            let resolved = resolve_path(raw, cwd);
            Some(CliRequest {
                action: "install".to_string(),
                path: Some(resolved.to_string_lossy().into_owned()),
                kind: None,
                id: None,
            })
        }
        "uninstall" => {
            let id = pos.next()?.clone();
            Some(CliRequest {
                action: "uninstall".to_string(),
                path: None,
                kind: None,
                id: Some(id),
            })
        }
        raw => {
            let resolved = resolve_path(raw, cwd);
            let kind = match std::fs::metadata(&resolved) {
                Ok(meta) if meta.is_dir() => "dir",
                Ok(_) => "file",
                Err(_) => "missing",
            };
            Some(CliRequest {
                action: "open".to_string(),
                path: Some(resolved.to_string_lossy().into_owned()),
                kind: Some(kind.to_string()),
                id: None,
            })
        }
    }
}

/// Resolve a raw CLI path token to an absolute, canonicalized path.
fn resolve_path(raw: &str, cwd: &str) -> PathBuf {
    let p = Path::new(raw);
    let abs: PathBuf = if p.is_absolute() {
        p.to_path_buf()
    } else {
        Path::new(cwd).join(p)
    };
    std::fs::canonicalize(&abs).unwrap_or(abs)
}

/// Bring the main window to the foreground (best-effort; ignores errors).
pub fn focus_main_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
    }
}

/// Drain the cold-launch request. The webview calls this once on startup; the
/// `take` makes a later reload not replay the action.
#[tauri::command]
pub fn cli_consume_launch_args(state: State<'_, PendingLaunchArg>) -> Option<CliRequest> {
    state.0.lock().ok().and_then(|mut guard| guard.take())
}

/// Install a `silo` shim onto the user's PATH (`~/.local/bin/silo`) that execs
/// the running app binary, so `silo <path>` works from any shell. Returns a
/// human-readable status string (with a PATH hint when `~/.local/bin` isn't on
/// `$PATH`). Backs the in-app "Install `silo` command" action.
#[tauri::command]
pub fn cli_install_shim() -> Result<String, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let home = dirs::home_dir().ok_or("could not resolve home directory")?;
    let bin_dir = home.join(".local").join("bin");
    std::fs::create_dir_all(&bin_dir).map_err(|e| e.to_string())?;

    let shim = bin_dir.join("silo");
    let script = format!("#!/bin/sh\nexec \"{}\" \"$@\"\n", exe.display());
    std::fs::write(&shim, script).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&shim, std::fs::Permissions::from_mode(0o755))
            .map_err(|e| e.to_string())?;
    }

    let on_path = std::env::var("PATH")
        .map(|p| std::env::split_paths(&p).any(|d| d == bin_dir))
        .unwrap_or(false);
    if on_path {
        Ok(format!("Installed the `silo` command to {}.", shim.display()))
    } else {
        Ok(format!(
            "Installed `silo` to {} — add {} to your PATH to use it.",
            shim.display(),
            bin_dir.display()
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn argv(args: &[&str]) -> Vec<String> {
        std::iter::once("/Applications/Silo.app/Contents/MacOS/silo")
            .chain(args.iter().copied())
            .map(String::from)
            .collect()
    }

    #[test]
    fn bare_invocation_has_no_request() {
        assert!(resolve_cli_request(&argv(&[]), "/tmp").is_none());
    }

    #[test]
    fn skips_leading_flags() {
        assert!(resolve_cli_request(&argv(&["--foo", "-x"]), "/tmp").is_none());
    }

    #[test]
    fn open_joins_relative_path_against_cwd() {
        let req = resolve_cli_request(&argv(&["sub/dir"]), "/tmp/some-cwd").unwrap();
        assert_eq!(req.action, "open");
        assert_eq!(req.path.unwrap(), "/tmp/some-cwd/sub/dir");
        assert_eq!(req.kind.unwrap(), "missing");
    }

    #[test]
    fn open_keeps_absolute_path() {
        let req = resolve_cli_request(&argv(&["/no/such/path"]), "/tmp").unwrap();
        assert_eq!(req.action, "open");
        assert_eq!(req.path.unwrap(), "/no/such/path");
        assert_eq!(req.kind.unwrap(), "missing");
    }

    #[test]
    fn open_classifies_existing_dir_and_file() {
        let dir = std::env::temp_dir();
        let dir_req =
            resolve_cli_request(&argv(&[&dir.to_string_lossy()]), "/").unwrap();
        assert_eq!(dir_req.action, "open");
        assert_eq!(dir_req.kind.unwrap(), "dir");

        let file = dir.join("silo-cli-test-marker.txt");
        std::fs::write(&file, b"x").unwrap();
        let file_req =
            resolve_cli_request(&argv(&[&file.to_string_lossy()]), "/").unwrap();
        assert_eq!(file_req.action, "open");
        assert_eq!(file_req.kind.unwrap(), "file");
        let _ = std::fs::remove_file(&file);
    }

    #[test]
    fn install_resolves_absolute_path() {
        // Use a path that definitely doesn't exist so canonicalize() falls back to
        // the lexical path (avoids macOS /tmp → /private/tmp symlink expansion).
        let req =
            resolve_cli_request(&argv(&["install", "/no/such/silo-ext/dave.clock"]), "/")
                .unwrap();
        assert_eq!(req.action, "install");
        assert_eq!(req.path.unwrap(), "/no/such/silo-ext/dave.clock");
        assert!(req.kind.is_none());
        assert!(req.id.is_none());
    }

    #[test]
    fn install_resolves_relative_path() {
        let req =
            resolve_cli_request(&argv(&["install", "my-ext"]), "/home/dave").unwrap();
        assert_eq!(req.action, "install");
        assert_eq!(req.path.unwrap(), "/home/dave/my-ext");
    }

    #[test]
    fn install_no_path_returns_none() {
        // `silo install` with no path argument — nothing to do
        assert!(resolve_cli_request(&argv(&["install"]), "/").is_none());
    }

    #[test]
    fn uninstall_captures_id() {
        let req =
            resolve_cli_request(&argv(&["uninstall", "dave.clock"]), "/").unwrap();
        assert_eq!(req.action, "uninstall");
        assert_eq!(req.id.unwrap(), "dave.clock");
        assert!(req.path.is_none());
        assert!(req.kind.is_none());
    }

    #[test]
    fn uninstall_no_id_returns_none() {
        assert!(resolve_cli_request(&argv(&["uninstall"]), "/").is_none());
    }
}
