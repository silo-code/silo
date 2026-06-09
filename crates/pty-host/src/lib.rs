//! Self-owned PTY session host (Silo RFC 0010).
//!
//! A session is a detached daemon (double-fork + `setsid`) that `forkpty`s the
//! shell, **holds the real PTY master**, and serves a per-session Unix socket.
//! Clients (the Silo `SessionHostBackend`, or the test `pty-host` bin) relay
//! bytes over the socket and issue control requests (resize / kill / foreground)
//! as framed messages.
//!
//! Lifted from the validated `pty-host-spike` proof. The crate is Tauri-free so
//! it builds and tests standalone; the Silo app links it and self-forks into
//! [`run_session_host`] to become a daemon.

pub mod client;
pub mod daemon;
pub mod discovery;
pub mod foreground;
pub mod paths;
pub mod proto;
pub mod pty;

/// Daemonize and serve a session host for `name`, running `cmd` in `cwd` at the
/// given size. Forks the long-lived daemon (reparented to init) and returns in
/// the spawning process — which should then exit. The Silo app calls this when
/// re-exec'd with its hidden `--session-host` flag.
pub use daemon::spawn_detached as run_session_host;
