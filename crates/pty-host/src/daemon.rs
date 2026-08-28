//! The session host. Double-forks + `setsid` so it outlives the launching
//! terminal (Proof 1: detached survival), `forkpty`s the shell, holds the
//! master, and serves a per-session Unix socket.

use std::collections::VecDeque;
use std::io::{Error, ErrorKind};
use std::os::unix::io::{AsRawFd, RawFd};
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, Once};
use std::time::{Duration, Instant};

use crate::foreground;
use crate::paths;
use crate::proto::*;
use crate::pty;

const RING_CAP: usize = 256 * 1024;
/// Steady-state max for the data-plane list. Silo's app opens a *second* socket
/// for `T_SUBSCRIBE_FG` (see `session_host::subscribe_foreground`); that conn
/// must not count against this cap or it will evict the live data client on
/// every attach (Phase 2 regression: OSC color replies / ring replay land on
/// the wrong peer and show up as `10;rgb:…` garbage in the shell).
const MAX_DATA_CLIENTS: usize = 1;
/// Max simultaneous foreground-subscribe clients.
const MAX_FG_CLIENTS: usize = 2;
/// How long to wait after HELLO for an explicit role frame (`T_SUBSCRIBE_FG` or
/// a Data frame). Past this we still do **not** assume Data — a quiet socket
/// that later disconnects is a discovery probe / stalled peer, and registering
/// it would evict the live UI client under `MAX_DATA_CLIENTS=1`.
const FG_CLASSIFY_TIMEOUT: Duration = Duration::from_millis(100);
/// Chunk size for ring replay and live broadcast frames (keeps each socket
/// write within the write-timeout budget).
const REPLAY_CHUNK: usize = 8 * 1024;
/// Bound every client-socket and PTY-master write so a stalled peer / full
/// stdin queue cannot park a daemon thread forever (RFC 0026).
const WRITE_DEADLINE: Duration = Duration::from_secs(1);

type Clients = Arc<Mutex<Vec<Arc<Mutex<UnixStream>>>>>;

/// How an accepted socket is used after the HELLO handshake.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ClientRole {
    /// Receives ring replay + live `T_DATA` (and may later convert via subscribe).
    Data,
    /// `T_SUBSCRIBE_FG` arrived before we registered it as data — fg pushes only.
    Foreground,
}
/// Fork off a detached daemon for `name`. Returns in the *original* process so
/// the caller can attach as a client; the daemon runs in a grandchild.
/// `env` is applied to the session's shell only, never to the daemon itself —
/// see [`crate::pty::fork_pty`].
pub fn spawn_detached(
    name: &str,
    cmd: Vec<String>,
    cwd: String,
    cols: u16,
    rows: u16,
    env: Vec<(String, String)>,
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
                    // Log the variable *names* only. The values are the session's business
                    // (and a workspace path is more than the log needs); the names are
                    // enough to answer "did identity reach this session?".
                    let env_keys: Vec<&str> = env.iter().map(|(k, _)| k.as_str()).collect();
                    log(&format!(
                        "daemon start: name={name} cwd={cwd} size={cols}x{rows} env=[{}]",
                        env_keys.join(",")
                    ));
                    if let Err(e) = run_daemon(name, &cmd, &cwd, cols, rows, &env) {
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

fn run_daemon(
    name: &str,
    cmd: &[String],
    cwd: &str,
    cols: u16,
    rows: u16,
    env: &[(String, String)],
) -> Result<(), String> {
    let pty = pty::fork_pty(cmd, cwd, cols, rows, env)?;
    let master = pty.master;
    let shell_pid = pty.child;
    // Shared with the master reader: O_NONBLOCK so timed PTY stdin writes never
    // park forever when the child stops reading. The reader polls POLLIN on EAGAIN.
    set_fd_nonblocking(master);

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
                let n =
                    unsafe { libc::read(master, buf.as_mut_ptr() as *mut libc::c_void, buf.len()) };
                if n > 0 {
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
                    // Snapshot → write outside the lock → prune (RFC 0026 §Phase 2).
                    broadcast_frame(&clients, T_DATA, slice);
                    continue;
                }
                if n == 0 {
                    break; // shell exited / EOF
                }
                let err = Error::last_os_error();
                match err.kind() {
                    ErrorKind::Interrupted => continue,
                    ErrorKind::WouldBlock => {
                        // Wait for more PTY output (master is O_NONBLOCK).
                        // Treat hangup/error as shell gone — otherwise a
                        // POLLHUP-only wake with no POLLIN can busy-spin.
                        match poll_fd_revents(master, libc::POLLIN, Duration::from_secs(3600)) {
                            None => continue, // timeout
                            Some(re) if re & (libc::POLLHUP | libc::POLLERR) != 0 => break,
                            Some(_) => continue,
                        }
                    }
                    _ => break,
                }
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
                broadcast_frame(&fg_clients, T_FG_REP, &payload);
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
        let _ = stream.set_write_timeout(Some(WRITE_DEADLINE));
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

        // Classify before registering as a data client: Silo's FG subscriber
        // connects and immediately sends T_SUBSCRIBE_FG. If we eagerly push it
        // onto `clients` under MAX_DATA_CLIENTS=1 we evict the real data
        // connection (and replay the ring onto the FG socket, which ignores it).
        let (role_tx, role_rx) = std::sync::mpsc::sync_channel::<ClientRole>(1);
        // `discovery::is_live` / `list_sessions` connect-and-drop to probe.
        // Without this flag, those probes time out as Data under
        // MAX_DATA_CLIENTS=1 and evict the real UI client — shells stay alive
        // but the app reader sees EOF and shows a false "Process exited".
        let client_gone = Arc::new(AtomicBool::new(false));

        let wh = write_half.clone();
        let clients_r = clients.clone();
        let fg_clients_r = fg_clients.clone();
        let gone_r = client_gone.clone();
        std::thread::spawn(move || {
            let mut s = read_half;
            let mut role_tx = Some(role_tx);
            let mut announce = |role: ClientRole| {
                if let Some(tx) = role_tx.take() {
                    let _ = tx.send(role);
                }
            };
            loop {
                match read_frame(&mut s) {
                    Ok((T_DATA, p)) => {
                        announce(ClientRole::Data);
                        write_master_timed(master, &p);
                    }
                    Ok((T_RESIZE, p)) => {
                        announce(ClientRole::Data);
                        if let Some((c, r)) = parse_resize(&p) {
                            pty::set_winsize(master, c, r);
                        }
                    }
                    Ok((T_KILL, _)) => {
                        announce(ClientRole::Data);
                        kill_group(shell_pid);
                    }
                    Ok((T_FG_REQ, _)) => {
                        announce(ClientRole::Data);
                        let fg = foreground::query(master, shell_pid);
                        let mut w = wh.lock().unwrap();
                        let _ = write_frame(&mut *w, T_FG_REP, &foreground::encode(&fg));
                    }
                    Ok((T_SUBSCRIBE_FG, _)) => {
                        announce(ClientRole::Foreground);
                        // Stop receiving data (no-op if we never joined `clients`),
                        // start receiving fg pushes, and get the current value now.
                        clients_r.lock().unwrap().retain(|c| !Arc::ptr_eq(c, &wh));
                        let fg = foreground::query(master, shell_pid);
                        {
                            let mut w = wh.lock().unwrap();
                            let _ = write_frame(&mut *w, T_FG_REP, &foreground::encode(&fg));
                        }
                        evict_clients_to_cap(&fg_clients_r, keep_before_push(MAX_FG_CLIENTS));
                        fg_clients_r.lock().unwrap().push(wh.clone());
                    }
                    Ok(_) => {}
                    Err(_) => {
                        gone_r.store(true, Ordering::SeqCst);
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

        // Classify in a side thread so the accept loop stays responsive.
        // Data clients register only after an explicit Data frame (or FG after
        // `T_SUBSCRIBE_FG`); never on classify-timeout alone — that footgun is
        // what made maintenance-sweep `is_live` probes (and any quiet socket
        // held past FG_CLASSIFY_TIMEOUT) evict the live UI client.
        let clients_f = clients.clone();
        let ring_f = ring.clone();
        let write_half_f = write_half.clone();
        let gone_f = client_gone;
        std::thread::spawn(move || {
            let role = match role_rx.recv_timeout(FG_CLASSIFY_TIMEOUT) {
                Ok(role) => role,
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                    // Still connected but quiet. Wait for an explicit role
                    // frame; if the peer disconnects first, treat as a probe.
                    if gone_f.load(Ordering::SeqCst) {
                        log("ignoring disconnect before classify");
                        return;
                    }
                    match role_rx.recv() {
                        Ok(role) => role,
                        Err(_) => {
                            log("ignoring disconnect before classify");
                            return;
                        }
                    }
                }
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                    log("ignoring disconnect before classify");
                    return;
                }
            };
            // Peer may have dropped between the role announce and here.
            if gone_f.load(Ordering::SeqCst) {
                log("ignoring disconnect before classify");
                return;
            }
            if role == ClientRole::Foreground {
                log("fg client attached");
                return;
            }

            // Cap data clients before registering this one (close previous on reattach).
            evict_clients_to_cap(&clients_f, keep_before_push(MAX_DATA_CLIENTS));

            // Register for live broadcast *before* chunked replay so output that
            // arrives during replay still reaches this client (write_half Mutex
            // serializes with the master-reader broadcast).
            clients_f.lock().unwrap().push(write_half_f.clone());
            log("client attached");

            let snapshot: Vec<u8> = ring_f.lock().unwrap().iter().copied().collect();
            if !replay_ring_chunked(&write_half_f, &snapshot) {
                if let Ok(w) = write_half_f.lock() {
                    let _ = w.shutdown(std::net::Shutdown::Both);
                }
                clients_f
                    .lock()
                    .unwrap()
                    .retain(|c| !Arc::ptr_eq(c, &write_half_f));
                log("client dropped during ring replay");
            }
        });
    }
    Ok(())
}

/// Snapshot clients, write each frame outside the list lock, prune failures.
fn broadcast_frame(clients: &Clients, tag: u8, payload: &[u8]) {
    let snapshot: Vec<Arc<Mutex<UnixStream>>> = {
        let cs = clients.lock().unwrap();
        cs.clone()
    };
    let mut dead: Vec<Arc<Mutex<UnixStream>>> = Vec::new();
    for c in &snapshot {
        let ok = {
            let mut w = c.lock().unwrap();
            write_frame(&mut *w, tag, payload).is_ok()
        };
        if !ok {
            // Shut down so the app reader sees EOF (not a silent hung attach
            // parked mid-frame after a write-timeout desync).
            if let Ok(w) = c.lock() {
                let _ = w.shutdown(std::net::Shutdown::Both);
            }
            dead.push(Arc::clone(c));
        }
    }
    if dead.is_empty() {
        return;
    }
    let mut cs = clients.lock().unwrap();
    cs.retain(|c| !dead.iter().any(|d| Arc::ptr_eq(d, c)));
}

/// Close and drop the oldest clients until `len() <= keep`.
fn evict_clients_to_cap(clients: &Clients, keep: usize) {
    let evicted: Vec<Arc<Mutex<UnixStream>>> = {
        let mut cs = clients.lock().unwrap();
        if cs.len() <= keep {
            return;
        }
        let drop_n = cs.len() - keep;
        cs.drain(0..drop_n).collect()
    };
    for c in evicted {
        if let Ok(w) = c.lock() {
            let _ = w.shutdown(std::net::Shutdown::Both);
        }
        log("evicted prior client (cap)");
    }
}

/// Replay the ring as `REPLAY_CHUNK`-sized T_DATA frames. Returns false if a
/// write failed (caller should prune the client).
fn replay_ring_chunked(write_half: &Arc<Mutex<UnixStream>>, snapshot: &[u8]) -> bool {
    if snapshot.is_empty() {
        return true;
    }
    for chunk in snapshot.chunks(REPLAY_CHUNK) {
        let mut w = write_half.lock().unwrap();
        if write_frame(&mut *w, T_DATA, chunk).is_err() {
            return false;
        }
    }
    true
}

fn set_fd_nonblocking(fd: RawFd) {
    unsafe {
        let flags = libc::fcntl(fd, libc::F_GETFL);
        if flags >= 0 {
            let _ = libc::fcntl(fd, libc::F_SETFL, flags | libc::O_NONBLOCK);
        }
    }
}

fn poll_fd(fd: RawFd, events: i16, timeout: Duration) -> bool {
    poll_fd_revents(fd, events, timeout).is_some_and(|re| (re & events) != 0)
}

/// Like [`poll_fd`], but returns the raw `revents` (or `None` on timeout /
/// poll error) so callers can distinguish hangup from readable.
fn poll_fd_revents(fd: RawFd, events: i16, timeout: Duration) -> Option<i16> {
    let mut pfd = libc::pollfd {
        fd,
        events,
        revents: 0,
    };
    let ms = timeout.as_millis().min(i32::MAX as u128) as i32;
    let rc = unsafe { libc::poll(&mut pfd, 1, ms) };
    if rc > 0 {
        Some(pfd.revents)
    } else {
        None
    }
}

/// Timed non-blocking write to the PTY master. Drops remaining bytes on
/// deadline expiry rather than parking the client-reader forever.
fn write_master_timed(master: RawFd, data: &[u8]) {
    if data.is_empty() {
        return;
    }
    let deadline = Instant::now() + WRITE_DEADLINE;
    let mut off = 0usize;
    while off < data.len() {
        let n = unsafe {
            libc::write(
                master,
                data[off..].as_ptr() as *const libc::c_void,
                data.len() - off,
            )
        };
        if n > 0 {
            off += n as usize;
            continue;
        }
        if n == 0 {
            log("write_master: EOF");
            return;
        }
        let err = Error::last_os_error();
        match err.kind() {
            ErrorKind::Interrupted => continue,
            ErrorKind::WouldBlock => {
                let remaining = deadline.saturating_duration_since(Instant::now());
                if remaining.is_zero() {
                    log(&format!(
                        "write_master: timeout after {off}/{} bytes",
                        data.len()
                    ));
                    return;
                }
                if !poll_fd(master, libc::POLLOUT, remaining) {
                    log(&format!(
                        "write_master: timeout after {off}/{} bytes",
                        data.len()
                    ));
                    return;
                }
            }
            _ => {
                log(&format!("write_master: {err}"));
                return;
            }
        }
    }
}

/// How many clients to keep when adding one more under `max` (pure helper for tests).
fn keep_before_push(max: usize) -> usize {
    max.saturating_sub(1)
}

/// Number of REPLAY_CHUNK frames a ring of `len` bytes needs (pure helper for tests).
#[cfg(test)]
fn replay_frame_count(len: usize, chunk: usize) -> usize {
    if len == 0 || chunk == 0 {
        return 0;
    }
    len.div_ceil(chunk)
}

/// Verify the connecting peer shares our uid. Peer-credential lookup differs by
/// platform — `getpeereid` on macOS/BSD, `SO_PEERCRED` on Linux — so this is
/// split by `cfg`. If it can't be determined we allow (best-effort — the `0700`
/// socket dir is the primary guard).
fn peer_is_owner(stream: &UnixStream) -> bool {
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

#[cfg(test)]
mod backpressure_helpers_tests {
    use super::{keep_before_push, replay_frame_count, MAX_DATA_CLIENTS, REPLAY_CHUNK, RING_CAP};

    #[test]
    fn keep_before_push_leaves_room_for_one() {
        assert_eq!(keep_before_push(MAX_DATA_CLIENTS), 0);
        assert_eq!(keep_before_push(2), 1);
        assert_eq!(keep_before_push(0), 0);
    }

    #[test]
    fn fg_classify_timeout_is_sub_second() {
        assert!(super::FG_CLASSIFY_TIMEOUT < std::time::Duration::from_secs(1));
        assert!(super::FG_CLASSIFY_TIMEOUT > std::time::Duration::ZERO);
    }

    #[test]
    fn replay_frame_count_chunks_full_ring() {
        assert_eq!(replay_frame_count(0, REPLAY_CHUNK), 0);
        assert_eq!(replay_frame_count(1, REPLAY_CHUNK), 1);
        assert_eq!(replay_frame_count(REPLAY_CHUNK, REPLAY_CHUNK), 1);
        assert_eq!(replay_frame_count(REPLAY_CHUNK + 1, REPLAY_CHUNK), 2);
        assert_eq!(
            replay_frame_count(RING_CAP, REPLAY_CHUNK),
            RING_CAP / REPLAY_CHUNK
        );
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
            Self::spawn_with_env(name, cmd, Vec::new())
        }

        fn spawn_with_env(name: &str, cmd: Vec<String>, env: Vec<(String, String)>) -> Self {
            let _g = SPAWN_GUARD.lock().unwrap_or_else(|e| e.into_inner());
            spawn_detached(name, cmd, "/tmp".to_string(), 80, 24, env).expect("spawn_detached");
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

    /// `discovery::is_live` / `list_sessions` connect-and-drop. Under
    /// `MAX_DATA_CLIENTS=1`, classifying those probes as Data used to evict
    /// the real UI client — multi-workspace "New Terminal" then showed a false
    /// "Process exited" on every prior tab. A live data client must survive
    /// a storm of probes.
    #[test]
    fn discovery_probe_does_not_evict_data_client() {
        crate::test_support::with_temp_dir("probe-evict", |_dir| {
            let daemon = TestDaemon::spawn("t-probe-evict", vec!["sleep".into(), "600".into()]);
            let mut data = connect_retry(&daemon.sock);
            let (tag, _) = read_frame(&mut data).expect("hello");
            assert_eq!(tag, T_HELLO);
            // Announce as Data immediately (same as app attach's T_RESIZE).
            write_frame(&mut data, T_RESIZE, &resize_payload(80, 24)).expect("resize");
            // Past FG_CLASSIFY_TIMEOUT so the data client is registered.
            std::thread::sleep(FG_CLASSIFY_TIMEOUT + Duration::from_millis(50));

            for _ in 0..8 {
                assert!(
                    discovery::is_live(&daemon.sock),
                    "probe must see a live daemon"
                );
            }
            let _ = discovery::list_sessions();
            // Let probe classify threads time out / observe disconnect.
            std::thread::sleep(FG_CLASSIFY_TIMEOUT + Duration::from_millis(100));

            // If the data client was evicted, the daemon shut the socket down
            // and this control round-trip fails.
            write_frame(&mut data, T_FG_REQ, &[]).expect("fg req after probes");
            data.set_read_timeout(Some(Duration::from_secs(2)))
                .expect("read timeout");
            let mut saw_fg = false;
            for _ in 0..8 {
                match read_frame(&mut data) {
                    Ok((T_FG_REP, _)) => {
                        saw_fg = true;
                        break;
                    }
                    Ok(_) => continue,
                    Err(e) => panic!("data client died after discovery probes: {e}"),
                }
            }
            assert!(saw_fg, "data client must still receive T_FG_REP after probes");
        });
    }

    /// Quiet socket held past `FG_CLASSIFY_TIMEOUT` with no role frame — the
    /// maintenance-sweep race stand-in (`METHOD=silent-hold`). Must not default
    /// to Data and evict the live UI client.
    #[test]
    fn silent_hold_does_not_evict_data_client() {
        crate::test_support::with_temp_dir("silent-hold", |_dir| {
            let daemon = TestDaemon::spawn("t-silent-hold", vec!["sleep".into(), "600".into()]);
            let mut data = connect_retry(&daemon.sock);
            let (tag, _) = read_frame(&mut data).expect("hello");
            assert_eq!(tag, T_HELLO);
            write_frame(&mut data, T_RESIZE, &resize_payload(80, 24)).expect("resize");
            std::thread::sleep(FG_CLASSIFY_TIMEOUT + Duration::from_millis(50));

            let mut quiet = connect_retry(&daemon.sock);
            let (tag, _) = read_frame(&mut quiet).expect("hello");
            assert_eq!(tag, T_HELLO);
            // Hold past classify timeout with no Data/FG frame, then drop —
            // same shape as a starved `is_live` probe under load.
            std::thread::sleep(FG_CLASSIFY_TIMEOUT + Duration::from_millis(150));
            drop(quiet);
            std::thread::sleep(FG_CLASSIFY_TIMEOUT + Duration::from_millis(50));

            write_frame(&mut data, T_FG_REQ, &[]).expect("fg req after silent hold");
            data.set_read_timeout(Some(Duration::from_secs(2)))
                .expect("read timeout");
            let mut saw_fg = false;
            for _ in 0..8 {
                match read_frame(&mut data) {
                    Ok((T_FG_REP, _)) => {
                        saw_fg = true;
                        break;
                    }
                    Ok(_) => continue,
                    Err(e) => panic!("data client died after silent hold: {e}"),
                }
            }
            assert!(
                saw_fg,
                "data client must survive a quiet socket held past classify timeout"
            );
        });
    }

    /// A slow Data announce (past `FG_CLASSIFY_TIMEOUT`) must still register and
    /// receive ring/broadcast — we wait for an explicit frame rather than
    /// giving up or mis-classifying probes.
    #[test]
    fn slow_data_announce_still_registers() {
        crate::test_support::with_temp_dir("slow-data", |_dir| {
            let daemon = TestDaemon::spawn("t-slow-data", vec!["sleep".into(), "600".into()]);
            let mut stream = connect_retry(&daemon.sock);
            let (tag, _) = read_frame(&mut stream).expect("hello");
            assert_eq!(tag, T_HELLO);
            std::thread::sleep(FG_CLASSIFY_TIMEOUT + Duration::from_millis(50));
            write_frame(&mut stream, T_RESIZE, &resize_payload(80, 24)).expect("late resize");
            std::thread::sleep(Duration::from_millis(50));

            write_frame(&mut stream, T_FG_REQ, &[]).expect("fg req");
            stream
                .set_read_timeout(Some(Duration::from_secs(2)))
                .expect("read timeout");
            let mut saw_fg = false;
            for _ in 0..8 {
                match read_frame(&mut stream) {
                    Ok((T_FG_REP, _)) => {
                        saw_fg = true;
                        break;
                    }
                    Ok(_) => continue,
                    Err(e) => panic!("slow Data client never registered: {e}"),
                }
            }
            assert!(saw_fg, "late T_RESIZE must still classify as Data");
        });
    }

    /// Read from `stream` until `needle` appears or the deadline passes.
    /// Returns everything seen, so a failure can show what actually arrived.
    fn read_until(stream: &mut UnixStream, needle: &str, timeout: Duration) -> String {
        stream
            .set_read_timeout(Some(Duration::from_millis(250)))
            .expect("read timeout");
        let mut seen = String::new();
        let deadline = Instant::now() + timeout;
        while Instant::now() < deadline {
            match read_frame(stream) {
                Ok((T_DATA, payload)) => {
                    seen.push_str(&String::from_utf8_lossy(&payload));
                    if seen.contains(needle) {
                        return seen;
                    }
                }
                Ok(_) => continue,
                Err(_) => continue, // read timeout — keep waiting for the shell
            }
        }
        seen
    }

    /// The RFC 0028 contract, end to end: identity handed to `spawn_detached`
    /// reaches the shell, and is **still there after the client that created
    /// the session goes away and a new one attaches** — which is the same
    /// mechanism that carries a session across an app restart, without needing
    /// to restart an app.
    #[test]
    fn session_identity_reaches_the_shell_and_survives_reattach() {
        crate::test_support::with_temp_dir("session-env", |_dir| {
            let env = vec![
                ("SILO".to_string(), "1".to_string()),
                ("SILO_TERMINAL_ID".to_string(), "t_deadbeef".to_string()),
            ];
            let daemon = TestDaemon::spawn_with_env(
                "t-session-env",
                vec!["/bin/sh".into()],
                env,
            );

            // First client: create-time attach.
            let mut first = connect_retry(&daemon.sock);
            let (tag, _) = read_frame(&mut first).expect("hello");
            assert_eq!(tag, T_HELLO);
            write_frame(&mut first, T_RESIZE, &resize_payload(80, 24)).expect("resize");
            std::thread::sleep(FG_CLASSIFY_TIMEOUT + Duration::from_millis(50));

            // Marker prefix so we match the command's *output*, not its echo.
            write_frame(
                &mut first,
                T_DATA,
                b"echo \"id=[$SILO_TERMINAL_ID]\" \"flag=[$SILO]\"\n",
            )
            .expect("write echo");
            let seen = read_until(&mut first, "id=[t_deadbeef]", Duration::from_secs(5));
            assert!(
                seen.contains("id=[t_deadbeef]"),
                "terminal id must reach the shell; saw: {seen:?}"
            );
            assert!(
                seen.contains("flag=[1]"),
                "SILO flag must reach the shell; saw: {seen:?}"
            );

            // Drop the creating client and attach a fresh one — the session
            // outlives the client, exactly as it outlives an app restart.
            first
                .shutdown(std::net::Shutdown::Both)
                .expect("detach the first client");
            drop(first);
            std::thread::sleep(Duration::from_millis(200));

            let mut second = connect_retry(&daemon.sock);
            let (tag, _) = read_frame(&mut second).expect("hello on reattach");
            assert_eq!(tag, T_HELLO);
            write_frame(&mut second, T_RESIZE, &resize_payload(80, 24)).expect("resize");
            std::thread::sleep(FG_CLASSIFY_TIMEOUT + Duration::from_millis(50));

            write_frame(&mut second, T_DATA, b"echo \"again=[$SILO_TERMINAL_ID]\"\n")
                .expect("write echo after reattach");
            let seen = read_until(&mut second, "again=[t_deadbeef]", Duration::from_secs(5));
            assert!(
                seen.contains("again=[t_deadbeef]"),
                "identity must survive reattach; saw: {seen:?}"
            );
        });
    }

    /// A session spawned with no identity must not inherit one from whatever
    /// environment the daemon happened to start in.
    #[test]
    fn a_session_with_no_identity_has_no_terminal_id() {
        crate::test_support::with_temp_dir("session-env-none", |_dir| {
            let daemon = TestDaemon::spawn("t-session-env-none", vec!["/bin/sh".into()]);
            let mut c = connect_retry(&daemon.sock);
            let (tag, _) = read_frame(&mut c).expect("hello");
            assert_eq!(tag, T_HELLO);
            write_frame(&mut c, T_RESIZE, &resize_payload(80, 24)).expect("resize");
            std::thread::sleep(FG_CLASSIFY_TIMEOUT + Duration::from_millis(50));

            write_frame(&mut c, T_DATA, b"echo \"id=[$SILO_TERMINAL_ID]\"\n")
                .expect("write echo");
            let seen = read_until(&mut c, "id=[]", Duration::from_secs(5));
            assert!(
                seen.contains("id=[]"),
                "an unclaimed session must have an empty terminal id; saw: {seen:?}"
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
