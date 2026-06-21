pub mod app_paths;
pub mod network;
#[cfg(feature = "automation")]
pub mod automation;
pub mod cli;
pub mod install;
pub mod devtools;
pub mod fs;
pub mod process;
pub mod search;
pub mod watch;
pub mod session_backend;
// Self-owned PTY session host backend (RFC 0010). Unix-only; opt-in at runtime
// via SILO_SESSION_BACKEND=pty-host until it's dogfooded into the default.
#[cfg(unix)]
pub mod session_host;
pub mod session_registry;
pub mod terminal;
pub mod terminal_buffer;
pub mod terminal_io;
