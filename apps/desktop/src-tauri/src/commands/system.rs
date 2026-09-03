use serde::Serialize;

#[derive(Serialize)]
pub struct SystemInfoResponse {
    pub os: &'static str,
    pub arch: &'static str,
}

/// Returns compile-time OS and CPU architecture constants. These are baked into
/// the binary — no runtime lookup needed, no extra dependencies.
#[tauri::command]
pub fn system_info() -> SystemInfoResponse {
    SystemInfoResponse {
        os: std::env::consts::OS,
        arch: std::env::consts::ARCH,
    }
}

/// The user's login shell (RFC 0033 phase 3) — `$SHELL`, falling back to
/// `/bin/bash`, which is exactly what `main.rs`'s session-host branch uses when
/// no shell is configured. The host needs it to decide whether it can quote an
/// opening prompt for the shell a terminal will actually run; it is read once
/// during host init and held in host state, so no consumer has to await a value
/// that never changes for the life of the process.
#[cfg(unix)]
#[tauri::command]
pub fn default_shell() -> String {
    std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
}

/// Windows counterpart: `COMSPEC`, falling back to `cmd.exe` — the same
/// resolution `main.rs`'s ConPTY branch uses. Neither is a shell Silo has an
/// exact prompt-quoting rule for, so a prompt is refused there; the command
/// exists so that refusal names the shell rather than reporting nothing.
#[cfg(windows)]
#[tauri::command]
pub fn default_shell() -> String {
    std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".to_string())
}
