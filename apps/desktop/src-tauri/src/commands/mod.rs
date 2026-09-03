pub mod app_paths;
pub mod system;
pub mod finder_drop;
pub mod network;
pub mod webview;
#[cfg(feature = "automation")]
pub mod automation;
pub mod cli;
// The Control API (RFC 0034): a request/response channel into a running
// instance. Unlike `automation` above, compiled into every build — the
// filesystem, not a Cargo feature, is what gates it.
pub mod control;
// Build identity (bundle identifier) and the per-user roots derived from it.
pub mod identity;
pub mod install;
pub mod devtools;
pub mod fs;
pub mod process;
pub mod search;
pub mod watch;
// Foreground-process resolution for Windows (no ConPTY equivalent of
// tcgetpgrp — the leader is inferred by walking the process tree).
pub mod process_tree;
pub mod session_backend;
// Terminal identity carrier for the session environment (RFC 0028).
pub mod session_env;
// Self-owned PTY session host backend (RFC 0010). Unix-only.
#[cfg(unix)]
pub mod session_host;
// Membership-based orphan reaping for PTY session daemons. Unix-only.
#[cfg(unix)]
pub mod session_maintenance;
// ConPTY daemon backend. Windows-only.
#[cfg(windows)]
pub mod session_windows;
pub mod session_registry;
pub mod terminal;
pub mod terminal_buffer;
pub mod terminal_io;
pub mod window_chrome;
