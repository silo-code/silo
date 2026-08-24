// Windows terminal session backend: ConPTY daemon + TCP loopback client.
//
// Architecture mirrors the Unix pty-host (RFC 0010) but self-contained:
// no external crate. The daemon is self-re-exec'd with `--win-session-host`
// (handled in main.rs), binds a random TCP port, writes the port to a file,
// then serves client connections. The client side reads the port file and
// connects. Wire protocol: [tag:u8][len:u32 BE][payload] — T_DATA=0,
// T_RESIZE=1, T_KILL=2.

use std::collections::VecDeque;
use std::io::{self, Read, Write};
use std::net::{Shutdown, TcpListener, TcpStream};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

use parking_lot::Mutex;
use portable_pty::PtySize;

use super::session_backend::{
    log_event, Connection, ForegroundInfo, ForegroundSub, SessionBackend, SessionChild,
    SessionMaster,
};
use super::session_env::{encode_session_env, SESSION_ENV_CARRIER};

// ── Protocol ─────────────────────────────────────────────────────────────────

const T_DATA: u8 = 0;
const T_RESIZE: u8 = 1;
const T_KILL: u8 = 2;
/// Daemon → client: a foreground-process update, tab-separated
/// `<pid>\t<at_prompt 0|1>\t<leader name>`. Mirrors the Unix host's T_FG_REP.
const T_FG_REP: u8 = 4;
/// Client → daemon: turn this connection into a foreground-events subscriber.
/// Such a connection must never join `clients` — under MAX_DATA_CLIENTS = 1 it
/// would evict the live data client (the same regression RFC 0026 hit on Unix).
const T_SUBSCRIBE_FG: u8 = 6;

/// How often to re-snapshot the process tree while a foreground subscriber is
/// attached. `CreateToolhelp32Snapshot` enumerates *every* process on the
/// machine, so this is not free — with a dozen terminals open a tight loop is
/// real overhead. Poll briskly right after a change (an agent starting is what
/// the user is waiting to see) and back off while the answer is stable.
const FG_POLL_FAST: Duration = Duration::from_millis(500);
const FG_POLL_IDLE: Duration = Duration::from_millis(2500);
/// Stay on the fast cadence for this long after the leader last changed.
const FG_SETTLE: Duration = Duration::from_secs(5);

const RING_CAPACITY: usize = 256 * 1024;
const CONNECT_TIMEOUT: Duration = Duration::from_millis(3000);
const NAME_PREFIX: &str = "silo";
/// Bound client TCP writes and PTY stdin drains (RFC 0026 Phase 2).
const WRITE_DEADLINE: Duration = Duration::from_secs(1);
const REPLAY_CHUNK: usize = 8 * 1024;
const MAX_DATA_CLIENTS: usize = 1;
/// Wait this long for a first client frame before treating the connection as
/// a silent data client. Connect-and-drop probes (`exists`) disconnect sooner
/// and must not join `clients` (that would evict the live UI under
/// `MAX_DATA_CLIENTS=1` — same class of bug as Unix discovery probes).
const CLIENT_CLASSIFY_TIMEOUT: Duration = Duration::from_millis(100);
/// Soft cap on queued stdin chunks when ConPTY write blocks.
const INPUT_QUEUE_CAP: usize = 64;

fn write_frame<W: Write>(w: &mut W, tag: u8, payload: &[u8]) -> io::Result<()> {
    w.write_all(&[tag])?;
    w.write_all(&(payload.len() as u32).to_be_bytes())?;
    w.write_all(payload)?;
    w.flush()
}

fn read_frame<R: Read>(r: &mut R) -> io::Result<(u8, Vec<u8>)> {
    let mut hdr = [0u8; 5];
    r.read_exact(&mut hdr)?;
    let tag = hdr[0];
    let len = u32::from_be_bytes([hdr[1], hdr[2], hdr[3], hdr[4]]) as usize;
    let mut payload = vec![0u8; len];
    if len > 0 {
        r.read_exact(&mut payload)?;
    }
    Ok((tag, payload))
}

/// Serve one foreground-events subscriber until it disconnects.
///
/// Unix gets this for free: `tcgetpgrp` on the PTY master reports the
/// foreground process group, and the daemon blocks until it changes. ConPTY has
/// no such notion, so the leader is *inferred* by walking the process tree from
/// the shell we spawned (see `process_tree`). That inference is only as good as
/// its cadence, hence the poll — there is no change event to wait on.
///
/// Only differences are sent, so a terminal sitting at a prompt costs one
/// snapshot every `FG_POLL_IDLE` and no traffic at all.
#[cfg(windows)]
fn serve_foreground(mut stream: TcpStream, child_pid: Arc<AtomicU32>) {
    use super::process_tree;

    let mut last: Option<(u32, bool)> = None;
    let mut last_change = Instant::now();

    loop {
        let root = child_pid.load(Ordering::Acquire);
        if root == 0 {
            return; // shell never started, or already reaped
        }

        match process_tree::resolve_leader(&process_tree::snapshot(), root) {
            Some(leader) => {
                let key = (leader.pid, leader.at_prompt);
                if last != Some(key) {
                    last = Some(key);
                    last_change = Instant::now();
                    // `cwd` is deliberately absent: Unix reads it from
                    // /proc or KERN_PROCARGS, and Windows has no cheap
                    // equivalent. The seam allows "" for unknown.
                    let payload = format!(
                        "{}\t{}\t{}",
                        leader.pid,
                        if leader.at_prompt { 1 } else { 0 },
                        leader.name
                    );
                    if write_frame(&mut stream, T_FG_REP, payload.as_bytes()).is_err() {
                        return; // subscriber gone
                    }
                }
            }
            None => {
                // The shell is no longer in the snapshot — the session is over.
                return;
            }
        }

        let interval = if last_change.elapsed() < FG_SETTLE {
            FG_POLL_FAST
        } else {
            FG_POLL_IDLE
        };
        thread::sleep(interval);
    }
}

// ── Paths ─────────────────────────────────────────────────────────────────────

fn sessions_dir() -> Option<std::path::PathBuf> {
    std::env::var("SILO_DATA_DIR")
        .ok()
        .map(|d| std::path::PathBuf::from(d).join("sessions"))
}

fn port_path(handle: &str) -> Option<std::path::PathBuf> {
    sessions_dir().map(|d| d.join(format!("{}.port", handle)))
}

// ── Daemon (run_daemon is called from main.rs via silo_lib::run_win_session_host) ──

fn kill_child(pid: u32) {
    extern "system" {
        fn OpenProcess(access: u32, inherit: i32, pid: u32) -> *mut std::ffi::c_void;
        fn TerminateProcess(handle: *mut std::ffi::c_void, exit_code: u32) -> i32;
        fn CloseHandle(handle: *mut std::ffi::c_void) -> i32;
    }
    const PROCESS_TERMINATE: u32 = 0x0001;
    unsafe {
        let h = OpenProcess(PROCESS_TERMINATE, 0, pid);
        if !h.is_null() {
            TerminateProcess(h, 1);
            CloseHandle(h);
        }
    }
}

/// `env` is the session's terminal identity (RFC 0028), applied to the ConPTY
/// child only — never to the daemon that owns it.
pub fn run_daemon(
    handle: &str,
    cmd: Vec<String>,
    cwd: &str,
    cols: u16,
    rows: u16,
    env: &std::collections::HashMap<String, String>,
) -> Result<(), String> {
    use portable_pty::{native_pty_system, CommandBuilder};

    log_event("daemon_start", &format!("handle={handle} cwd={cwd}"));
    let pty_system = native_pty_system();
    let size = PtySize { rows, cols, pixel_width: 0, pixel_height: 0 };
    let pty_pair = pty_system.openpty(size).map_err(|e| format!("openpty: {e}"))?;

    let mut builder = CommandBuilder::new(&cmd[0]);
    for arg in cmd.iter().skip(1) {
        builder.arg(arg);
    }
    builder.cwd(cwd);
    for (key, value) in env {
        builder.env(key, value);
    }

    let child = pty_pair
        .slave
        .spawn_command(builder)
        .map_err(|e| format!("spawn: {e}"))?;
    drop(pty_pair.slave);

    let child_pid = Arc::new(AtomicU32::new(child.process_id().unwrap_or(0)));
    let pty_writer = pty_pair
        .master
        .take_writer()
        .map_err(|e| format!("take_writer: {e}"))?;
    let pty_reader = pty_pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("clone_reader: {e}"))?;
    let master = Arc::new(Mutex::new(pty_pair.master));

    // Dedicated PTY stdin writer: bounded queue so client readers never park
    // forever when ConPTY's stdin queue is full (RFC 0026 Phase 2).
    let (input_tx, input_rx) = std::sync::mpsc::sync_channel::<Vec<u8>>(INPUT_QUEUE_CAP);
    {
        let mut writer = pty_writer;
        thread::spawn(move || {
            while let Ok(data) = input_rx.recv() {
                let deadline = Instant::now() + WRITE_DEADLINE;
                let mut off = 0usize;
                while off < data.len() {
                    if Instant::now() >= deadline {
                        log_event(
                            "write_master_timeout",
                            &format!("wrote={off}/{}", data.len()),
                        );
                        break;
                    }
                    match writer.write(&data[off..]) {
                        Ok(0) => break,
                        Ok(n) => off += n,
                        Err(e) if e.kind() == io::ErrorKind::Interrupted => continue,
                        Err(e) if e.kind() == io::ErrorKind::WouldBlock => {
                            thread::sleep(Duration::from_millis(5));
                            continue;
                        }
                        Err(e) => {
                            log_event("write_master_err", &e.to_string());
                            break;
                        }
                    }
                }
            }
        });
    }
    let input_tx = Arc::new(input_tx);

    let ring: Arc<Mutex<VecDeque<u8>>> =
        Arc::new(Mutex::new(VecDeque::with_capacity(RING_CAPACITY)));
    let clients: Arc<Mutex<Vec<std::sync::mpsc::Sender<Vec<u8>>>>> =
        Arc::new(Mutex::new(Vec::new()));

    // PTY reader → ring + broadcast to all connected clients.
    // Channel send is non-blocking when the peer is alive; retain under the lock
    // is fine (the bounded stall is on the TCP write in the per-client forwarder).
    {
        let ring = ring.clone();
        let clients = clients.clone();
        thread::spawn(move || {
            let mut buf = [0u8; 4096];
            let mut reader = pty_reader;
            loop {
                match reader.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        let chunk = buf[..n].to_vec();
                        {
                            let mut r = ring.lock();
                            r.extend(&chunk);
                            while r.len() > RING_CAPACITY {
                                r.pop_front();
                            }
                        }
                        let mut senders = clients.lock();
                        senders.retain(|tx| tx.send(chunk.clone()).is_ok());
                    }
                }
            }
        });
    }

    let listener =
        TcpListener::bind("127.0.0.1:0").map_err(|e| format!("bind: {e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("local_addr: {e}"))?
        .port();

    let ppath = port_path(handle).ok_or("SILO_DATA_DIR not set")?;
    if let Some(dir) = ppath.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("mkdir: {e}"))?;
    }
    std::fs::write(&ppath, port.to_string()).map_err(|e| format!("write port: {e}"))?;
    log_event("daemon_port_written", &format!("handle={handle} port={port}"));

    for incoming in listener.incoming() {
        let Ok(mut stream) = incoming else { continue };
        let _ = stream.set_write_timeout(Some(WRITE_DEADLINE));
        let ring = ring.clone();
        let clients = clients.clone();
        let input_tx = input_tx.clone();
        let master = master.clone();
        let child_pid = child_pid.clone();
        let ppath = ppath.clone();

        thread::spawn(move || {
            let mut cmd_stream = match stream.try_clone() {
                Ok(s) => s,
                Err(_) => return,
            };
            let _ = cmd_stream.set_read_timeout(Some(CLIENT_CLASSIFY_TIMEOUT));

            // Classify before joining `clients`: a probe disconnects with no
            // frame; a real attach usually sends T_RESIZE immediately; a fresh
            // create may stay silent past the timeout (still a data client).
            let first = match read_frame(&mut cmd_stream) {
                Ok(frame) => Some(frame),
                Err(e)
                    if e.kind() == io::ErrorKind::WouldBlock
                        || e.kind() == io::ErrorKind::TimedOut =>
                {
                    None
                }
                Err(_) => {
                    let _ = stream.shutdown(Shutdown::Both);
                    return;
                }
            };
            let _ = cmd_stream.set_read_timeout(None);

            // A foreground subscriber never becomes a data client — joining
            // `clients` here would evict the live one under MAX_DATA_CLIENTS.
            if matches!(first, Some((T_SUBSCRIBE_FG, _))) {
                serve_foreground(stream, child_pid);
                return;
            }

            let (tx, rx) = std::sync::mpsc::channel::<Vec<u8>>();

            // Cap data clients on reattach so fds / forwarders cannot climb.
            {
                let mut senders = clients.lock();
                while senders.len() >= MAX_DATA_CLIENTS {
                    let _ = senders.remove(0);
                }
                senders.push(tx);
            }

            if let Some((tag, payload)) = first {
                match tag {
                    T_DATA => {
                        let _ = input_tx.try_send(payload);
                    }
                    T_RESIZE if payload.len() >= 4 => {
                        let cols = u16::from_be_bytes([payload[0], payload[1]]);
                        let rows = u16::from_be_bytes([payload[2], payload[3]]);
                        let _ = master.lock().resize(PtySize {
                            rows,
                            cols,
                            pixel_width: 0,
                            pixel_height: 0,
                        });
                    }
                    T_KILL => {
                        let pid = child_pid.load(Ordering::Acquire);
                        if pid != 0 {
                            kill_child(pid);
                        }
                        let _ = std::fs::remove_file(&ppath);
                        std::process::exit(0);
                    }
                    _ => {}
                }
            }

            // Per-client command reader *before* ring replay (RFC 0026 Phase 2.1).
            {
                let input_tx = input_tx.clone();
                let master = master.clone();
                let child_pid = child_pid.clone();
                let ppath = ppath.clone();
                thread::spawn(move || loop {
                    match read_frame(&mut cmd_stream) {
                        Ok((T_DATA, data)) => {
                            let _ = input_tx.try_send(data);
                        }
                        Ok((T_RESIZE, p)) if p.len() >= 4 => {
                            let cols = u16::from_be_bytes([p[0], p[1]]);
                            let rows = u16::from_be_bytes([p[2], p[3]]);
                            let _ = master.lock().resize(PtySize {
                                rows,
                                cols,
                                pixel_width: 0,
                                pixel_height: 0,
                            });
                        }
                        Ok((T_KILL, _)) => {
                            let pid = child_pid.load(Ordering::Acquire);
                            if pid != 0 {
                                kill_child(pid);
                            }
                            let _ = std::fs::remove_file(&ppath);
                            std::process::exit(0);
                        }
                        _ => break,
                    }
                });
            }

            // Chunked ring replay under the TCP write timeout.
            let ring_data: Vec<u8> = ring.lock().iter().copied().collect();
            for chunk in ring_data.chunks(REPLAY_CHUNK) {
                let mut s = &stream;
                if write_frame(&mut s, T_DATA, chunk).is_err() {
                    let _ = stream.shutdown(Shutdown::Both);
                    return;
                }
            }

            // Forward live output; shut down on exit so the app reader gets EOF.
            let mut s = stream;
            for chunk in rx {
                if write_frame(&mut s, T_DATA, &chunk).is_err() {
                    break;
                }
            }
            let _ = s.shutdown(Shutdown::Both);
        });
    }

    Ok(())
}

// ── Client-side SessionBackend ────────────────────────────────────────────────

pub struct SessionWindowsBackend;

impl SessionWindowsBackend {
    fn spawn_daemon(
        &self,
        handle: &str,
        cwd: &str,
        size: PtySize,
        command: Option<&[String]>,
        env: Option<std::collections::HashMap<String, String>>,
    ) -> Result<(), String> {
        use std::os::windows::process::CommandExt;
        const DETACHED_PROCESS: u32 = 0x0000_0008;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;

        let exe = std::env::current_exe().map_err(|e| format!("current_exe: {e}"))?;
        if let Some(dir) = sessions_dir() {
            let _ = std::fs::create_dir_all(dir);
        }

        let mut args = vec![
            "--win-session-host".to_string(),
            handle.to_string(),
            cwd.to_string(),
            size.cols.to_string(),
            size.rows.to_string(),
        ];
        if let Some(argv) = command {
            if !argv.is_empty() {
                args.push("--".to_string());
                args.extend_from_slice(argv);
            }
        }

        let mut cmd = std::process::Command::new(exe);
        // One JSON carrier across the re-exec, parsed and removed by the daemon
        // entry point — same contract as the Unix backend (RFC 0028).
        if let Some(map) = env.filter(|m| !m.is_empty()) {
            cmd.env(SESSION_ENV_CARRIER, encode_session_env(&map));
        }
        cmd.args(&args)
            .creation_flags(DETACHED_PROCESS | CREATE_NO_WINDOW)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .map_err(|e| format!("spawn daemon: {e}"))?;
        Ok(())
    }

    fn connect(&self, handle: &str) -> Result<TcpStream, String> {
        let ppath = port_path(handle).ok_or("SILO_DATA_DIR not set")?;
        let deadline = Instant::now() + CONNECT_TIMEOUT;
        loop {
            if let Ok(s) = std::fs::read_to_string(&ppath) {
                if let Ok(port) = s.trim().parse::<u16>() {
                    match TcpStream::connect(format!("127.0.0.1:{port}")) {
                        Ok(stream) => return Ok(stream),
                        Err(_) if Instant::now() < deadline => {}
                        Err(e) => return Err(format!("connect {handle}: {e}")),
                    }
                }
            }
            if Instant::now() >= deadline {
                return Err(format!("timeout waiting for daemon {handle}"));
            }
            thread::sleep(Duration::from_millis(20));
        }
    }

    fn connection_from(&self, stream: TcpStream) -> Result<Connection, String> {
        let r = stream.try_clone().map_err(|e| e.to_string())?;
        let w = stream.try_clone().map_err(|e| e.to_string())?;
        let m = stream.try_clone().map_err(|e| e.to_string())?;
        // RFC 0026: bound socket writes so a stalled session host becomes an
        // error on the writer thread instead of an unbounded sleep.
        w.set_write_timeout(Some(Duration::from_secs(1)))
            .map_err(|e| e.to_string())?;
        Ok(Connection {
            reader: Box::new(TcpReader::new(r)),
            writer: Box::new(TcpWriter(w)),
            master: Box::new(TcpMaster(m)),
            child: Box::new(TcpChild(stream)),
        })
    }
}

impl SessionBackend for SessionWindowsBackend {
    fn handle_for(&self, session_id: &str) -> String {
        format!(
            "{}-{}",
            NAME_PREFIX,
            session_id.chars().take(8).collect::<String>()
        )
    }

    fn create(
        &self,
        handle: &str,
        cwd: &str,
        size: PtySize,
        command: Option<Vec<String>>,
        env: Option<std::collections::HashMap<String, String>>,
    ) -> Result<Connection, String> {
        self.spawn_daemon(handle, cwd, size, command.as_deref(), env)?;
        log_event("win_daemon_spawned", &format!("handle={handle}"));
        let stream = self.connect(handle)?;
        log_event("win_create", &format!("handle={handle} cwd={cwd}"));
        self.connection_from(stream)
    }

    fn attach(&self, handle: &str, size: PtySize) -> Result<Connection, String> {
        let stream = self.connect(handle)?;
        {
            let mut s = &stream;
            let mut p = Vec::with_capacity(4);
            p.extend_from_slice(&size.cols.to_be_bytes());
            p.extend_from_slice(&size.rows.to_be_bytes());
            let _ = write_frame(&mut s, T_RESIZE, &p);
        }
        log_event("win_attach", &format!("handle={handle}"));
        self.connection_from(stream)
    }

    fn exists(&self, handle: &str) -> bool {
        let ppath = match port_path(handle) {
            Some(p) => p,
            None => return false,
        };
        if let Ok(s) = std::fs::read_to_string(&ppath) {
            if let Ok(port) = s.trim().parse::<u16>() {
                return TcpStream::connect(format!("127.0.0.1:{port}")).is_ok();
            }
        }
        false
    }

    fn list(&self) -> Vec<String> {
        let dir = match sessions_dir() {
            Some(d) => d,
            None => return vec![],
        };
        let Ok(entries) = std::fs::read_dir(&dir) else {
            return vec![];
        };
        entries
            .flatten()
            .filter_map(|e| {
                let p = e.path();
                if p.extension()?.to_str()? != "port" {
                    return None;
                }
                Some(p.file_stem()?.to_str()?.to_string())
            })
            .collect()
    }

    fn kill(&self, handle: &str) -> Result<(), String> {
        if let Ok(mut stream) = self.connect(handle) {
            let _ = write_frame(&mut stream, T_KILL, &[]);
        }
        if let Some(p) = port_path(handle) {
            let _ = std::fs::remove_file(p);
        }
        Ok(())
    }

    fn subscribe_foreground(&self, handle: &str) -> Option<Box<dyn ForegroundSub>> {
        // A second connection dedicated to foreground events, mirroring the
        // Unix backend: announce with T_SUBSCRIBE_FG so the daemon serves
        // updates on it instead of treating it as a data client.
        let mut stream = self.connect(handle).ok()?;
        write_frame(&mut stream, T_SUBSCRIBE_FG, &[]).ok()?;
        Some(Box::new(TcpForegroundSub { stream }))
    }
}

/// Streams `T_FG_REP` frames from the daemon into the neutral `ForegroundInfo`.
struct TcpForegroundSub {
    stream: TcpStream,
}

impl ForegroundSub for TcpForegroundSub {
    fn next(&mut self) -> Option<ForegroundInfo> {
        loop {
            let (tag, payload) = read_frame(&mut self.stream).ok()?;
            if tag != T_FG_REP {
                continue;
            }
            let text = String::from_utf8_lossy(&payload);
            let mut parts = text.split('\t');
            let pgid: i32 = parts.next()?.parse().ok()?;
            let at_prompt = parts.next()? == "1";
            let leader = parts.next().unwrap_or("").to_string();
            return Some(ForegroundInfo {
                pgid,
                at_prompt,
                leader,
                // Windows has no cheap per-process cwd; the seam allows "".
                cwd: String::new(),
            });
        }
    }
}

// ── TCP adapters ──────────────────────────────────────────────────────────────

struct TcpReader {
    stream: TcpStream,
    buf: Vec<u8>,
    pos: usize,
}

impl TcpReader {
    fn new(stream: TcpStream) -> Self {
        TcpReader { stream, buf: Vec::new(), pos: 0 }
    }
}

impl Read for TcpReader {
    fn read(&mut self, out: &mut [u8]) -> io::Result<usize> {
        loop {
            if self.pos < self.buf.len() {
                let n = std::cmp::min(out.len(), self.buf.len() - self.pos);
                out[..n].copy_from_slice(&self.buf[self.pos..self.pos + n]);
                self.pos += n;
                return Ok(n);
            }
            match read_frame(&mut self.stream) {
                Ok((T_DATA, payload)) => {
                    if payload.is_empty() {
                        continue;
                    }
                    self.buf = payload;
                    self.pos = 0;
                }
                Ok(_) => continue,
                Err(e) if e.kind() == io::ErrorKind::UnexpectedEof => return Ok(0),
                Err(e) if e.kind() == io::ErrorKind::ConnectionReset => return Ok(0),
                Err(e) if e.kind() == io::ErrorKind::ConnectionAborted => return Ok(0),
                Err(e) => return Err(e),
            }
        }
    }
}

struct TcpWriter(TcpStream);

impl Write for TcpWriter {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        match write_frame(&mut self.0, T_DATA, buf) {
            Ok(()) => Ok(buf.len()),
            Err(e) => {
                // Partial frame under write_timeout → desync if we keep writing.
                let _ = self.0.shutdown(Shutdown::Both);
                Err(e)
            }
        }
    }
    fn flush(&mut self) -> io::Result<()> {
        self.0.flush()
    }
}

struct TcpMaster(TcpStream);

impl SessionMaster for TcpMaster {
    fn resize(&self, size: PtySize) -> Result<(), String> {
        let mut s = &self.0;
        let mut p = Vec::with_capacity(4);
        p.extend_from_slice(&size.cols.to_be_bytes());
        p.extend_from_slice(&size.rows.to_be_bytes());
        match write_frame(&mut s, T_RESIZE, &p) {
            Ok(()) => Ok(()),
            Err(e) => {
                let _ = self.0.shutdown(Shutdown::Both);
                Err(e.to_string())
            }
        }
    }
}

struct TcpChild(TcpStream);

impl SessionChild for TcpChild {
    fn kill(&mut self) -> Result<(), String> {
        self.0.shutdown(Shutdown::Both).map_err(|e| e.to_string())
    }
}
