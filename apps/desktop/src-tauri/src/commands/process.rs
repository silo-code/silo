use std::collections::HashMap;
use std::process::{Command, Stdio};
use std::sync::{Mutex as StdMutex, OnceLock};

use parking_lot::Mutex;
use serde::Serialize;
use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};

#[cfg(unix)]
use libc;

#[cfg(unix)]
use std::os::unix::process::CommandExt as UnixCommandExt;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// Maps an in-flight exec's caller-supplied id → the OS pid of its spawned
/// child (which is also its process-group id on Unix, since we spawn it as a
/// group leader). Lets `process_exec_kill` terminate a still-running `exec` on
/// timeout / abort. Entries are removed as soon as the child exits.
fn exec_registry() -> &'static StdMutex<HashMap<String, u32>> {
    static R: OnceLock<StdMutex<HashMap<String, u32>>> = OnceLock::new();
    R.get_or_init(|| StdMutex::new(HashMap::new()))
}

/// Tauri-managed state for process resource stats (ctx.processes.enableStats).
/// Holds a sysinfo::System that is refreshed in-place on each `process_get_stats`
/// call so CPU% is computed as a delta between consecutive samples.
pub struct ProcessStatsState(pub Mutex<System>);

impl ProcessStatsState {
    pub fn new() -> Self {
        ProcessStatsState(Mutex::new(System::new()))
    }
}

/// Per-process resource snapshot returned by `process_get_stats`.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessStats {
    pub pid: i32,
    pub cpu_percent: f32,
    pub memory_mb: f64,
}

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
    env: Option<HashMap<String, String>>,
    exec_id: Option<String>,
) -> Result<ExecResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut cmd = Command::new(&command);
        cmd.args(&args);
        // Pipe so we can capture output via wait_with_output while still owning
        // the Child (needed to read its pid for the kill registry).
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());
        // On Windows a GUI (windows-subsystem) app spawning a console program
        // like `powershell` allocates a fresh console window. Extensions that
        // poll via ctx.process.exec would flash a window on every call, so
        // suppress it. No effect on captured stdout/stderr.
        #[cfg(windows)]
        {
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }
        if let Some(dir) = cwd.as_ref() {
            cmd.current_dir(dir);
        }
        // Extra env is *merged over* the inherited environment (Command inherits
        // the parent env by default; `envs` adds/overrides individual keys).
        if let Some(vars) = env {
            cmd.envs(vars);
        }
        // Put the child in its own process group so a timeout/abort can reap the
        // whole tree (killpg), not just the direct child — otherwise a shell
        // wrapper's grandchildren would leak as orphans.
        #[cfg(unix)]
        {
            cmd.process_group(0);
        }
        let mut child = cmd
            .spawn()
            .map_err(|e| format!("failed to run {}: {}", command, e))?;
        let pid = child.id();
        if let Some(id) = exec_id.as_ref() {
            exec_registry().lock().unwrap().insert(id.clone(), pid);
        }
        let output = child.wait_with_output();
        if let Some(id) = exec_id.as_ref() {
            exec_registry().lock().unwrap().remove(id);
        }
        let output = output.map_err(|e| format!("failed to run {}: {}", command, e))?;
        Ok(ExecResult {
            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
            code: output.status.code().unwrap_or(-1),
        })
    })
    .await
    .map_err(|e| format!("exec task panicked: {}", e))?
}

/// Kill a still-running `process_exec` by its caller-supplied `exec_id` — the
/// backend for `ctx.process.exec`'s `timeoutMs` / `signal` (AbortSignal). No-op
/// if the exec already finished (its registry entry is gone). On Unix this
/// SIGTERMs the child's process group (SIGKILL fallback after 2 s); on Windows
/// it `taskkill /T`s the process tree.
#[tauri::command]
pub async fn process_exec_kill(exec_id: String) -> Result<(), String> {
    let pid = exec_registry().lock().unwrap().get(&exec_id).copied();
    let Some(pid) = pid else {
        return Ok(());
    };
    #[cfg(unix)]
    {
        let pgid = pid as i32;
        unsafe {
            libc::killpg(pgid, libc::SIGTERM);
        }
        tauri::async_runtime::spawn(async move {
            tauri::async_runtime::spawn_blocking(move || {
                std::thread::sleep(std::time::Duration::from_secs(2));
                unsafe {
                    libc::killpg(pgid, libc::SIGKILL);
                }
            })
            .await
            .ok();
        });
    }
    #[cfg(windows)]
    {
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let _ = Command::new("taskkill")
            .args(["/F", "/T", "/PID", &pid.to_string()])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
    }
    Ok(())
}

/// Send SIGTERM to a process group by pgid, then SIGKILL after 3 s if still
/// alive. Does NOT kill the PTY session — only the foreground process group.
/// This is the backend for `ctx.processes.kill(pgid)`.
#[cfg(unix)]
#[tauri::command]
pub async fn process_kill_group(pgid: i32) -> Result<(), String> {
    // killpg targets a process group (negative pid to kill(2)); SIGTERM first.
    unsafe {
        libc::killpg(pgid, libc::SIGTERM);
    }
    // Schedule SIGKILL fallback on a blocking thread — don't occupy the executor.
    tauri::async_runtime::spawn(async move {
        tauri::async_runtime::spawn_blocking(move || {
            std::thread::sleep(std::time::Duration::from_secs(3));
            unsafe {
                libc::killpg(pgid, libc::SIGKILL);
            }
        })
        .await
        .ok();
    });
    Ok(())
}

/// Stub for non-Unix platforms (process groups aren't modelled the same way).
#[cfg(not(unix))]
#[tauri::command]
pub async fn process_kill_group(_pgid: i32) -> Result<(), String> {
    Err("process_kill_group is not supported on this platform".to_string())
}

/// Query CPU and memory usage for a list of PIDs. Used by the TypeScript
/// `ctx.processes.enableStats()` polling loop (called every ~1500 ms while
/// at least one extension has stats enabled). Only the requested PIDs are
/// refreshed — not a full system scan.
///
/// CPU% is a delta between consecutive calls (first call returns 0%).
/// Returns only the entries for PIDs that are still alive.
#[tauri::command]
pub async fn process_get_stats(
    state: tauri::State<'_, ProcessStatsState>,
    pids: Vec<i32>,
) -> Result<Vec<ProcessStats>, String> {
    let sys_pids: Vec<Pid> = pids.iter().map(|&p| Pid::from(p as usize)).collect();
    let mut sys = state.0.lock();
    sys.refresh_processes_specifics(
        ProcessesToUpdate::Some(&sys_pids),
        true,
        ProcessRefreshKind::everything(),
    );
    Ok(pids
        .iter()
        .filter_map(|&pid| {
            let p = sys.process(Pid::from(pid as usize))?;
            Some(ProcessStats {
                pid,
                cpu_percent: p.cpu_usage(),
                memory_mb: p.memory() as f64 / 1_048_576.0,
            })
        })
        .collect())
}
