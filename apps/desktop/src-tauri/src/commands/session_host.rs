// The self-owned PTY-host backend (RFC 0010): one daemon per session, owning
// the real PTY master and serving a per-session Unix socket. This is the client
// side — it implements the `SessionBackend` seam by spawning/connecting to the
// daemon (from the `pty_host` crate) and adapting the socket into the neutral
// `Connection` (byte streams + resize/kill handles). Nothing above the seam
// changes; it has no external dependency and (later, Phase 3) unlocks
// foreground-process awareness.
//
// Daemon packaging is **self-fork**: the app re-execs its own binary with a
// hidden `--session-host` flag (handled in `main.rs`) to become the daemon —
// single artifact, no version skew, no sidecar to resolve.

use portable_pty::PtySize;
use std::io::{self, Read, Write};
use std::net::Shutdown;
use std::os::unix::net::UnixStream;
use std::time::{Duration, Instant};

use super::session_backend::{
    log_event, Connection, ForegroundInfo, ForegroundSub, SessionBackend, SessionChild,
    SessionMaster,
};
use pty_host::proto::{
    parse_hello, read_frame, resize_payload, write_frame, PROTO_VERSION, T_DATA, T_FG_REP, T_HELLO,
    T_KILL, T_RESIZE, T_SUBSCRIBE_FG,
};
use pty_host::{discovery, foreground, paths};

const NAME_PREFIX: &str = "silo";
const CONNECT_TIMEOUT: Duration = Duration::from_millis(3000);
// The daemon's own kill sequence (SIGTERM, sleep 150ms, SIGKILL — see
// pty-host's `kill_group`) plus buffer for the OS to actually reap it and the
// master reader thread to remove the socket file.
const KILL_TIMEOUT: Duration = Duration::from_millis(1000);
// Sentinel the frontend normalizes to a 404 ("session no longer exists" +
// Recreate), via tauri-terminal-client.ts. An incompatible leftover daemon is,
// from this build's view, unreachable — i.e. effectively gone.
const SESSION_GONE: &str = "SESSION_GONE";

pub struct SessionHostBackend;

impl SessionHostBackend {
    /// Re-exec this binary as a detached session daemon for `handle`. Any
    /// `command` is passed after a `--` separator for the daemon to run.
    fn spawn_daemon(
        &self,
        handle: &str,
        cwd: &str,
        size: PtySize,
        command: Option<&[String]>,
    ) -> Result<(), String> {
        let exe = std::env::current_exe().map_err(|e| format!("current_exe: {e}"))?;
        let mut cmd = std::process::Command::new(exe);
        cmd.arg("--session-host")
            .arg(handle)
            .arg(cwd)
            .arg(size.cols.to_string())
            .arg(size.rows.to_string());
        if let Some(argv) = command {
            if !argv.is_empty() {
                cmd.arg("--");
                cmd.args(argv);
            }
        }
        cmd.spawn().map_err(|e| format!("spawn daemon: {e}"))?;
        Ok(())
    }

    /// Connect to a session socket, retrying briefly (the daemon may still be
    /// binding right after a spawn).
    fn connect(&self, handle: &str) -> Result<UnixStream, String> {
        let path = paths::sock_path(handle);
        let deadline = Instant::now() + CONNECT_TIMEOUT;
        let mut stream = loop {
            match UnixStream::connect(&path) {
                Ok(s) => break s,
                Err(_) if Instant::now() < deadline => {
                    std::thread::sleep(Duration::from_millis(20));
                }
                Err(e) => return Err(format!("connect {handle}: {e}")),
            }
        };
        // Handshake: the daemon's first frame must be a compatible HELLO. An
        // incompatible leftover daemon can't be adopted, so we surface it as
        // SESSION_GONE (clean "recreate" UX) and log the reason rather than dump
        // a raw error. We deliberately do NOT kill it here — its shell may hold
        // real work; the user (or a manual reap) decides.
        match read_frame(&mut stream) {
            Ok((T_HELLO, p)) if parse_hello(&p) == Some(PROTO_VERSION) => Ok(stream),
            Ok((T_HELLO, p)) => {
                log_event(
                    "host_incompatible",
                    &format!(
                        "handle={handle} daemon_proto={:?} app_proto={PROTO_VERSION}",
                        parse_hello(&p)
                    ),
                );
                Err(SESSION_GONE.into())
            }
            Ok((tag, _)) => {
                log_event(
                    "host_incompatible",
                    &format!("handle={handle} unexpected_handshake_tag={tag}"),
                );
                Err(SESSION_GONE.into())
            }
            Err(e) => {
                log_event(
                    "host_incompatible",
                    &format!("handle={handle} handshake_read_failed={e}"),
                );
                Err(SESSION_GONE.into())
            }
        }
    }

    /// Wrap a connected socket into the neutral `Connection` seam.
    fn connection_from(&self, stream: UnixStream) -> Result<Connection, String> {
        let reader = stream.try_clone().map_err(|e| e.to_string())?;
        let writer = stream.try_clone().map_err(|e| e.to_string())?;
        let master = stream.try_clone().map_err(|e| e.to_string())?;
        Ok(Connection {
            reader: Box::new(SocketReader::new(reader)),
            writer: Box::new(SocketWriter(writer)),
            master: Box::new(SocketMaster(master)),
            child: Box::new(SocketChild(stream)),
        })
    }
}

impl SessionBackend for SessionHostBackend {
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
    ) -> Result<Connection, String> {
        self.spawn_daemon(handle, cwd, size, command.as_deref())?;
        let stream = self.connect(handle)?;
        log_event("host_create", &format!("handle={handle} cwd={cwd}"));
        self.connection_from(stream)
    }

    fn attach(&self, handle: &str, size: PtySize) -> Result<Connection, String> {
        let stream = self.connect(handle)?;
        // Match the daemon's PTY to the attaching client's size.
        {
            let mut s = &stream;
            let _ = write_frame(&mut s, T_RESIZE, &resize_payload(size.cols, size.rows));
        }
        log_event("host_attach", &format!("handle={handle}"));
        self.connection_from(stream)
    }

    fn exists(&self, handle: &str) -> bool {
        discovery::is_live(&paths::sock_path(handle))
    }

    fn list(&self) -> Vec<String> {
        // Reconciliation pass: reap sockets left by crashed daemons, then report
        // the live ones.
        discovery::reap_stale();
        discovery::list_sessions()
    }

    fn kill(&self, handle: &str) -> Result<(), String> {
        // Best-effort: if we can connect, ask the daemon to terminate; a failed
        // connect means it's already gone, which is success for our purposes.
        match UnixStream::connect(paths::sock_path(handle)) {
            Ok(mut s) => {
                let _ = write_frame(&mut s, T_KILL, &[]);
            }
            Err(_) => return Ok(()),
        }

        // Block until the socket actually stops accepting connections, so a
        // caller that awaits kill() can trust the session is truly gone. Without
        // this, a liveness probe or reattach racing right after kill() returns
        // could reconnect to the still-dying daemon and resurrect the session in
        // `terminal_attach` before the daemon's SIGTERM/sleep(150ms)/SIGKILL
        // sequence finishes tearing it down. Best-effort: if it doesn't converge
        // within the timeout, return anyway rather than hang a delete/close.
        let sock = paths::sock_path(handle);
        let deadline = Instant::now() + KILL_TIMEOUT;
        while Instant::now() < deadline {
            if !discovery::is_live(&sock) {
                break;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        Ok(())
    }

    fn subscribe_foreground(&self, handle: &str) -> Option<Box<dyn ForegroundSub>> {
        // A second connection dedicated to foreground events: send T_SUBSCRIBE_FG
        // so the daemon stops sending us data and starts pushing T_FG_REP.
        let mut stream = self.connect(handle).ok()?;
        write_frame(&mut stream, T_SUBSCRIBE_FG, &[]).ok()?;
        Some(Box::new(SocketForegroundSub { stream }))
    }
}

/// Reads `T_FG_REP` pushes off a foreground-subscription connection.
struct SocketForegroundSub {
    stream: UnixStream,
}

impl ForegroundSub for SocketForegroundSub {
    fn next(&mut self) -> Option<ForegroundInfo> {
        loop {
            match read_frame(&mut self.stream) {
                Ok((T_FG_REP, p)) => {
                    if let Some(fg) = foreground::decode(&p) {
                        return Some(ForegroundInfo {
                            pgid: fg.pgid,
                            at_prompt: fg.at_prompt,
                            leader: fg.leader,
                            cwd: fg.cwd,
                        });
                    }
                    // malformed — keep waiting rather than ending the stream
                }
                Ok(_) => {}            // ignore the HELLO / any stray ring data
                Err(_) => return None, // connection closed → session gone
            }
        }
    }
}

// --- socket <-> seam adapters ---

/// Deframes the daemon's `T_DATA` frames into a raw byte stream for the reader
/// loop. Control replies on the data connection (if any) are ignored.
struct SocketReader {
    stream: UnixStream,
    buf: Vec<u8>,
    pos: usize,
}

impl SocketReader {
    fn new(stream: UnixStream) -> Self {
        SocketReader {
            stream,
            buf: Vec::new(),
            pos: 0,
        }
    }
}

impl Read for SocketReader {
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
                Ok(_) => continue, // ignore non-data control frames here
                // Socket closed / daemon gone → EOF, so the reader loop ends and
                // the frontend sees the session close.
                Err(e) if e.kind() == io::ErrorKind::UnexpectedEof => return Ok(0),
                Err(e) => return Err(e),
            }
        }
    }
}

/// Frames writes to the session as `T_DATA`.
struct SocketWriter(UnixStream);

impl Write for SocketWriter {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        write_frame(&mut self.0, T_DATA, buf)?;
        Ok(buf.len())
    }
    fn flush(&mut self) -> io::Result<()> {
        self.0.flush()
    }
}

/// Resize handle: sends a `T_RESIZE` control frame to the daemon.
struct SocketMaster(UnixStream);

impl SessionMaster for SocketMaster {
    fn resize(&self, size: PtySize) -> Result<(), String> {
        let mut s = &self.0;
        write_frame(&mut s, T_RESIZE, &resize_payload(size.cols, size.rows))
            .map_err(|e| e.to_string())
    }
}

/// Detach handle: closing this app instance's attachment shuts down the socket;
/// the persistent session lives on (force-terminate is `SessionBackend::kill`).
struct SocketChild(UnixStream);

impl SessionChild for SocketChild {
    fn kill(&mut self) -> Result<(), String> {
        self.0.shutdown(Shutdown::Both).map_err(|e| e.to_string())
    }
}
