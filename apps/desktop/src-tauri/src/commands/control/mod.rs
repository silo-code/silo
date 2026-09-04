//! The **Control API** (RFC 0034) — a request/response channel into a running
//! Silo instance, so a `silo` command can answer its caller with stdout, a real
//! exit code, and a stable `--json` envelope.
//!
//! This is ADR 0047's **Control** execution mode. The baseline it replaces is
//! Forward: argv goes in via `tauri-plugin-single-instance`, `exit 0` comes out,
//! and the result lands in the webview's Output panel — which cannot tell an
//! agent whether anything worked, cannot return the id of a thing just created,
//! and cannot fail a script.
//!
//! ## The shape of it
//!
//! ```text
//! silo (short-lived process)                    Silo.app (running instance)
//! ──────────────────────────                    ─────────────────────────────
//! main.rs                                       control/
//!   local_flag_response  ──► --help/--version      listener.rs   accept loop
//!   control::client      ──► Control mode          registry.rs   op allowlist
//!         │                                        paths.rs      socket location
//!         ├─► disk_read.rs   (ws list base)        envelope.rs   shared shapes
//!         ▼                                        status.rs     host-answered
//!   control/client.rs                                     │
//!         │  connect + 1 req/1 resp                       │ control://request
//!         └──────────── socket / named pipe ──────────────┤
//!                                                         │ control://reply
//!                                                  apps/desktop/src/control/
//! ```
//!
//! ## The client and the instance are the same executable
//!
//! Both `silo` shims — `~/.local/bin/silo` from `cli_install_shim` and the
//! managed one from `ensure_managed_shim` — `exec` the app binary, and the
//! managed shim is rewritten on every launch. So in normal use the process
//! sending a request and the process answering it are the same build, and
//! version skew is not a case the wire format has to negotiate. Two consequences
//! the design leans on: the client can synthesize a complete envelope from its
//! own build's version and identity, and the envelope's version field exists for
//! third-party `--json` consumers rather than for handshaking.
//!
//! ## Security
//!
//! A channel that can open workspaces and launch agent profiles is, by
//! construction, arbitrary command execution as the user — an agent profile is a
//! shell command line. What keeps that acceptable is that it is not reachable by
//! anything the user did not run: a `0600` socket inside a `0700` directory in
//! the per-user runtime tier. No port, no network surface, no DNS-rebinding
//! target. The op set is an allowlist rather than "whatever the host can do", so
//! growing the host's capabilities never silently grows the channel's. And
//! **extensions never reach it** — they have `ctx`.
//!
//! The residual risk is stated plainly: any local process running as the user
//! can drive the editor through this socket. That is the same authority the
//! process already has to run those commands itself, which is why the OS-gated
//! transport is the whole of the defense and a capability token would add
//! nothing.

pub mod client;
pub mod disk_read;
pub mod envelope;
/// The running app's dispatcher — the Tauri half, split from the transport so
/// the socket's real behavior can be tested without an `AppHandle`.
pub mod host;
pub mod listener;
pub mod paths;
pub mod registry;
pub mod status;
