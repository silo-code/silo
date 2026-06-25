// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Self-fork entry for the PTY-host daemon (RFC 0010): when re-exec'd with
    // `--session-host <name> <cwd> <cols> <rows>`, become a detached session
    // daemon instead of launching the app. Must run before any Tauri init. The
    // socket namespace (SILO_PTY_NS) is inherited from the spawning app, which
    // sets it from the bundle identifier in `run()`.
    #[cfg(unix)]
    {
        let args: Vec<String> = std::env::args().collect();
        if args.get(1).map(|s| s.as_str()) == Some("--session-host") {
            let name = args.get(2).cloned().unwrap_or_default();
            let cwd = args.get(3).cloned().unwrap_or_else(|| "/".to_string());
            let cols = args.get(4).and_then(|s| s.parse().ok()).unwrap_or(80);
            let rows = args.get(5).and_then(|s| s.parse().ok()).unwrap_or(24);
            let shell = || std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());
            // Command (if any) follows a `--` separator. A leading empty string
            // means "the user's $SHELL". Absent → a login shell.
            let cmd = match args.iter().position(|a| a == "--") {
                Some(pos) if pos + 1 < args.len() => {
                    let mut c = args[pos + 1..].to_vec();
                    if c[0].is_empty() {
                        c[0] = shell();
                    }
                    c
                }
                _ => vec![shell(), "-l".to_string()],
            };
            let _ = pty_host::run_session_host(&name, cmd, cwd, cols, rows);
            std::process::exit(0);
        }
    }
    // Windows ConPTY daemon: re-exec'd with `--win-session-host <handle> <cwd> <cols> <rows> [-- <cmd...>]`
    #[cfg(windows)]
    {
        let args: Vec<String> = std::env::args().collect();
        if args.get(1).map(|s| s.as_str()) == Some("--win-session-host") {
            let handle = args.get(2).cloned().unwrap_or_default();
            let cwd = args.get(3).cloned().unwrap_or_else(|| "C:\\".to_string());
            let cols = args.get(4).and_then(|s| s.parse().ok()).unwrap_or(80u16);
            let rows = args.get(5).and_then(|s| s.parse().ok()).unwrap_or(24u16);
            let default_shell =
                std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".to_string());
            let cmd = match args.iter().position(|a| a == "--") {
                Some(pos) if pos + 1 < args.len() => args[pos + 1..].to_vec(),
                _ => vec![default_shell],
            };
            if let Err(e) = silo_lib::run_win_session_host(&handle, cmd, &cwd, cols, rows) {
                eprintln!("[daemon] fatal: {e}");
            }
            std::process::exit(0);
        }
    }
    silo_lib::run()
}
