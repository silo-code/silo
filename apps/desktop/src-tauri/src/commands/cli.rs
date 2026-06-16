//! `silo <path>` terminal entry point.
//!
//! Launching the `silo` binary a second time is forwarded to the already-running
//! instance by `tauri-plugin-single-instance` (registered in `lib.rs`): the
//! plugin hands us the second process's `argv` + `cwd`, we focus the window and
//! emit a `cli:open` event the webview acts on. A *cold* launch (no instance yet)
//! stashes the resolved arg in [`PendingLaunchArg`] for the webview to drain via
//! [`cli_consume_launch_args`] once it's ready — avoiding the race where the emit
//! lands before any listener exists.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::{AppHandle, Manager, State};

/// A resolved CLI path argument handed to the webview. `kind` is `"dir"`,
/// `"file"`, or `"missing"`.
#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub struct CliOpenRequest {
    pub path: String,
    pub kind: String,
}

/// Cold-launch holding cell: the path arg parsed in `setup`, kept until the
/// webview pulls it via [`cli_consume_launch_args`]. Warm launches go straight
/// through the `cli:open` event and never touch this.
#[derive(Default)]
pub struct PendingLaunchArg(pub Mutex<Option<CliOpenRequest>>);

/// Resolve the first positional CLI argument into an absolute path + kind.
///
/// Skips `argv[0]` (the program path) and any `-`/`--flag` tokens (the
/// `--session-host` daemon fork never reaches here, but we stay defensive).
/// Returns `None` when no path was given — bare `silo`, which should only focus
/// the window. Relative paths are joined against `cwd`; existing paths are
/// canonicalized so `.`/`..`/symlinks resolve to the same string a stored
/// workspace folder would have.
pub fn resolve_cli_arg(argv: &[String], cwd: &str) -> Option<CliOpenRequest> {
    let raw = argv.iter().skip(1).find(|a| !a.starts_with('-'))?;
    let p = Path::new(raw);
    let abs: PathBuf = if p.is_absolute() {
        p.to_path_buf()
    } else {
        Path::new(cwd).join(p)
    };
    let resolved = std::fs::canonicalize(&abs).unwrap_or(abs);
    let kind = match std::fs::metadata(&resolved) {
        Ok(meta) if meta.is_dir() => "dir",
        Ok(_) => "file",
        Err(_) => "missing",
    };
    Some(CliOpenRequest {
        path: resolved.to_string_lossy().into_owned(),
        kind: kind.to_string(),
    })
}

/// Bring the main window to the foreground (best-effort; ignores errors).
pub fn focus_main_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
    }
}

/// Drain the cold-launch path arg. The webview calls this once on startup; the
/// `take` makes a later reload not replay the open.
#[tauri::command]
pub fn cli_consume_launch_args(state: State<'_, PendingLaunchArg>) -> Option<CliOpenRequest> {
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
        assert!(resolve_cli_arg(&argv(&[]), "/tmp").is_none());
    }

    #[test]
    fn skips_leading_flags() {
        assert!(resolve_cli_arg(&argv(&["--foo", "-x"]), "/tmp").is_none());
    }

    #[test]
    fn joins_relative_path_against_cwd() {
        // A path that doesn't exist on disk falls through to the lexical join and
        // is reported as "missing" — but it's still resolved relative to cwd.
        let req = resolve_cli_arg(&argv(&["sub/dir"]), "/tmp/some-cwd").unwrap();
        assert_eq!(req.path, "/tmp/some-cwd/sub/dir");
        assert_eq!(req.kind, "missing");
    }

    #[test]
    fn keeps_absolute_path() {
        let req = resolve_cli_arg(&argv(&["/no/such/path"]), "/tmp").unwrap();
        assert_eq!(req.path, "/no/such/path");
        assert_eq!(req.kind, "missing");
    }

    #[test]
    fn classifies_existing_dir_and_file() {
        let dir = std::env::temp_dir();
        let dir_req = resolve_cli_arg(&argv(&[&dir.to_string_lossy()]), "/").unwrap();
        assert_eq!(dir_req.kind, "dir");

        let file = dir.join("silo-cli-test-marker.txt");
        std::fs::write(&file, b"x").unwrap();
        let file_req = resolve_cli_arg(&argv(&[&file.to_string_lossy()]), "/").unwrap();
        assert_eq!(file_req.kind, "file");
        let _ = std::fs::remove_file(&file);
    }
}
