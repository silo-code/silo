pub mod app_paths;
pub mod system;
pub mod finder_drop;
pub mod network;
pub mod webview;
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
// Self-owned PTY session host backend (RFC 0010). Unix-only.
#[cfg(unix)]
pub mod session_host;
// ConPTY daemon backend. Windows-only.
#[cfg(windows)]
pub mod session_windows;
pub mod session_registry;
pub mod terminal;
pub mod terminal_buffer;
pub mod terminal_io;
pub mod window_chrome;
