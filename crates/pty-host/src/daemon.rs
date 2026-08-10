//! The session host. Double-forks + `setsid` so it outlives the launching
//! terminal (Proof 1: detached survival), `forkpty`s the shell, holds the
//! master, and serves a per-session Unix socket.

use std::collections::VecDeque;
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::Path;
use std::sync::{Arc, Mutex, Once};
use std::time::Duration;

use crate::foreground;
use crate::paths;
use crate::proto::*;
use crate::pty;

const RING_CAP: usize = 256 * 1024;

type Clients = Arc<Mutex<Vec<Arc<Mutex<UnixStream>>>>>;

/// Fork off a detached daemon for `name`. Returns in the *original* process so
/// the caller can attach as a client; the daemon runs in a grandchild.
pub fn spawn_detached(
    name: &str,
    cmd: Vec<String>,
    cwd: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    // SAFETY: standard double-fork daemonize.
    match unsafe { libc::fork() } {
        -1 => Err("fork failed".into()),
        0 => {
            // child: detach into a new session, fork again so the daemon is not
            // a session leader (can never re-acquire a controlling terminal).
            unsafe {
                libc::setsid();
            }
            match unsafe { libc::fork() } {
                0 => {
                    redirect_std_to_log(name);
                    log(&format!("daemon start: name={name} cwd={cwd} size={cols}x{rows}"));
                    if let Err(e) = run_daemon(name, &cmd, &cwd, cols, rows) {
                        log(&format!("daemon error: {e}"));
                    }
                    unsafe { libc::_exit(0) };
                }
                _ => unsafe { libc::_exit(0) },
            }
        }
        _ => Ok(()), // original process continues, will attach
    }
}

/// Point the detached daemon's stdin at `/dev/null` but its stdout/stderr at a
/// per-session logfile, so panics and `log()` lines survive (vs. vanishing into
/// `/dev/null`). Best-effort: a failure here just means no log, not no daemon.
fn redirect_std_to_log(name: &str) {
    let _ = paths::ensure_dir();
    unsafe {
        let null = libc::open(b"/dev/null\0".as_ptr() as *const libc::c_char, libc::O_RDWR);
        if null >= 0 {
            libc::dup2(null, 0);
            if null > 2 {
                libc::close(null);
            }
        }
        if let Ok(c) = std::ffi::CString::new(paths::log_path(name).as_os_str().as_encoded_bytes()) {
            let fd = libc::open(
                c.as_ptr(),
                libc::O_WRONLY | libc::O_CREAT | libc::O_APPEND,
                0o600,
            );
            if fd >= 0 {
                libc::dup2(fd, 1);
                libc::dup2(fd, 2);
                if fd > 2 {
                    libc::close(fd);
                }
            }
        }
    }
}

/// Timestamped daemon log line (to stderr, which is the per-session logfile).
fn log(msg: &str) {
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    eprintln!("{ts} {msg}");
}

fn run_daemon(name: &str, cmd: &[String], cwd: &str, cols: u16, rows: u16) -> Result<(), String> {
    let pty = pty::fork_pty(cmd, cwd, cols, rows)?;
    let master = pty.master;
    let shell_pid = pty.child;

    paths::ensure_dir().map_err(|e| e.to_string())?;
    let path = paths::sock_path(name);
    let _ = std::fs::remove_file(&path);
    let listener = UnixListener::bind(&path).map_err(|e| format!("bind: {e}"))?;

    let clients: Clients = Arc::new(Mutex::new(Vec::new()));
    // Foreground-events subscribers (a subset that sent T_SUBSCRIBE_FG); they
    // receive T_FG_REP pushes instead of T_DATA.
    let fg_clients: Clients = Arc::new(Mutex::new(Vec::new()));
    let ring: Arc<Mutex<VecDeque<u8>>> = Arc::new(Mutex::new(VecDeque::with_capacity(RING_CAP)));

    // Master reader: drain the PTY so the shell never blocks with no client,
    // keep a bounded ring for reattach replay, and broadcast to live clients.
    {
        let clients = clients.clone();
        let ring = ring.clone();
        let path = path.clone();
        let name = name.to_string();
        std::thread::spawn(move || {
            let mut buf = [0u8; 8192];
            loop {
                let n = unsafe { libc::read(master, buf.as_mut_ptr() as *mut libc::c_void, buf.len()) };
                if n <= 0 {
                    break; // shell exited / EOF
                }
                let slice = &buf[..n as usize];
                {
                    let mut r = ring.lock().unwrap();
                    for &b in slice {
                        if r.len() == RING_CAP {
                            r.pop_front();
                        }
                        r.push_back(b);
                    }
                }
                let mut cs = clients.lock().unwrap();
                cs.retain(|c| {
                    let mut w = c.lock().unwrap();
                    write_frame(&mut *w, T_DATA, slice).is_ok()
                });
            }
            // Shell gone: tear the session down.
            teardown_and_exit(&name, &path, "shell exited");
        });
    }

    // Foreground poll: while there are subscribers, watch the PTY's foreground
    // process group and push it on change. `tcgetpgrp` is a cheap syscall every
    // tick; the (subprocess) name lookup runs only when the group changes.
    {
        let fg_clients = fg_clients.clone();
        std::thread::spawn(move || {
            let mut last_pgid: i32 = -1;
            let mut last_cwd = String::new();
            let mut name = String::new();
            loop {
                std::thread::sleep(Duration::from_millis(750));
                if fg_clients.lock().unwrap().is_empty() {
                    last_pgid = -1; // reset so the next subscriber gets a fresh push
                    last_cwd.clear();
                    continue;
                }
                // pgid + cwd are cheap, polled every tick (so a bare `cd` at the
                // prompt — same pgid, new cwd — is caught). The name lookup shells
                // out, so re-resolve it when the group changes *or* the cached
                // name is still a transitional launcher (Cursor's
                // `cursor-agent` is a bash shebang that `exec -a`s into node
                // without changing pgid — confirmed live: leader stayed
                // "bash" forever and `ctx.agents` never stuck agentPgid).
                let pgid = foreground::pgid(master);
                let cwd = if pgid > 0 {
                    foreground::cwd_of(pgid)
                } else {
                    String::new()
                };
                let mut name_changed = false;
                if pgid != last_pgid {
                    name = if pgid > 0 {
                        foreground::name_of(pgid)
                    } else {
                        "?".to_string()
                    };
                    name_changed = true;
                } else if pgid > 0 && is_transitional_leader(&name) {
                    let refreshed = foreground::name_of(pgid);
                    if refreshed != name {
                        name = refreshed;
                        name_changed = true;
                    }
                }
                if pgid == last_pgid && cwd == last_cwd && !name_changed {
                    continue;
                }
                last_pgid = pgid;
                last_cwd = cwd.clone();
                let payload = foreground::encode(&foreground::Foreground {
                    pgid,
                    at_prompt: pgid == shell_pid,
                    leader: name.clone(),
                    cwd,
                });
                fg_clients.lock().unwrap().retain(|c| {
                    let mut w = c.lock().unwrap();
                    write_frame(&mut *w, T_FG_REP, &payload).is_ok()
                });
            }
        });
    }

    // Accept loop.
    for conn in listener.incoming() {
        let stream = match conn {
            Ok(s) => s,
            Err(_) => continue,
        };
        // Defense in depth atop the 0700 socket dir: only our own uid may attach.
        if !peer_is_owner(&stream) {
            log("rejected connection: foreign peer uid");
            continue;
        }
        let read_half = match stream.try_clone() {
            Ok(s) => s,
            Err(_) => continue,
        };
        let write_half = Arc::new(Mutex::new(stream));

        // Handshake first: tell the client our protocol version so an app build
        // never silently talks to an incompatible leftover daemon.
        {
            let mut w = write_half.lock().unwrap();
            let _ = write_frame(&mut *w, T_HELLO, &hello_payload());
        }

        // Replay the ring so a reattaching client sees recent output.
        {
            let snapshot: Vec<u8> = ring.lock().unwrap().iter().copied().collect();
            if !snapshot.is_empty() {
                let mut w = write_half.lock().unwrap();
                let _ = write_frame(&mut *w, T_DATA, &snapshot);
            }
        }
        clients.lock().unwrap().push(write_half.clone());
        log("client attached");

        // Per-client reader: client frames -> master / control actions.
        let wh = write_half.clone();
        let clients_r = clients.clone();
        let fg_clients_r = fg_clients.clone();
        std::thread::spawn(move || {
            let mut s = read_half;
            loop {
                match read_frame(&mut s) {
                    Ok((T_DATA, p)) => unsafe {
                        libc::write(master, p.as_ptr() as *const libc::c_void, p.len());
                    },
                    Ok((T_RESIZE, p)) => {
                        if let Some((c, r)) = parse_resize(&p) {
                            pty::set_winsize(master, c, r);
                        }
                    }
                    Ok((T_KILL, _)) => {
                        kill_group(shell_pid);
                    }
                    Ok((T_FG_REQ, _)) => {
                        let fg = foreground::query(master, shell_pid);
                        let mut w = wh.lock().unwrap();
                        let _ = write_frame(&mut *w, T_FG_REP, &foreground::encode(&fg));
                    }
                    Ok((T_SUBSCRIBE_FG, _)) => {
                        // Convert to a foreground subscriber: stop receiving data,
                        // start receiving fg pushes, and get the current value now.
                        clients_r.lock().unwrap().retain(|c| !Arc::ptr_eq(c, &wh));
                        let fg = foreground::query(master, shell_pid);
                        {
                            let mut w = wh.lock().unwrap();
                            let _ = write_frame(&mut *w, T_FG_REP, &foreground::encode(&fg));
                        }
                        fg_clients_r.lock().unwrap().push(wh.clone());
                    }
                    Ok(_) => {}
                    Err(_) => {
                        log("client detached");
                        // Actively prune this client rather than relying on
                        // the master-reader thread's write-triggered retain
                        // (daemon.rs's other pruning path): a session with no
                        // PTY output — the common case, a shell idle at a
                        // prompt — would otherwise never see that write path
                        // run at all, so dead entries (and their socket fds)
                        // would accumulate in `clients` for the session's
                        // whole life, one per detach, unbounded.
                        clients_r.lock().unwrap().retain(|c| !Arc::ptr_eq(c, &wh));
                        fg_clients_r.lock().unwrap().retain(|c| !Arc::ptr_eq(c, &wh));
                        break; // disconnected (detach) — session lives on
                    }
                }
            }
        });
    }
    Ok(())
}

/// Verify the connecting peer shares our uid. Peer-credential lookup differs by
/// platform — `getpeereid` on macOS/BSD, `SO_PEERCRED` on Linux — so this is
/// split by `cfg`. If it can't be determined we allow (best-effort — the `0700`
/// socket dir is the primary guard).
fn peer_is_owner(stream: &UnixStream) -> bool {
    use std::os::unix::io::AsRawFd;
    let fd = stream.as_raw_fd();

    #[cfg(any(
        target_os = "macos",
        target_os = "ios",
        target_os = "freebsd",
        target_os = "openbsd",
        target_os = "netbsd",
        target_os = "dragonfly"
    ))]
    {
        let mut uid: libc::uid_t = 0;
        let mut gid: libc::gid_t = 0;
        let rc = unsafe { libc::getpeereid(fd, &mut uid, &mut gid) };
        return rc != 0 || uid == unsafe { libc::geteuid() };
    }

    #[cfg(target_os = "linux")]
    {
        let mut cred = libc::ucred {
            pid: 0,
            uid: 0,
            gid: 0,
        };
        let mut len = std::mem::size_of::<libc::ucred>() as libc::socklen_t;
        let rc = unsafe {
            libc::getsockopt(
                fd,
                libc::SOL_SOCKET,
                libc::SO_PEERCRED,
                &mut cred as *mut libc::ucred as *mut libc::c_void,
                &mut len,
            )
        };
        return rc != 0 || cred.uid == unsafe { libc::geteuid() };
    }

    #[cfg(not(any(
        target_os = "macos",
        target_os = "ios",
        target_os = "freebsd",
        target_os = "openbsd",
        target_os = "netbsd",
        target_os = "dragonfly",
        target_os = "linux"
    )))]
    {
        let _ = fd;
        true
    }
}

/// Launchers that briefly own the TTY foreground pgid before `exec`ing into
/// the real agent binary without changing the process group. While the
/// cached leader is one of these, keep re-resolving argv0 every poll tick.
fn is_transitional_leader(name: &str) -> bool {
    let base = name.rsplit('/').next().unwrap_or(name);
    matches!(
        base,
        "bash" | "sh" | "dash" | "zsh" | "env" | "python" | "python3"
    )
}

#[cfg(test)]
mod transitional_leader_tests {
    use super::is_transitional_leader;

    #[test]
    fn recognises_common_launchers() {
        assert!(is_transitional_leader("bash"));
        assert!(is_transitional_leader("/bin/bash"));
        assert!(is_transitional_leader("/usr/bin/env"));
        assert!(is_transitional_leader("zsh"));
    }

    #[test]
    fn rejects_settled_agents() {
        assert!(!is_transitional_leader("cursor-agent"));
        assert!(!is_transitional_leader("/Users/x/.local/bin/cursor-agent"));
        assert!(!is_transitional_leader("claude"));
        assert!(!is_transitional_leader("node"));
    }
}

/// Tear the session down: remove its socket and log files and terminate the
/// process. Guarded by `Once` so any future second exit path shares the same
/// exactly-once cleanup; `_exit` itself terminates the whole process
/// atomically. Never returns.
fn teardown_and_exit(name: &str, sock_path: &Path, reason: &str) -> ! {
    static TEARDOWN: Once = Once::new();
    TEARDOWN.call_once(|| {
        log(&format!("{reason}; removing socket and log"));
        let _ = std::fs::remove_file(sock_path);
        let _ = std::fs::remove_file(paths::log_path(name));
    });
    unsafe { libc::_exit(0) };
}

/// Force-terminate the session even mid-foreground-program (Proof 1, P5).
/// Signals the shell's process group, escalating TERM -> KILL.
fn kill_group(shell_pid: i32) {
    unsafe {
        libc::kill(-shell_pid, libc::SIGTERM);
    }
    std::thread::sleep(Duration::from_millis(150));
    unsafe {
        libc::kill(-shell_pid, libc::SIGKILL);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::discovery;
    use std::path::{Path, PathBuf};
    use std::time::Instant;

    // `spawn_detached` double-forks the calling process without an
    // intervening exec (unlike production, which always calls it from a
    // freshly re-exec'd, still-single-threaded binary — see main.rs's
    // `--session-host` branch). Forking a multithreaded process is only
    // safe if the child sticks to async-signal-safe work until it execs,
    // which `redirect_std_to_log`/`run_daemon` don't (they touch `std::fs`,
    // allocate, etc.). Cargo's test harness runs `#[test]`s on multiple
    // threads by default, so two of *our own* forks racing each other is an
    // avoidable extra source of exactly that hazard — serialize them here.
    // Every wait below still has an explicit deadline, so even a genuinely
    // wedged child fails the test instead of hanging the run.
    static SPAWN_GUARD: Mutex<()> = Mutex::new(());

    /// Connect to `sock`, retrying briefly — mirrors `client.rs`'s connect
    /// helper (the daemon may still be finishing its `UnixListener::bind`).
    fn connect_retry(sock: &Path) -> UnixStream {
        let deadline = Instant::now() + Duration::from_secs(2);
        loop {
            match UnixStream::connect(sock) {
                Ok(s) => return s,
                Err(_) if Instant::now() < deadline => {
                    std::thread::sleep(Duration::from_millis(20));
                }
                Err(e) => panic!("connect {sock:?}: {e}"),
            }
        }
    }

    /// Consume the daemon's initial `T_HELLO`, then request and read back the
    /// live foreground pgid. For a bare `sleep` test command (no shell
    /// wrapping it) this is the command's own pid — `forkpty`'s child is
    /// always a fresh session/group leader.
    fn query_pgid(s: &mut UnixStream) -> i32 {
        let (tag, _) = read_frame(s).expect("hello frame");
        assert_eq!(tag, T_HELLO, "daemon's first frame must be T_HELLO");
        write_frame(s, T_FG_REQ, &[]).expect("send fg req");
        loop {
            let (tag, payload) = read_frame(s).expect("fg reply");
            if tag == T_FG_REP {
                return foreground::decode(&payload).expect("decode fg").pgid;
            }
        }
    }

    /// Spawns a real detached daemon via the actual `spawn_detached`
    /// production path, and force-kills it on drop so a panicking assertion
    /// still can't leak the exact kind of process this project exists to
    /// stop leaking.
    struct TestDaemon {
        sock: PathBuf,
    }

    impl TestDaemon {
        fn spawn(name: &str, cmd: Vec<String>) -> Self {
            let _g = SPAWN_GUARD.lock().unwrap_or_else(|e| e.into_inner());
            spawn_detached(name, cmd, "/tmp".to_string(), 80, 24).expect("spawn_detached");
            let sock = paths::sock_path(name);
            let deadline = Instant::now() + Duration::from_secs(2);
            while Instant::now() < deadline && !discovery::is_live(&sock) {
                std::thread::sleep(Duration::from_millis(10));
            }
            assert!(discovery::is_live(&sock), "daemon did not come up in time");
            TestDaemon { sock }
        }
    }

    impl Drop for TestDaemon {
        fn drop(&mut self) {
            // Best-effort: if it's already gone (e.g. the test itself killed
            // the shell), connect fails and there's nothing to do.
            if let Ok(mut s) = UnixStream::connect(&self.sock) {
                let _ = write_frame(&mut s, T_KILL, &[]);
            }
            let deadline = Instant::now() + Duration::from_secs(1);
            while Instant::now() < deadline && discovery::is_live(&self.sock) {
                std::thread::sleep(Duration::from_millis(20));
            }
        }
    }

    /// Resolves RFC 0010 §3.7 (an unverified open question, not an assumed
    /// fact): does the daemon's only production exit path actually work?
    /// If this fails, that is a P0 bug ahead of anything else — the daemon's
    /// sole self-exit mechanism would be broken, and nothing later in this
    /// plan should be built on top of it blind.
    #[test]
    fn shell_death_triggers_daemon_self_exit_and_removes_socket() {
        crate::test_support::with_temp_dir("shell-death", |_dir| {
            let daemon = TestDaemon::spawn("t-shell-death", vec!["sleep".into(), "600".into()]);
            let mut s = connect_retry(&daemon.sock);
            let pgid = query_pgid(&mut s);
            drop(s);

            unsafe {
                libc::kill(pgid, libc::SIGKILL);
            }

            let deadline = Instant::now() + Duration::from_secs(3);
            while Instant::now() < deadline && discovery::is_live(&daemon.sock) {
                std::thread::sleep(Duration::from_millis(20));
            }
            assert!(
                !discovery::is_live(&daemon.sock),
                "daemon should self-exit once its shell dies"
            );
            assert!(
                !daemon.sock.exists(),
                "daemon should remove its socket file on exit"
            );
        });
    }

    /// Pins the deliberate `daemon.rs` contract (see the accept loop's
    /// `Err(_) => { ... break; }` arm): a client disconnecting must NOT tear
    /// the session down. Detached survival is the feature this whole crate
    /// exists to provide — this guards it against regressing while Phase 3
    /// adds a second, legitimate exit path alongside it.
    #[test]
    fn client_detach_does_not_kill_daemon_or_shell() {
        crate::test_support::with_temp_dir("client-detach", |_dir| {
            let daemon = TestDaemon::spawn("t-client-detach", vec!["sleep".into(), "600".into()]);
            let mut s = connect_retry(&daemon.sock);
            let pgid = query_pgid(&mut s);
            drop(s); // detach: no T_KILL sent

            std::thread::sleep(Duration::from_millis(300));
            assert!(
                discovery::is_live(&daemon.sock),
                "daemon must survive a client detach"
            );
            assert_eq!(
                unsafe { libc::kill(pgid, 0) },
                0,
                "shell must still be alive after a mere detach"
            );
        });
    }

    #[test]
    fn t_kill_from_a_connected_client_exits_the_daemon() {
        crate::test_support::with_temp_dir("t-kill", |_dir| {
            let daemon = TestDaemon::spawn("t-t-kill", vec!["sleep".into(), "600".into()]);
            let mut s = connect_retry(&daemon.sock);
            let (tag, _) = read_frame(&mut s).expect("hello frame");
            assert_eq!(tag, T_HELLO);
            write_frame(&mut s, T_KILL, &[]).expect("send kill");

            let deadline = Instant::now() + Duration::from_secs(3);
            while Instant::now() < deadline && discovery::is_live(&daemon.sock) {
                std::thread::sleep(Duration::from_millis(20));
            }
            assert!(
                !discovery::is_live(&daemon.sock),
                "T_KILL from a connected client should terminate the daemon"
            );
        });
    }

}
