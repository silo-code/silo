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
            // A registry id (`publisher.name`, no separators) installs from the
            // Silo Extension Registry — unless a matching path actually exists,
            // in which case the folder wins (paths are the older contract).
            let resolved = resolve_path(raw, cwd);
            if looks_like_extension_id(raw) && !resolved.exists() {
                return Some(CliRequest {
                    action: "install".to_string(),
                    path: None,
                    kind: None,
                    id: Some(raw.clone()),
                });
            }
            Some(CliRequest {
                action: "install".to_string(),
                path: Some(super::fs::normalize_path(&resolved)),
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
                path: Some(super::fs::normalize_path(&resolved)),
                kind: Some(kind.to_string()),
                id: None,
            })
        }
    }
}

/// Whether an install argument reads as a registry extension id
/// (`<publisher>.<name>`, lowercase, no path separators) rather than a path.
fn looks_like_extension_id(raw: &str) -> bool {
    if raw.contains('/') || raw.contains('\\') {
        return false;
    }
    let Some((publisher, name)) = raw.split_once('.') else {
        return false;
    };
    let ok_publisher = !publisher.is_empty()
        && publisher.starts_with(|c: char| c.is_ascii_lowercase() || c.is_ascii_digit())
        && publisher
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-');
    let ok_name = !name.is_empty()
        && name.starts_with(|c: char| c.is_ascii_lowercase() || c.is_ascii_digit())
        && name
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '.' || c == '-' || c == '_');
    ok_publisher && ok_name
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

    let shim = write_shim(&bin_dir, &exe).map_err(|e| e.to_string())?;

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

/// Silo's **own** bin directory — `<app-data>/bin` — where it keeps a `silo`
/// shim for its own terminals (RFC 0028). Distinct from
/// [`cli_install_shim`]'s `~/.local/bin`, which is the user's PATH and only
/// written when they ask for it.
///
/// `data_dir()` is already keyed by bundle identifier, so "Silo Dev" and
/// production get separate directories — and therefore separate shims pointing
/// at their own binaries — with no extra path logic.
pub fn managed_bin_dir() -> Option<PathBuf> {
    super::app_paths::data_dir().map(|d| d.join("bin"))
}

/// The text of a shim that execs the app binary, passing arguments through.
fn shim_script(exe: &Path) -> String {
    if cfg!(windows) {
        format!("@echo off\r\n\"{}\" %*\r\n", exe.display())
    } else {
        format!("#!/bin/sh\nexec \"{}\" \"$@\"\n", exe.display())
    }
}

/// File name of the shim on this platform.
fn shim_name() -> &'static str {
    if cfg!(windows) {
        "silo.cmd"
    } else {
        "silo"
    }
}

/// Write the managed `silo` shim into Silo's own bin directory, returning that
/// directory so it can be put on `PATH` for Silo's terminals.
///
/// Called at every app start. The shim embeds an absolute path to the app
/// binary, which goes stale when the app updates or the user moves it —
/// rewriting unconditionally is a single small write on a path we already
/// compute, and it makes that whole class of staleness impossible rather than
/// merely detectable.
///
/// Best-effort: a failure here costs the bundled `silo` command inside
/// terminals, nothing else, so it never blocks startup.
pub fn ensure_managed_shim() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let bin_dir = managed_bin_dir()?;
    std::fs::create_dir_all(&bin_dir).ok()?;
    write_shim(&bin_dir, &exe).ok()?;
    Some(bin_dir)
}

/// Write an executable `silo` shim for `exe` into `bin_dir`, returning its path.
///
/// The write goes to a temporary file and is then **renamed** over the target.
/// A plain `fs::write` truncates in place, and this runs on every app launch —
/// a shell that happens to be executing the shim at that moment would read a
/// half-written script. Rename is atomic, so a concurrent exec sees either the
/// old shim or the new one.
fn write_shim(bin_dir: &Path, exe: &Path) -> std::io::Result<PathBuf> {
    let shim = bin_dir.join(shim_name());
    let tmp = bin_dir.join(format!("{}.{}.tmp", shim_name(), std::process::id()));
    std::fs::write(&tmp, shim_script(exe))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&tmp, std::fs::Permissions::from_mode(0o755))?;
    }
    match std::fs::rename(&tmp, &shim) {
        Ok(()) => Ok(shim),
        Err(e) => {
            let _ = std::fs::remove_file(&tmp);
            Err(e)
        }
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

    #[test]
    fn install_registry_id_when_no_such_path() {
        // "silo.system-monitor" reads as an id and nothing exists at that
        // relative path → registry install.
        let req =
            resolve_cli_request(&argv(&["install", "silo.system-monitor"]), "/no/such/cwd")
                .unwrap();
        assert_eq!(req.action, "install");
        assert_eq!(req.id.unwrap(), "silo.system-monitor");
        assert!(req.path.is_none());
    }

    #[test]
    fn install_existing_path_beats_registry_id() {
        // A real directory whose name also parses as an id installs as a folder.
        let dir = std::env::temp_dir().join("acme.clock");
        std::fs::create_dir_all(&dir).unwrap();
        let req = resolve_cli_request(
            &argv(&["install", "acme.clock"]),
            &std::env::temp_dir().to_string_lossy(),
        )
        .unwrap();
        assert!(req.id.is_none());
        assert!(req.path.unwrap().ends_with("acme.clock"));
        let _ = std::fs::remove_dir(&dir);
    }

    #[test]
    fn looks_like_extension_id_rules() {
        assert!(looks_like_extension_id("acme.weather"));
        assert!(looks_like_extension_id("silo.system-monitor"));
        assert!(looks_like_extension_id("a1.b_c.d"));
        assert!(!looks_like_extension_id("no-dot"));
        assert!(!looks_like_extension_id("Acme.weather")); // ids are lowercase
        assert!(!looks_like_extension_id("./relative.path"));
        assert!(!looks_like_extension_id("dir/file.ext"));
        assert!(!looks_like_extension_id(".hidden"));
    }
}
