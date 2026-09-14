//! The user's **real** `PATH`, and program resolution against it.
//!
//! ## Why this exists
//!
//! A macOS app launched from Finder/Dock inherits `launchd`'s environment, not
//! a shell's: measured on a release build, `PATH=/usr/bin:/bin:/usr/sbin:/sbin`
//! — four directories, none of which hold anything a developer installed.
//! Homebrew (`/opt/homebrew/bin`), nvm (`~/.nvm/versions/node/*/bin`), and
//! `~/.local/bin` are all absent, so `npx`, `cursor-agent`, `claude` and every
//! other agent CLI simply do not exist as far as the app is concerned.
//!
//! Terminals never hit this: a PTY session runs a **login shell**, which
//! re-derives `PATH` from `/etc/paths` and the user's profile scripts. A Chat
//! session (RFC 0038) does the opposite on purpose — it `exec`s a
//! pipe-connected child with no shell in between (see `acp.rs`) — so it gets
//! the launchd `PATH` verbatim and fails with
//! `failed to spawn npx: No such file or directory (os error 2)`. The same
//! build works when started from a terminal, which is why this survived the
//! whole spike: `pnpm dev` inherits the developer's own environment.
//!
//! ## What it does
//!
//! Runs the user's login shell once, interactively (`$SHELL -lic`), and asks
//! it what `PATH` it ended up with. Interactive matters: version managers
//! (nvm, rbenv, asdf) are conventionally initialised from `.zshrc`/`.bashrc`,
//! not from the login-only profile, so `-l` alone misses exactly the
//! directories that hold the agent binaries. The shell runs `env` and the
//! `PATH=` line is read out of it, which is the one form every shell agrees on
//! (see `login_shell_path`) and which ignores whatever a profile script printed
//! on its way there. The answer is **merged ahead of** the inherited `PATH`
//! rather than replacing it — a Silo started from a terminal keeps whatever
//! that terminal had.
//!
//! Deliberately *not* done by mutating this process's own `PATH`:
//! `std::env::set_var` races every other thread reading the environment. The
//! resolved value is passed explicitly into the child's environment instead,
//! and the program is resolved to an absolute path here rather than left to
//! `execvp`, so a miss is reported as a Silo-level error naming the search.

use std::collections::HashSet;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::OnceLock;
use std::time::Duration;

/// How long the login shell gets to answer before its `PATH` is abandoned and
/// the inherited one is used.
///
/// Very generous, because a real `.zshrc` is nowhere near fast and its cost is
/// not stable: the same profile (nvm's auto-switch, which reads `.nvmrc` and
/// activates a Node version on every interactive shell) measured 8.4s, ~10s
/// across three consecutive runs, and 31s once — at 0.85s of CPU, so the wall
/// clock is the shell blocking on something, not working. A bound tight enough
/// to clip the slow tail would discard precisely the directory the agent CLIs
/// live in, and the cost of waiting is paid off the startup path anyway. Past
/// this, the shell is stuck on something that isn't coming — better a worse
/// `PATH` than one that never arrives.
const SHELL_TIMEOUT: Duration = Duration::from_secs(60);

/// Filename under the app data dir holding the last `PATH` the login shell
/// reported. See {@link cached_login_path}.
const CACHE_FILE: &str = "login-shell-path";

/// `PATH` entry separator for this platform.
const SEP: &str = if cfg!(windows) { ";" } else { ":" };

/// The `PATH` Silo should hand a child process: the login shell's, with
/// anything this process inherited appended. Resolved once per run.
///
/// Answers from last launch's cached value when there is one, so only a first
/// ever launch can block — and even that is bounded by {@link SHELL_TIMEOUT}
/// and warmed by {@link prime}, off the startup path.
pub fn effective_path() -> String {
    static CACHED: OnceLock<String> = OnceLock::new();
    CACHED
        .get_or_init(|| {
            let inherited = std::env::var("PATH").unwrap_or_default();
            // Cached first: a Chat panel restored with the window asks for this
            // within a second of launch, and ~10s of login shell in front of it
            // would be a session that visibly hangs on startup.
            let login = match cached_login_path() {
                Some(cached) => {
                    refresh_cache_in_background();
                    Some(cached)
                }
                None => {
                    let fresh = login_shell_path();
                    if let Some(path) = fresh.as_deref() {
                        write_cache(path);
                    }
                    fresh
                }
            };
            merge_paths(login.as_deref(), &inherited)
        })
        .clone()
}

/// Warm {@link effective_path} off the startup path so the first Chat session
/// doesn't pay for the login shell. Safe to call more than once.
pub fn prime() {
    std::thread::spawn(|| {
        let _ = effective_path();
    });
}

/// Last launch's login-shell `PATH`, if it was recorded and still names at
/// least one directory that exists.
///
/// The existence check is the cheap half of staleness: the value most likely
/// to rot is an nvm version directory that a Node upgrade deleted, and a cache
/// naming only vanished directories is worse than none. A cache that is merely
/// *out of date* is kept — it is at most one launch behind, because every
/// launch that reads it also refreshes it.
fn cached_login_path() -> Option<String> {
    let path = cache_file()?;
    let value = std::fs::read_to_string(path).ok()?;
    let value = value.trim().to_string();
    if value.is_empty() {
        return None;
    }
    value
        .split(SEP)
        .any(|dir| !dir.is_empty() && std::path::Path::new(dir).is_dir())
        .then_some(value)
}

/// Re-ask the login shell and rewrite the cache for the *next* launch. This
/// run keeps the value it already resolved — swapping `PATH` under a session
/// that is already connecting buys nothing and makes two launches of the same
/// build behave differently.
fn refresh_cache_in_background() {
    std::thread::spawn(|| {
        if let Some(path) = login_shell_path() {
            write_cache(&path);
        }
    });
}

fn cache_file() -> Option<PathBuf> {
    super::app_paths::data_dir().map(|dir| dir.join(CACHE_FILE))
}

/// Best-effort: a cache that cannot be written costs the next launch its
/// head start, never the launch in progress.
fn write_cache(value: &str) {
    let Some(path) = cache_file() else { return };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::write(path, value);
}

/// Join the login shell's `PATH` with the inherited one, login entries first,
/// dropping duplicates and empty entries.
///
/// Merging rather than replacing is what keeps a terminal launch honest: a
/// developer who ran Silo from a shell with a bespoke `PATH` (a worktree's
/// `./bin`, a nix shell) does not lose it because the login shell doesn't
/// mention it.
pub fn merge_paths(login: Option<&str>, inherited: &str) -> String {
    let mut seen: HashSet<&str> = HashSet::new();
    let mut out: Vec<&str> = Vec::new();
    for entry in login
        .unwrap_or_default()
        .split(SEP)
        .chain(inherited.split(SEP))
    {
        if entry.is_empty() || !seen.insert(entry) {
            continue;
        }
        out.push(entry);
    }
    out.join(SEP)
}

/// Find `command` on `path`, the way `execvp` would — but here, so the caller
/// can say *why* nothing was spawned.
///
/// A command that already names a location (`/opt/homebrew/bin/npx`,
/// `./agent`) is returned as-is: `PATH` is not consulted for those, and it is
/// not this function's job to decide whether the file is there.
pub fn resolve_program(command: &str, path: &str) -> Option<PathBuf> {
    if command.is_empty() {
        return None;
    }
    if command.contains('/') || (cfg!(windows) && command.contains('\\')) {
        return Some(PathBuf::from(command));
    }
    path.split(SEP)
        .filter(|dir| !dir.is_empty())
        .flat_map(|dir| {
            let dir = PathBuf::from(dir);
            candidate_names(command).map(move |name| dir.join(name))
        })
        .find(|candidate| is_executable(candidate))
}

/// The filenames a bare command may have in one directory, most specific
/// first.
///
/// On Unix that is the command itself and nothing else. On Windows it is the
/// command with each `PATHEXT` suffix *before* the bare name, because the file
/// that actually runs is `npx.cmd` — the extensionless `npx` sitting beside it
/// is the POSIX shell script npm also ships, and `CreateProcess` cannot run
/// it. Picking the bare name there would turn a working spawn into
/// `%1 is not a valid Win32 application`.
fn candidate_names(command: &str) -> Box<dyn Iterator<Item = String> + '_> {
    if !cfg!(windows) {
        return Box::new(std::iter::once(command.to_string()));
    }
    // Whatever the machine says; the documented default when it says nothing.
    let pathext = std::env::var("PATHEXT")
        .unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD".to_string())
        .to_lowercase();
    // An explicit extension already names one file — don't append another.
    if pathext
        .split(';')
        .any(|ext| !ext.is_empty() && command.to_lowercase().ends_with(ext))
    {
        return Box::new(std::iter::once(command.to_string()));
    }
    let with_ext: Vec<String> = pathext
        .split(';')
        .filter(|ext| !ext.is_empty())
        .map(|ext| format!("{command}{ext}"))
        .collect();
    Box::new(
        with_ext
            .into_iter()
            .chain(std::iter::once(command.to_string())),
    )
}

#[cfg(unix)]
fn is_executable(path: &std::path::Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    std::fs::metadata(path)
        .map(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

#[cfg(not(unix))]
fn is_executable(path: &std::path::Path) -> bool {
    path.is_file()
}

/// Ask the user's login shell for its `PATH`. `None` on any failure — a shell
/// that isn't there, doesn't understand `-lic`, hangs, or never prints a
/// `PATH` line.
///
/// The shell is asked to run **`/usr/bin/env`**, not to interpolate `$PATH`
/// itself, and that is deliberate rather than incidental: in fish `PATH` is a
/// *list*, so `printf '%s' "$PATH"` yields `/opt/homebrew/bin /usr/bin …`
/// joined by **spaces**, which is not a `PATH` at all. Every shell exports it
/// to a child colon-joined, so reading it out of a child's environment is the
/// one form that is right in all of them — and it needs no quoting inside the
/// `-c` string.
fn login_shell_path() -> Option<String> {
    if cfg!(windows) {
        // `PATH` on Windows comes from the registry via the user's
        // environment, which a GUI process already inherits in full. There is
        // no login-shell step to reproduce.
        return None;
    }
    let shell = std::env::var("SHELL").ok().filter(|s| !s.is_empty())?;
    run_with_timeout(&shell, &["-lic", "/usr/bin/env"])
        .as_deref()
        .and_then(env_path_line)
        .map(str::to_string)
}

/// Pull `PATH` out of `env` output, ignoring everything a profile script
/// printed on its way there.
///
/// The **last** match wins. A profile's own chatter lands before the command
/// runs, so a line that merely looks like `PATH=…` in a banner cannot
/// outrank the real one.
pub fn env_path_line(output: &str) -> Option<&str> {
    output
        .lines()
        .rev()
        .find_map(|line| line.strip_prefix("PATH="))
        .filter(|value| !value.is_empty())
}

/// Run a command, capture stdout, and kill it if it outstays
/// {@link SHELL_TIMEOUT}.
///
/// stdout is read on its own thread so the timeout is real: `output()` would
/// block until the child exits, which is the one case that needs bounding. Its
/// stderr goes to `/dev/null` — profile scripts write there routinely, and an
/// unread pipe would deadlock the shell once it filled.
fn run_with_timeout(program: &str, args: &[&str]) -> Option<String> {
    use std::io::Read;
    use std::sync::mpsc;

    let mut child = Command::new(program)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    let mut stdout = child.stdout.take()?;
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let mut buf = String::new();
        let _ = stdout.read_to_string(&mut buf);
        let _ = tx.send(buf);
    });
    match rx.recv_timeout(SHELL_TIMEOUT) {
        Ok(out) => {
            let _ = child.wait();
            Some(out)
        }
        Err(_) => {
            let _ = child.kill();
            let _ = child.wait();
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn merge_puts_login_entries_first_and_keeps_inherited_extras() {
        let merged = merge_paths(
            Some("/opt/homebrew/bin:/usr/bin:/bin"),
            "/usr/bin:/bin:/my/worktree/bin",
        );
        assert_eq!(
            merged, "/opt/homebrew/bin:/usr/bin:/bin:/my/worktree/bin",
            "duplicates collapse, inherited-only entries survive"
        );
    }

    #[test]
    fn merge_without_a_login_shell_answer_is_the_inherited_path() {
        assert_eq!(merge_paths(None, "/usr/bin:/bin"), "/usr/bin:/bin");
    }

    #[test]
    fn merge_drops_empty_entries() {
        // An empty `PATH` entry means "the current directory" to execvp —
        // never something Silo should hand an agent.
        assert_eq!(merge_paths(Some(":/usr/bin:"), ""), "/usr/bin");
    }

    #[test]
    fn env_output_survives_profile_chatter() {
        // Real `.zshrc` output: nvm announces itself before `env` ever runs.
        let noisy = "Found '/Users/d/.nvmrc' with version <24>\n\
                     Now using node v24.19.0\n\
                     HOME=/Users/d\n\
                     PATH=/opt/homebrew/bin:/usr/bin\n\
                     SHELL=/bin/zsh\n";
        assert_eq!(env_path_line(noisy), Some("/opt/homebrew/bin:/usr/bin"));
    }

    #[test]
    fn a_banner_line_cannot_outrank_the_real_path() {
        let noisy = "PATH=/decorative/banner\nPATH=/opt/homebrew/bin\n";
        assert_eq!(env_path_line(noisy), Some("/opt/homebrew/bin"));
    }

    #[test]
    fn output_without_a_path_line_is_not_a_path() {
        assert_eq!(
            env_path_line("Welcome to your shell\nHOME=/Users/d\n"),
            None
        );
        assert_eq!(env_path_line("PATH=\n"), None);
    }

    /// The whole reason the shell runs `env` instead of interpolating `$PATH`:
    /// fish would have answered with a space-joined list, which is not a PATH.
    #[test]
    fn a_space_joined_list_is_not_mistaken_for_a_path() {
        assert_eq!(
            env_path_line("PATH=/opt/homebrew/bin /usr/bin\n"),
            Some("/opt/homebrew/bin /usr/bin"),
            "env always exports it colon-joined; this shape can only come from \
             a shell interpolating a list, which login_shell_path never asks for"
        );
    }

    #[test]
    fn resolve_finds_an_executable_and_skips_a_plain_file() {
        let dir = std::env::temp_dir().join(format!("silo-user-path-{}", std::process::id()));
        let other = dir.join("other");
        std::fs::create_dir_all(&other).expect("temp dirs");
        let plain = dir.join("agent");
        std::fs::write(&plain, "not executable").expect("write");
        let real = other.join("agent");
        std::fs::write(&real, "#!/bin/sh\n").expect("write");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&real, std::fs::Permissions::from_mode(0o755)).expect("chmod");
        }

        let path = format!("{}:{}", dir.display(), other.display());
        #[cfg(unix)]
        assert_eq!(
            resolve_program("agent", &path),
            Some(real),
            "a non-executable file of the right name must not shadow the real one"
        );

        assert_eq!(resolve_program("silo-no-such-binary", &path), None);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_command_naming_a_location_is_left_alone() {
        assert_eq!(
            resolve_program("/opt/homebrew/bin/npx", ""),
            Some(PathBuf::from("/opt/homebrew/bin/npx")),
            "PATH is not consulted for a command that already has a path"
        );
        assert_eq!(resolve_program("", "/usr/bin"), None);
    }

    #[test]
    fn a_cache_naming_only_vanished_directories_is_ignored() {
        let _guard = crate::commands::app_paths::env_lock();
        let dir = std::env::temp_dir().join(format!("silo-path-cache-{}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("temp dir");
        let previous = std::env::var("SILO_DATA_DIR").ok();
        std::env::set_var("SILO_DATA_DIR", &dir);

        write_cache("/silo/gone/one:/silo/gone/two");
        assert_eq!(
            cached_login_path(),
            None,
            "an nvm directory a Node upgrade deleted must not be trusted"
        );

        write_cache(&format!("/silo/gone/one:{}", dir.display()));
        assert_eq!(
            cached_login_path(),
            Some(format!("/silo/gone/one:{}", dir.display())),
            "one surviving directory is enough — the value is at most one launch stale"
        );

        write_cache("   ");
        assert_eq!(cached_login_path(), None, "whitespace is not a PATH");

        match previous {
            Some(value) => std::env::set_var("SILO_DATA_DIR", value),
            None => std::env::remove_var("SILO_DATA_DIR"),
        }
        std::fs::remove_dir_all(&dir).ok();
    }

    /// The real thing, on whatever machine runs the tests: the resolved `PATH`
    /// must at minimum still contain what this process inherited.
    ///
    /// `#[ignore]` because it spawns the tester's actual interactive login
    /// shell — seconds on a real profile, and the full {@link SHELL_TIMEOUT}
    /// under a sandbox that blocks the shell's history file. Run it
    /// deliberately: `cargo test --lib user_path -- --ignored`.
    #[test]
    #[ignore = "spawns the real login shell"]
    fn effective_path_never_loses_the_inherited_one() {
        let inherited = std::env::var("PATH").unwrap_or_default();
        let effective = effective_path();
        for entry in inherited.split(SEP).filter(|e| !e.is_empty()) {
            assert!(
                effective.split(SEP).any(|e| e == entry),
                "{entry} was dropped from {effective}"
            );
        }
    }
}
