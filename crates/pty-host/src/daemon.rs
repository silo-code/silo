//! The session host. Double-forks + `setsid` so it outlives the launching
//! terminal (Proof 1: detached survival), `forkpty`s the shell, holds the
//! master, and serves a per-session Unix socket.

use std::collections::VecDeque;
use std::os::unix::net::{UnixListener, UnixStream};
use std::sync::{Arc, Mutex};
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
            log("shell exited; removing socket and exiting");
            let _ = std::fs::remove_file(&path);
            unsafe { libc::_exit(0) };
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
                // out, so re-resolve it only when the group actually changes.
                let pgid = foreground::pgid(master);
                let cwd = if pgid > 0 {
                    foreground::cwd_of(pgid)
                } else {
                    String::new()
                };
                if pgid == last_pgid && cwd == last_cwd {
                    continue;
                }
                if pgid != last_pgid {
                    name = if pgid > 0 {
                        foreground::name_of(pgid)
                    } else {
                        "?".to_string()
                    };
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
