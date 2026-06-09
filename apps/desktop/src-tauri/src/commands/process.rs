use std::process::Command;

use serde::Serialize;

/// The captured result of a one-shot subprocess.
#[derive(Serialize)]
pub struct ExecResult {
    pub stdout: String,
    pub stderr: String,
    /// Process exit code, or -1 if it was terminated by a signal.
    pub code: i32,
}

/// Run a one-shot subprocess and capture its output — the generic backend for
/// `ctx.process.exec`. Extensions that wrap a CLI (git, formatters, linters)
/// build on this instead of bespoke per-tool Tauri commands.
///
/// **Non-blocking by construction:** the blocking `Command::output()` runs on a
/// `spawn_blocking` worker, and the command itself is `async`, so a slow or
/// network-bound subprocess (e.g. `git push`) never stutters the UI thread —
/// unlike the synchronous `git_*` commands this replaces, which ran the wait on
/// the main thread. This is also the single host-mediated chokepoint where a
/// future command allowlist / workspace path-scoping can live (see the security
/// model in docs/architecture-audit/ctx-domains.md).
#[tauri::command]
pub async fn process_exec(
    command: String,
    args: Vec<String>,
    cwd: Option<String>,
) -> Result<ExecResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut cmd = Command::new(&command);
        cmd.args(&args);
        if let Some(dir) = cwd.as_ref() {
            cmd.current_dir(dir);
        }
        let output = cmd
            .output()
            .map_err(|e| format!("failed to run {}: {}", command, e))?;
        Ok(ExecResult {
            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
            code: output.status.code().unwrap_or(-1),
        })
    })
    .await
    .map_err(|e| format!("exec task panicked: {}", e))?
}
