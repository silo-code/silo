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
use std::collections::HashMap;
use std::io::{self, Write};
use std::net::Shutdown;
use std::os::unix::net::UnixStream;
use std::time::{Duration, Instant};

use super::session_backend::{
    log_event, Connection, ForegroundInfo, ForegroundSub, SessionBackend, SessionChild,
    SessionChunk, SessionMaster, SessionReader,
};
use super::session_env::{encode_session_env, SESSION_ENV_CARRIER};
use pty_host::proto::{
    parse_hello, proto_compatible, proto_tags_replay, read_frame, resize_payload, write_frame,
    PROTO_VERSION, T_DATA, T_FG_REP, T_HELLO, T_KILL, T_REPLAY_BEGIN, T_REPLAY_END, T_RESIZE,
    T_SUBSCRIBE_FG,
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

// Well above realistic legitimate usage (a handful to a couple dozen tabs
// across workspaces), well below the 84-113 the leaked-daemon investigation
// found. A backstop signal, not a real limit — see `should_warn_concurrency_cap`.
const CONCURRENCY_WARN_THRESHOLD: usize = 40;

/// Should a concurrency-cap warning fire for a spawn, given the count of live
/// sessions *before* this one is added? Warn-only: a runaway caller (e.g. a
/// leaky test harness) surfaces immediately in the log instead of silently
/// piling up for days, but legitimate heavy usage is never blocked.
fn should_warn_concurrency_cap(live_count: usize, threshold: usize) -> bool {
    live_count >= threshold
}

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
        env: Option<HashMap<String, String>>,
    ) -> Result<(), String> {
        // Count socket files only — do not `list_sessions()`/`is_live` probe
        // every existing host on spawn (connect-and-drop was falsely exiting
        // prior terminals' UI attaches under MAX_DATA_CLIENTS=1).
        let live = discovery::sock_file_count();
        if should_warn_concurrency_cap(live, CONCURRENCY_WARN_THRESHOLD) {
            log_event(
                "host_cap_warning",
                &format!("live={live} threshold={CONCURRENCY_WARN_THRESHOLD} spawning_handle={handle}"),
            );
        }

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
        // The session's environment travels as one JSON carrier variable, which
        // the daemon parses and *removes from its own environment* before
        // forking the shell (see `main.rs`). Two things this buys over letting
        // the values inherit directly: they never appear in `ps` output the way
        // argv would, and the daemon process itself never carries per-session
        // identity that a process-tree walk could misread one level too high.
        if let Some(map) = env.filter(|m| !m.is_empty()) {
            cmd.env(SESSION_ENV_CARRIER, encode_session_env(&map));
        }
        cmd.spawn().map_err(|e| format!("spawn daemon: {e}"))?;
        Ok(())
    }

    /// Connect to a session socket, retrying briefly (the daemon may still be
    /// binding right after a spawn). Returns the stream and the protocol
    /// version the daemon announced — a daemon left over from a previous
    /// release keeps speaking the version it started with for the life of its
    /// sessions, and how it frames replay depends on that (RFC 0036).
    fn connect(&self, handle: &str) -> Result<(UnixStream, u32), String> {
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
        //
        // "Compatible" spans a range, not a single number: a daemon forked by
        // the previous release outlives the upgrade, and refusing it would kill
        // every running terminal on any update that touches the protocol. See
        // `MIN_COMPATIBLE_PROTO`.
        match read_frame(&mut stream) {
            Ok((T_HELLO, p)) => match parse_hello(&p) {
                Some(v) if proto_compatible(v) => Ok((stream, v)),
                other => {
                    log_event(
                        "host_incompatible",
                        &format!("handle={handle} daemon_proto={other:?} app_proto={PROTO_VERSION}"),
                    );
                    Err(SESSION_GONE.into())
                }
            },
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
    fn connection_from(&self, stream: UnixStream, proto: u32) -> Result<Connection, String> {
        let reader = stream.try_clone().map_err(|e| e.to_string())?;
        let writer = stream.try_clone().map_err(|e| e.to_string())?;
        let master = stream.try_clone().map_err(|e| e.to_string())?;
        // RFC 0026: bound socket writes so a stalled session host becomes an
        // error on the writer thread instead of an unbounded sleep.
        writer
            .set_write_timeout(Some(Duration::from_secs(1)))
            .map_err(|e| e.to_string())?;
        Ok(Connection {
            reader: Box::new(SocketReader::new(reader, proto)),
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
        env: Option<HashMap<String, String>>,
    ) -> Result<Connection, String> {
        self.spawn_daemon(handle, cwd, size, command.as_deref(), env)?;
        let (stream, proto) = self.connect(handle)?;
        log_event("host_create", &format!("handle={handle} cwd={cwd} proto={proto}"));
        self.connection_from(stream, proto)
    }

    fn attach(&self, handle: &str, size: PtySize) -> Result<Connection, String> {
        let (stream, proto) = self.connect(handle)?;
        // Match the daemon's PTY to the attaching client's size.
        {
            let mut s = &stream;
            let _ = write_frame(&mut s, T_RESIZE, &resize_payload(size.cols, size.rows));
        }
        // `proto` is worth logging on its own line of the durable trail: a
        // reattach to a pre-upgrade daemon behaves differently (untagged
        // replay), and after a weird restart that is otherwise invisible.
        log_event("host_attach", &format!("handle={handle} proto={proto}"));
        self.connection_from(stream, proto)
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
        let (mut stream, _proto) = self.connect(handle).ok()?;
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

/// Deframes the daemon's `T_DATA` frames into a chunk stream for the reader
/// loop, classifying each chunk as ring replay or live output from the
/// `T_REPLAY_BEGIN` / `T_REPLAY_END` brackets (RFC 0036). Control replies on
/// the data connection (if any) are ignored.
struct SocketReader {
    stream: UnixStream,
    buf: Vec<u8>,
    pos: usize,
    /// Whether the peer brackets its replay at all. False against a daemon from
    /// a previous release, whose frames are all reported as live — which is
    /// exactly how this behaved before the brackets existed.
    tags_replay: bool,
    /// Bracket state: whether the frame currently buffered (and the frames that
    /// follow, until `T_REPLAY_END`) are history.
    replaying: bool,
    /// Classification of the payload in `buf`, latched when the frame was read
    /// so a payload drained over several `read_chunk` calls keeps one answer.
    buf_replay: bool,
}

impl SocketReader {
    fn new(stream: UnixStream, proto: u32) -> Self {
        SocketReader {
            stream,
            buf: Vec::new(),
            pos: 0,
            tags_replay: proto_tags_replay(proto),
            replaying: false,
            buf_replay: false,
        }
    }
}

impl SessionReader for SocketReader {
    fn read_chunk(&mut self, out: &mut [u8]) -> io::Result<SessionChunk> {
        loop {
            if self.pos < self.buf.len() {
                let n = std::cmp::min(out.len(), self.buf.len() - self.pos);
                out[..n].copy_from_slice(&self.buf[self.pos..self.pos + n]);
                self.pos += n;
                return Ok(SessionChunk {
                    len: n,
                    replay: self.buf_replay,
                });
            }
            match read_frame(&mut self.stream) {
                Ok((T_DATA, payload)) => {
                    if payload.is_empty() {
                        continue;
                    }
                    self.buf_replay = self.tags_replay && self.replaying;
                    self.buf = payload;
                    self.pos = 0;
                }
                Ok((T_REPLAY_BEGIN, _)) => self.replaying = true,
                Ok((T_REPLAY_END, _)) => self.replaying = false,
                Ok(_) => continue, // ignore non-data control frames here
                // Socket closed / daemon gone → EOF, so the reader loop ends and
                // the frontend sees the session close.
                Err(e) if e.kind() == io::ErrorKind::UnexpectedEof => {
                    return Ok(SessionChunk {
                        len: 0,
                        replay: false,
                    })
                }
                Err(e) => return Err(e),
            }
        }
    }
}

/// Frames writes to the session as `T_DATA`.
struct SocketWriter(UnixStream);

impl Write for SocketWriter {
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

/// Resize handle: sends a `T_RESIZE` control frame to the daemon.
struct SocketMaster(UnixStream);

impl SessionMaster for SocketMaster {
    fn resize(&self, size: PtySize) -> Result<(), String> {
        let mut s = &self.0;
        match write_frame(&mut s, T_RESIZE, &resize_payload(size.cols, size.rows)) {
            Ok(()) => Ok(()),
            Err(e) => {
                let _ = self.0.shutdown(Shutdown::Both);
                Err(e.to_string())
            }
        }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn warns_at_and_above_threshold_not_below() {
        assert!(!should_warn_concurrency_cap(39, 40));
        assert!(should_warn_concurrency_cap(40, 40));
        assert!(should_warn_concurrency_cap(50, 40));
    }

    /// Drive a `SocketReader` over a socketpair: write `frames` from the
    /// "daemon" end, then drain the reader and report each chunk as
    /// (bytes, replay).
    fn drain(proto: u32, frames: &[(u8, &[u8])], buf_size: usize) -> Vec<(Vec<u8>, bool)> {
        let (daemon, app) = UnixStream::pair().expect("socketpair");
        {
            let mut w = &daemon;
            for (tag, payload) in frames {
                write_frame(&mut w, *tag, payload).expect("write frame");
            }
        }
        // Closing the daemon end turns the end of the frames into EOF, so the
        // drain loop terminates instead of blocking.
        drop(daemon);

        let mut reader = SocketReader::new(app, proto);
        let mut buf = vec![0u8; buf_size];
        let mut out = Vec::new();
        loop {
            let chunk = reader.read_chunk(&mut buf).expect("read_chunk");
            if chunk.len == 0 {
                return out;
            }
            out.push((buf[..chunk.len].to_vec(), chunk.replay));
        }
    }

    #[test]
    fn brackets_classify_the_frames_inside_them() {
        let chunks = drain(
            2,
            &[
                (T_REPLAY_BEGIN, &[]),
                (T_DATA, b"old-1"),
                (T_DATA, b"old-2"),
                (T_REPLAY_END, &[]),
                (T_DATA, b"live"),
            ],
            64,
        );
        assert_eq!(
            chunks,
            vec![
                (b"old-1".to_vec(), true),
                (b"old-2".to_vec(), true),
                (b"live".to_vec(), false),
            ]
        );
    }

    #[test]
    fn live_output_interleaved_with_replay_stays_live() {
        // What the daemon writes when PTY output lands between two replay
        // chunks: it closes the bracket, writes the live frame, and reopens.
        let chunks = drain(
            2,
            &[
                (T_REPLAY_BEGIN, &[]),
                (T_DATA, b"old-1"),
                (T_REPLAY_END, &[]),
                (T_DATA, b"live"),
                (T_REPLAY_BEGIN, &[]),
                (T_DATA, b"old-2"),
                (T_REPLAY_END, &[]),
            ],
            64,
        );
        assert_eq!(
            chunks,
            vec![
                (b"old-1".to_vec(), true),
                (b"live".to_vec(), false),
                (b"old-2".to_vec(), true),
            ]
        );
    }

    #[test]
    fn an_untagged_peer_reports_everything_as_live() {
        // A daemon from a previous release never sends brackets. Even if a
        // stray bracket tag did arrive, protocol 1 means "don't trust it" —
        // the pre-RFC-0036 behavior is that every byte is live.
        let chunks = drain(
            1,
            &[
                (T_REPLAY_BEGIN, &[]),
                (T_DATA, b"old"),
                (T_REPLAY_END, &[]),
                (T_DATA, b"live"),
            ],
            64,
        );
        assert_eq!(
            chunks,
            vec![(b"old".to_vec(), false), (b"live".to_vec(), false)]
        );
    }

    #[test]
    fn a_payload_split_across_reads_keeps_one_classification() {
        // A 5-byte replayed payload drained through a 2-byte buffer must not
        // have its tail reclassified as live.
        let chunks = drain(
            2,
            &[
                (T_REPLAY_BEGIN, &[]),
                (T_DATA, b"12345"),
                (T_REPLAY_END, &[]),
                (T_DATA, b"ab"),
            ],
            2,
        );
        assert_eq!(
            chunks,
            vec![
                (b"12".to_vec(), true),
                (b"34".to_vec(), true),
                (b"5".to_vec(), true),
                (b"ab".to_vec(), false),
            ]
        );
    }

    #[test]
    fn empty_data_frames_are_skipped_not_reported_as_eof() {
        let chunks = drain(2, &[(T_DATA, &[]), (T_DATA, b"x")], 64);
        assert_eq!(chunks, vec![(b"x".to_vec(), false)]);
    }
}
