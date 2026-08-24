// Foreground-process resolution for the Windows session backend.
//
// Unix answers "what is running in this terminal right now?" with
// `tcgetpgrp` on the PTY master — the kernel tracks a foreground process
// *group*, and the answer is one syscall. ConPTY has no equivalent: there are
// no process groups, and nothing records which process owns the console's
// input. So Windows has to infer it, by walking the process tree down from the
// shell the daemon spawned and taking the deepest descendant.
//
// That inference is what this module does. The Win32 snapshot itself lives in
// `snapshot()` (Windows-only); everything that decides *which* process counts
// as the leader is pure and lives in `resolve_leader`, so the interesting logic
// is unit-testable on any platform. The bugs here are all in the tree walk, not
// in the FFI.

/// One process as reported by a snapshot: its own id, its parent's, and its
/// executable name (no path — that is all `PROCESSENTRY32W` carries).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProcessNode {
    pub pid: u32,
    pub parent_pid: u32,
    pub name: String,
}

/// The resolved foreground of a session.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Leader {
    /// The process we treat as the session leader. Reported as `pgid` across
    /// the `SessionBackend` seam — Windows has no process groups, so "the pid
    /// standing in for the group" is the honest reading of that field.
    pub pid: u32,
    /// Executable name, e.g. `"copilot.exe"`.
    pub name: String,
    /// True when the shell itself is the deepest process — i.e. nothing is
    /// running under it, so the user is sitting at a prompt.
    pub at_prompt: bool,
}

/// Find the deepest descendant of `root_pid`, which is the process actually
/// interacting with the console.
///
/// "Deepest" rather than "only child" because real shells nest: `pwsh` runs
/// `npm`, which runs `node`. The thing the user is waiting on is at the bottom.
/// Ties (a process with two live children, e.g. a shell pipeline) resolve to
/// the lowest pid, purely so the answer is stable between polls rather than
/// flapping between two equally-deep siblings — a flapping leader would look
/// like the agent starting and stopping.
///
/// Returns `None` if `root_pid` isn't in the snapshot at all, which means the
/// shell has exited and the session is gone.
pub fn resolve_leader(nodes: &[ProcessNode], root_pid: u32) -> Option<Leader> {
    let root = nodes.iter().find(|n| n.pid == root_pid)?;

    let interesting = |n: &ProcessNode| !is_console_infrastructure(&n.name);

    // Depth-first from the root, tracking the deepest node found. Guarded
    // against cycles: pid reuse can, in principle, produce a parent chain that
    // loops, and an unguarded walk would hang the poll thread.
    let mut best = (0usize, root.pid, root.name.clone());
    let mut stack = vec![(root_pid, 0usize)];
    let mut seen = vec![root_pid];

    while let Some((pid, depth)) = stack.pop() {
        for child in nodes.iter().filter(|n| n.parent_pid == pid) {
            if seen.contains(&child.pid) {
                continue;
            }
            seen.push(child.pid);
            let d = depth + 1;
            // Descend through infrastructure but never report it as the
            // leader — `conhost.exe` is a real child of the shell in a ConPTY
            // session and was observed winning the walk, which named the
            // terminal after the console host instead of the agent.
            if !interesting(child) {
                stack.push((child.pid, d));
                continue;
            }
            // Strictly deeper wins; equal depth keeps the lower pid.
            if d > best.0 || (d == best.0 && child.pid < best.1) {
                best = (d, child.pid, child.name.clone());
            }
            stack.push((child.pid, d));
        }
    }

    Some(Leader {
        pid: best.1,
        name: best.2,
        // Depth 0 means we never left the root: the shell is the deepest
        // process, so nothing is running under it.
        at_prompt: best.0 == 0,
    })
}

/// Processes Windows creates as part of running a console, which are never the
/// thing the user is interacting with. `conhost.exe` is spawned as a child of
/// the shell in a ConPTY session, so it competes with the real program in the
/// walk; naming a terminal "conhost" would be strictly wrong.
fn is_console_infrastructure(name: &str) -> bool {
    matches!(
        name.to_ascii_lowercase().as_str(),
        "conhost.exe" | "openconsole.exe"
    )
}

/// Snapshot every process on the machine via the ToolHelp API.
///
/// Declared with raw `extern "system"` rather than pulling in the `windows`
/// crate, matching how `kill_child` already talks to Win32 in
/// `session_windows.rs`.
#[cfg(windows)]
pub fn snapshot() -> Vec<ProcessNode> {
    use std::ffi::c_void;

    const TH32CS_SNAPPROCESS: u32 = 0x0000_0002;
    const MAX_PATH: usize = 260;

    #[repr(C)]
    struct ProcessEntry32W {
        dw_size: u32,
        cnt_usage: u32,
        th32_process_id: u32,
        th32_default_heap_id: usize,
        th32_module_id: u32,
        cnt_threads: u32,
        th32_parent_process_id: u32,
        pc_pri_class_base: i32,
        dw_flags: u32,
        sz_exe_file: [u16; MAX_PATH],
    }

    extern "system" {
        fn CreateToolhelp32Snapshot(flags: u32, pid: u32) -> *mut c_void;
        fn Process32FirstW(snapshot: *mut c_void, entry: *mut ProcessEntry32W) -> i32;
        fn Process32NextW(snapshot: *mut c_void, entry: *mut ProcessEntry32W) -> i32;
        fn CloseHandle(handle: *mut c_void) -> i32;
    }

    let mut out = Vec::new();
    unsafe {
        let snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        // INVALID_HANDLE_VALUE is -1, not null.
        if snap.is_null() || snap as isize == -1 {
            return out;
        }
        let mut entry: ProcessEntry32W = std::mem::zeroed();
        entry.dw_size = std::mem::size_of::<ProcessEntry32W>() as u32;

        if Process32FirstW(snap, &mut entry) != 0 {
            loop {
                let len = entry
                    .sz_exe_file
                    .iter()
                    .position(|&c| c == 0)
                    .unwrap_or(MAX_PATH);
                out.push(ProcessNode {
                    pid: entry.th32_process_id,
                    parent_pid: entry.th32_parent_process_id,
                    name: String::from_utf16_lossy(&entry.sz_exe_file[..len]),
                });
                if Process32NextW(snap, &mut entry) == 0 {
                    break;
                }
            }
        }
        CloseHandle(snap);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn node(pid: u32, parent_pid: u32, name: &str) -> ProcessNode {
        ProcessNode {
            pid,
            parent_pid,
            name: name.to_string(),
        }
    }

    /// The shell alone: the user is sitting at a prompt.
    #[test]
    fn a_lone_shell_is_at_the_prompt() {
        let nodes = vec![node(100, 1, "pwsh.exe")];
        let leader = resolve_leader(&nodes, 100).unwrap();
        assert_eq!(leader.pid, 100);
        assert_eq!(leader.name, "pwsh.exe");
        assert!(leader.at_prompt);
    }

    /// The case this whole module exists for: an agent running under the shell
    /// must be the reported leader, so `agentByLeader` can name it.
    #[test]
    fn an_agent_under_the_shell_becomes_the_leader() {
        let nodes = vec![node(100, 1, "pwsh.exe"), node(200, 100, "copilot.exe")];
        let leader = resolve_leader(&nodes, 100).unwrap();
        assert_eq!(leader.pid, 200);
        assert_eq!(leader.name, "copilot.exe");
        assert!(!leader.at_prompt);
    }

    /// Real shells nest — the process the user is waiting on is at the bottom.
    #[test]
    fn the_deepest_descendant_wins() {
        let nodes = vec![
            node(100, 1, "pwsh.exe"),
            node(200, 100, "npm.cmd"),
            node(300, 200, "node.exe"),
        ];
        let leader = resolve_leader(&nodes, 100).unwrap();
        assert_eq!(leader.pid, 300);
        assert_eq!(leader.name, "node.exe");
    }

    /// Unrelated processes on the machine must never be considered — the
    /// snapshot covers every process, not just this session's.
    #[test]
    fn processes_outside_the_session_are_ignored() {
        let nodes = vec![
            node(100, 1, "pwsh.exe"),
            node(200, 100, "copilot.exe"),
            // A deeper tree belonging to somebody else entirely.
            node(500, 1, "explorer.exe"),
            node(600, 500, "chrome.exe"),
            node(700, 600, "chrome.exe"),
        ];
        let leader = resolve_leader(&nodes, 100).unwrap();
        assert_eq!(leader.pid, 200);
    }

    /// Two equally-deep children must resolve the same way on every poll, or
    /// the leader flaps and the agent looks like it keeps starting and stopping.
    #[test]
    fn ties_resolve_to_the_lowest_pid_for_stability() {
        let nodes = vec![
            node(100, 1, "pwsh.exe"),
            node(300, 100, "grep.exe"),
            node(200, 100, "cat.exe"),
        ];
        let a = resolve_leader(&nodes, 100).unwrap();
        // Same set, different snapshot ordering — Win32 makes no ordering
        // promise, so the answer must not depend on it.
        let reordered = vec![
            node(200, 100, "cat.exe"),
            node(100, 1, "pwsh.exe"),
            node(300, 100, "grep.exe"),
        ];
        let b = resolve_leader(&reordered, 100).unwrap();
        assert_eq!(a, b);
        assert_eq!(a.pid, 200);
    }

    /// Observed live on Windows: `conhost.exe` is a real child of the shell in
    /// a ConPTY session and briefly won the walk, naming the terminal after the
    /// console host rather than the agent.
    #[test]
    fn console_infrastructure_never_becomes_the_leader() {
        let nodes = vec![
            node(100, 1, "cmd.exe"),
            node(4972, 100, "conhost.exe"),
            node(3572, 100, "copilot.exe"),
        ];
        let leader = resolve_leader(&nodes, 100).unwrap();
        assert_eq!(leader.name, "copilot.exe");
        assert_eq!(leader.pid, 3572);
    }

    /// A shell with nothing but a console host under it is still at a prompt —
    /// conhost must not make it look like something is running.
    #[test]
    fn a_shell_with_only_a_console_host_is_at_the_prompt() {
        let nodes = vec![node(100, 1, "cmd.exe"), node(4972, 100, "conhost.exe")];
        let leader = resolve_leader(&nodes, 100).unwrap();
        assert_eq!(leader.pid, 100);
        assert!(leader.at_prompt);
    }

    /// Infrastructure is descended *through*, not pruned — an agent launched
    /// under a console host must still be found.
    #[test]
    fn the_walk_descends_through_infrastructure() {
        let nodes = vec![
            node(100, 1, "cmd.exe"),
            node(4972, 100, "conhost.exe"),
            node(3572, 4972, "copilot.exe"),
        ];
        let leader = resolve_leader(&nodes, 100).unwrap();
        assert_eq!(leader.name, "copilot.exe");
        assert!(!leader.at_prompt);
    }

    /// A shell that has exited leaves nothing to report.
    #[test]
    fn a_missing_root_resolves_to_nothing() {
        let nodes = vec![node(500, 1, "explorer.exe")];
        assert!(resolve_leader(&nodes, 100).is_none());
    }

    /// Pid reuse can produce a parent chain that loops. An unguarded walk would
    /// spin forever on the daemon's poll thread.
    #[test]
    fn a_cyclic_parent_chain_terminates() {
        let nodes = vec![
            node(100, 1, "pwsh.exe"),
            node(200, 100, "a.exe"),
            node(300, 200, "b.exe"),
            // b's "child" is actually its grandparent.
            node(100, 300, "pwsh.exe"),
        ];
        let leader = resolve_leader(&nodes, 100).unwrap();
        assert_eq!(leader.pid, 300);
    }
}
