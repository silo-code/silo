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
//! Subcommands (the grammar is ADR 0047 — reserved nouns, frozen shorthands,
//! `--ws` on workspace-scoped verbs):
//! - `silo <path>`                 — open path (dir, file, or missing)
//! - `silo install <path>`         — install extension from folder (shorthand)
//! - `silo uninstall <id>`         — uninstall extension by id (shorthand)
//!
//! `agent` and `ws` are **reserved nouns**: `silo agent <anything>` and
//! `silo ws <anything>` are never a path, so a folder of either name is reached
//! as `./agent` or `silo -- agent`.
//!
//! The **Control** commands — `silo status`, `silo ws list`, `silo agent run` —
//! do not go through this module's Forward path at all. They are parsed and
//! answered by `commands::control::client` before Tauri init, so they can report
//! a result and a real exit code (RFC 0034). What survives here for those nouns
//! is the usage report for a bare or unknown verb, which is what keeps
//! `silo ws open` from silently opening a folder named `ws`.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::{AppHandle, Manager, State};

/// A resolved CLI request. `action` is `"open"`, `"install"`, `"uninstall"`,
/// `"agent-usage"`, or `"ws-usage"`.
#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub struct CliRequest {
    pub action: String,
    /// Resolved absolute path — set for `"open"` and `"install"`.
    pub path: Option<String>,
    /// `"dir"`, `"file"`, or `"missing"` — only set for `"open"`.
    pub kind: Option<String>,
    /// Extension id for `"uninstall"`; the unrecognized verb, when there was
    /// one, for `"agent-usage"` / `"ws-usage"`.
    pub id: Option<String>,
    /// An explicit `--ws <folder|.|ws_<uuid>>` target (ADR 0047). A folder is
    /// resolved to an absolute path here; a `ws_`-prefixed value is passed
    /// through as an id. `None` means "infer from cwd". Unused by the Forward
    /// commands that remain; kept because the field is part of the `cli:open`
    /// payload shape.
    pub ws: Option<String>,
}

/// Cold-launch holding cell: the request parsed in `setup`, kept until the
/// webview pulls it via [`cli_consume_launch_args`]. Warm launches go straight
/// through the `cli:open` event and never touch this.
#[derive(Default)]
pub struct PendingLaunchArg(pub Mutex<Option<CliRequest>>);

/// The `silo` command's help text — ADR 0047's **Local** execution mode: the
/// binary answers on stdout and exits, with no GUI involved. Lists only what
/// actually works today; the canonical `silo ext …` forms the grammar reserves
/// are not advertised until the parser implements them.
const HELP: &str = concat!(
    "silo ",
    env!("CARGO_PKG_VERSION"),
    r#" — open Silo from the terminal, and drive the running app.

Usage:
  silo                           focus the running app (or launch it)
  silo <path>                    open a folder as a workspace, or a file in one
  silo status [--json]           report the running instance, or exit 3
  silo ws list [--json]          list workspaces (works with Silo closed)
  silo agent run [options]       launch an Agent Profile in a terminal
  silo install <id|path|url>     install an extension
  silo uninstall <id>            uninstall an extension

Options for `agent run`:
  --profile <id>                 which profile (default: the one marked default)
  --ws <folder | . | ws_id>      which workspace (default: the one holding your cwd)
  --prompt <text>                an opening prompt for the agent

Flags:
  --json                         print one line of JSON instead of prose
  --launch                       start Silo and wait for it, if it isn't running
  -h, --help                     print this and exit
  -V, --version                  print the version and exit

Exit codes:
  0   success              4   not-found (no such workspace/profile)
  2   invalid-args         5   denied
  3   not-running          6   timeout
  7   failed (the command ran but could not finish)
  70  internal (Silo malfunctioned)

Notes:
  `status`, `ws list` and `agent run` answer here: they print a result and exit
  with the code above, and `--json` prints one parseable line. Failures print to
  stderr, so `x=$(silo …)` captures nothing rather than an error message.

  `silo agent run` no longer starts Silo when nothing is running — it exits 3.
  Pass --launch to start Silo and wait for it. `silo <path>`, `install` and
  `uninstall` are unchanged and still launch it.

  `agent` and `ws` are reserved words: `./agent` or `silo -- agent` opens a
  folder of that name. Everything after `--` is treated as a path.

Docs: https://getsilo.dev/guide/cli
"#
);

/// Answer a **local** flag (`-h` / `--help`, `-V` / `--version`) without
/// touching the GUI — the text to print, or `None` when this invocation is for
/// the app (ADR 0047 dispatch rule 1).
///
/// Only flags **before** a `--` count, so `silo -- --help` opens a file named
/// `--help` rather than printing help. Called from `main` before any Tauri
/// init, which is what keeps `silo --help` from focusing a window (the bug
/// this replaces) or waking a cold instance.
pub fn local_flag_response(argv: &[String]) -> Option<String> {
    for arg in argv.iter().skip(1) {
        match arg.as_str() {
            "--" => return None,
            "-h" | "--help" => return Some(HELP.to_string()),
            "-V" | "--version" => return Some(format!("silo {}\n", env!("CARGO_PKG_VERSION"))),
            _ => {}
        }
    }
    None
}

/// Resolve an `argv` + `cwd` pair into a structured [`CliRequest`].
///
/// - `silo install <path>` → `{ action: "install", path: <abs> }`
/// - `silo uninstall <id>` → `{ action: "uninstall", id: <id> }`
/// - `silo agent` / `silo agent <other>` → `{ action: "agent-usage", id: <verb?> }`
/// - `silo ws` / `silo ws <other>` → `{ action: "ws-usage", id: <verb?> }`
/// - `silo <path>` → `{ action: "open", path: <abs>, kind: "dir"|"file"|"missing" }`
/// - `silo -- <path>` → force-path, even for a reserved noun
/// - `silo` (bare) → `None` (only focus the window)
///
/// The Control commands (`status`, `ws list`, `agent run`) never reach here —
/// `control::client` answers them before Tauri init (RFC 0034).
pub fn resolve_cli_request(argv: &[String], cwd: &str) -> Option<CliRequest> {
    // `--` forces path interpretation of everything after it (ADR 0047), so a
    // folder named like a reserved noun stays reachable: `silo -- agent`.
    if let Some(idx) = argv.iter().position(|a| a == "--") {
        let raw = argv[idx + 1..].iter().find(|a| !a.starts_with('-'))?;
        return Some(open_request(raw, cwd));
    }

    let mut pos = argv.iter().skip(1).filter(|a| !a.starts_with('-'));
    let first = pos.next()?;

    // `agent` and `ws` are reserved nouns (ADR 0047): never a path, whatever
    // follows. Their working verbs — `agent run`, `ws list` — are **Control**
    // commands (RFC 0034), parsed and answered before Tauri init, so nothing
    // reaching here is one of those. What is left is a bare noun or an unknown
    // verb, which resolves to a usage report rather than silently opening a
    // folder — the bug that made `silo agent list` a path-open before.
    if first == "agent" || first == "ws" {
        return Some(CliRequest {
            action: format!("{first}-usage"),
            path: None,
            kind: None,
            id: pos.next().cloned(),
            ws: None,
        });
    }

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
                    ws: None,
                });
            }
            Some(CliRequest {
                action: "install".to_string(),
                path: Some(super::fs::normalize_path(&resolved)),
                kind: None,
                id: None,
                ws: None,
            })
        }
        "uninstall" => {
            let id = pos.next()?.clone();
            Some(CliRequest {
                action: "uninstall".to_string(),
                path: None,
                kind: None,
                id: Some(id),
                ws: None,
            })
        }
        raw => Some(open_request(raw, cwd)),
    }
}

/// `silo <path>` — the unmarked form (ADR 0047: sugar for `silo ws open`).
fn open_request(raw: &str, cwd: &str) -> CliRequest {
    let resolved = resolve_path(raw, cwd);
    let kind = match std::fs::metadata(&resolved) {
        Ok(meta) if meta.is_dir() => "dir",
        Ok(_) => "file",
        Err(_) => "missing",
    };
    CliRequest {
        action: "open".to_string(),
        path: Some(super::fs::normalize_path(&resolved)),
        kind: Some(kind.to_string()),
        id: None,
        ws: None,
    }
}

/// A flag's value from the raw argv (the positional iterator in
/// [`resolve_cli_request`] has already dropped every `-`-prefixed token).
/// Accepts `--flag <value>` and `--flag=<value>`; a trailing `--flag` with no
/// value, a value that is itself a flag, and every unknown flag are ignored —
/// the flagless outcome is the safe one, never a panic.
///
/// Shared with the Control client (RFC 0034) so both parsers accept exactly the
/// same flag spellings — `--profile x` and `--profile=x` must not diverge based
/// on which execution mode a verb happens to be in.
pub(crate) fn flag_value(argv: &[String], name: &str) -> Option<String> {
    let eq = format!("{name}=");
    let mut it = argv.iter();
    while let Some(arg) = it.next() {
        if let Some(value) = arg.strip_prefix(&eq) {
            return (!value.is_empty()).then(|| value.to_string());
        }
        if arg == name {
            return it
                .next()
                .filter(|v| !v.is_empty() && !v.starts_with('-'))
                .map(|v| v.to_string());
        }
    }
    None
}

/// The `--ws <folder|.|ws_<uuid>>` target (ADR 0047). A `ws_`-prefixed value is
/// a workspace id and passes through untouched; anything else is a folder and
/// is resolved against the forwarding shell's cwd, so `--ws .` and
/// `--ws ../sibling` mean what they say. The webview matches the result
/// exactly — an unresolvable target is that command's error, not a fallback.
///
/// Shared with the Control client (RFC 0034): `--ws` resolves identically
/// whether the verb forwards or round-trips.
pub(crate) fn workspace_flag(argv: &[String], cwd: &str) -> Option<String> {
    let raw = flag_value(argv, "--ws")?;
    if raw.starts_with("ws_") {
        return Some(raw);
    }
    Some(super::fs::normalize_path(&resolve_path(&raw, cwd)))
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
        && name.chars().all(|c| {
            c.is_ascii_lowercase() || c.is_ascii_digit() || c == '.' || c == '-' || c == '_'
        });
    ok_publisher && ok_name
}

/// The forwarding shell's working directory, absolute and normalized.
///
/// Shared with the Control client (RFC 0034), so a `cwd` means the same thing
/// whichever execution mode a verb is in — a workspace inferred from it must not
/// depend on that.
pub(crate) fn canonical_cwd(cwd: &str) -> String {
    std::fs::canonicalize(cwd)
        .map(|p| super::fs::normalize_path(&p))
        .unwrap_or_else(|_| super::fs::normalize_path(Path::new(cwd)))
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
        Ok(format!(
            "Installed the `silo` command to {}.",
            shim.display()
        ))
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
        let dir_req = resolve_cli_request(&argv(&[&dir.to_string_lossy()]), "/").unwrap();
        assert_eq!(dir_req.action, "open");
        assert_eq!(dir_req.kind.unwrap(), "dir");

        let file = dir.join("silo-cli-test-marker.txt");
        std::fs::write(&file, b"x").unwrap();
        let file_req = resolve_cli_request(&argv(&[&file.to_string_lossy()]), "/").unwrap();
        assert_eq!(file_req.action, "open");
        assert_eq!(file_req.kind.unwrap(), "file");
        let _ = std::fs::remove_file(&file);
    }

    #[test]
    fn install_resolves_absolute_path() {
        // Use a path that definitely doesn't exist so canonicalize() falls back to
        // the lexical path (avoids macOS /tmp → /private/tmp symlink expansion).
        let req =
            resolve_cli_request(&argv(&["install", "/no/such/silo-ext/dave.clock"]), "/").unwrap();
        assert_eq!(req.action, "install");
        assert_eq!(req.path.unwrap(), "/no/such/silo-ext/dave.clock");
        assert!(req.kind.is_none());
        assert!(req.id.is_none());
    }

    #[test]
    fn install_resolves_relative_path() {
        let req = resolve_cli_request(&argv(&["install", "my-ext"]), "/home/dave").unwrap();
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
        let req = resolve_cli_request(&argv(&["uninstall", "dave.clock"]), "/").unwrap();
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
        let req = resolve_cli_request(&argv(&["install", "silo.system-monitor"]), "/no/such/cwd")
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

    // `flag_value` and `workspace_flag` are shared with the Control client
    // (RFC 0034), so both parsers accept exactly the same spellings. They are
    // tested here, at their owner; the Control-mode verbs that consume them are
    // tested in `control::client`.

    #[test]
    fn flag_value_accepts_both_spellings() {
        assert_eq!(
            flag_value(&argv(&["agent", "run", "--profile", "claude-work"]), "--profile"),
            Some("claude-work".to_string())
        );
        assert_eq!(
            flag_value(&argv(&["agent", "run", "--profile=codex"]), "--profile"),
            Some("codex".to_string())
        );
    }

    #[test]
    fn flag_value_is_none_rather_than_wrong() {
        // A valueless flag must not swallow the next token: `--profile --ws x`
        // silently targeting the wrong thing is worse than no profile at all.
        assert_eq!(flag_value(&argv(&["agent", "run"]), "--profile"), None);
        assert_eq!(
            flag_value(&argv(&["agent", "run", "--profile"]), "--profile"),
            None
        );
        assert_eq!(
            flag_value(&argv(&["agent", "run", "--profile", "--ws", "x"]), "--profile"),
            None
        );
        assert_eq!(
            flag_value(&argv(&["agent", "run", "--profile="]), "--profile"),
            None
        );
    }

    #[test]
    fn workspace_flag_resolves_a_folder_against_cwd() {
        // Nonexistent, so canonicalize() falls back to the lexical join (avoids
        // macOS /tmp → /private/tmp expansion), same trick as the install tests.
        assert_eq!(
            workspace_flag(&argv(&["agent", "run", "--ws", "sibling"]), "/no/such/repo"),
            Some("/no/such/repo/sibling".to_string())
        );
    }

    #[test]
    fn workspace_flag_dot_is_the_shells_own_directory() {
        let dir = std::env::temp_dir();
        let cwd = dir.to_string_lossy().to_string();
        let expected = resolve_cli_request(&argv(&["."]), &cwd)
            .unwrap()
            .path
            .unwrap();
        assert_eq!(
            workspace_flag(&argv(&["agent", "run", "--ws", "."]), &cwd),
            Some(expected)
        );
    }

    #[test]
    fn workspace_flag_passes_an_id_through_untouched() {
        assert_eq!(
            workspace_flag(&argv(&["agent", "run", "--ws=ws_abc123"]), "/tmp"),
            Some("ws_abc123".to_string())
        );
    }

    #[test]
    fn workspace_flag_absent_means_infer_from_cwd() {
        assert_eq!(workspace_flag(&argv(&["agent", "run"]), "/tmp"), None);
        // A valueless `--ws` swallowing the next flag would silently target the
        // wrong workspace.
        assert_eq!(
            workspace_flag(&argv(&["agent", "run", "--ws", "--profile", "x"]), "/tmp"),
            None
        );
    }

    #[test]
    fn canonical_cwd_falls_back_to_the_lexical_path() {
        // A cwd that no longer exists must still produce something usable —
        // the shell's directory can be deleted out from under it.
        assert_eq!(canonical_cwd("/no/such/repo"), "/no/such/repo");
        let dir = std::env::temp_dir();
        let resolved = canonical_cwd(&dir.to_string_lossy());
        assert!(resolved.starts_with('/'), "{resolved}");
    }

    #[test]
    fn help_and_version_are_answered_locally() {
        let help = local_flag_response(&argv(&["--help"])).unwrap();
        assert!(help.starts_with("silo "));
        assert!(help.contains("silo agent run [options]"));
        assert!(help.contains("--ws <folder | . | ws_id>"));
        assert_eq!(local_flag_response(&argv(&["-h"])), Some(help));

        let version = local_flag_response(&argv(&["-V"])).unwrap();
        assert_eq!(version, format!("silo {}\n", env!("CARGO_PKG_VERSION")));
        assert_eq!(local_flag_response(&argv(&["--version"])), Some(version));
    }

    #[test]
    fn help_documents_the_control_surface() {
        // `--help` is the only place an agent learns these without the docs
        // site, so the Control commands, both flags, the exit-code table, and
        // the `agent run` cold-behavior break all have to be in it (R12).
        let help = local_flag_response(&argv(&["--help"])).unwrap();
        for expected in [
            "silo status",
            "silo ws list",
            "--json",
            "--launch",
            "--prompt",
            "invalid-args",
            "not-running",
            "not-found",
            "denied",
            "timeout",
            "failed",
            "internal",
        ] {
            assert!(help.contains(expected), "--help is missing {expected:?}");
        }
        assert!(
            help.contains("no longer starts Silo"),
            "--help must call out the `agent run` cold-behavior break"
        );
        assert!(
            !help.contains("cannot report results here"),
            "--help still claims commands cannot report results"
        );
    }

    #[test]
    fn help_is_found_after_other_arguments() {
        assert!(local_flag_response(&argv(&["agent", "run", "--help"])).is_some());
    }

    #[test]
    fn no_local_response_for_app_invocations() {
        assert!(local_flag_response(&argv(&[])).is_none());
        assert!(local_flag_response(&argv(&["."])).is_none());
        assert!(local_flag_response(&argv(&["agent", "run"])).is_none());
        // `--` forces a path: a file literally named `--help` stays reachable.
        assert!(local_flag_response(&argv(&["--", "--help"])).is_none());
    }

    #[test]
    fn bare_agent_is_usage_not_a_path() {
        // `agent` is a reserved noun (ADR 0047): it never opens a folder.
        let req = resolve_cli_request(&argv(&["agent"]), "/tmp/some-cwd").unwrap();
        assert_eq!(req.action, "agent-usage");
        assert!(req.id.is_none());
    }

    #[test]
    fn unknown_agent_verb_is_usage_not_a_path() {
        // The case that made reserving the noun worth a break: `agent list` used
        // to resolve to a path open (RFC 0033 phase 9 plans that command).
        let req = resolve_cli_request(&argv(&["agent", "list"]), "/tmp/some-cwd").unwrap();
        assert_eq!(req.action, "agent-usage");
        assert_eq!(req.id.unwrap(), "list");
    }

    #[test]
    fn bare_ws_and_unknown_ws_verbs_are_usage_not_a_path() {
        // `ws` becomes a live reserved noun with RFC 0034: `silo ws open` must
        // report usage rather than opening a folder named `ws`, exactly as
        // `agent` already does.
        let bare = resolve_cli_request(&argv(&["ws"]), "/tmp/some-cwd").unwrap();
        assert_eq!(bare.action, "ws-usage");
        assert!(bare.id.is_none());

        let unknown = resolve_cli_request(&argv(&["ws", "open"]), "/tmp/some-cwd").unwrap();
        assert_eq!(unknown.action, "ws-usage");
        assert_eq!(unknown.id.unwrap(), "open");
    }

    #[test]
    fn double_dash_forces_a_path_for_a_reserved_noun() {
        for noun in ["agent", "ws"] {
            let req = resolve_cli_request(&argv(&["--", noun]), "/tmp/some-cwd").unwrap();
            assert_eq!(req.action, "open");
            assert_eq!(req.path.unwrap(), format!("/tmp/some-cwd/{noun}"));
        }
    }

    #[test]
    fn dot_slash_still_reaches_a_folder_named_like_a_noun() {
        for noun in ["agent", "ws"] {
            let req = resolve_cli_request(&argv(&[&format!("./{noun}")]), "/tmp/some-cwd").unwrap();
            assert_eq!(req.action, "open");
            assert!(req.path.unwrap().ends_with(noun));
        }
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
