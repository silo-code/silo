//! The Control API's **transport** (RFC 0034 R2, R8) — bind, accept, frame.
//!
//! A blocking local-socket listener on a dedicated thread, compiled into
//! **every** build and gated by the filesystem rather than by a Cargo feature —
//! which is the whole difference between this and the dev-only automation RPC it
//! borrows its round-trip pattern from (ADR 0012).
//!
//! This module knows nothing about Tauri, ops, or the webview. It owns the
//! socket and the wire, and hands each parsed request to a [`Dispatcher`]. The
//! running app's dispatcher lives in `host.rs`; the tests here use a trivial one,
//! which is what lets the socket's real behavior — stale takeover, live refusal,
//! re-bind, the size cap, concurrent clients — be tested against a real socket
//! rather than reasoned about.
//!
//! Three behaviors worth naming:
//!
//! - **Bind at startup, not on webview-ready.** Socket presence therefore means
//!   "the process is alive", which is the predicate `status` needs to be able to
//!   report a wedged webview at all. Readiness is a *field in the status answer*,
//!   never the existence of the socket.
//! - **Stale-socket takeover.** A path that already exists is connect-probed: a
//!   successful connect means a live instance owns it (refuse, leave it alone,
//!   log), a refused connect means a crashed predecessor (unlink, bind).
//! - **Re-bind after a reap.** ADR 0022 documents `$TMPDIR` reaping as a loss
//!   case for tier-3 sockets. The accept loop re-checks that its path still
//!   exists, so a reaped socket costs one request rather than this instance's
//!   reachability for the rest of its life.
//!
//! Per connection: one newline-terminated request with a size cap and a read
//! deadline, one newline-terminated response, close. No keep-alive and no
//! pipelining — one request per connection keeps correlation trivial on the wire
//! and connection lifetime bounded.

use std::io::{BufRead, BufReader, Read, Write};
use std::time::Duration;

use interprocess::local_socket::traits::{Listener as _, Stream as _};
use interprocess::local_socket::{Listener, ListenerNonblockingMode, ListenerOptions, Stream};

use super::envelope::{Envelope, ErrorCode, Request};
use super::paths;
use super::registry::{self, Tier};

/// How long a connected client has to deliver its request line. A client that
/// connects and says nothing must not hold a worker thread indefinitely.
///
/// At least as long as the dispatcher's own deadline (5s in `host.rs`), so a
/// `timeout` normally reaches the client as a real envelope rather than as its
/// own guess.
const READ_TIMEOUT: Duration = Duration::from_secs(5);

/// Maximum request size. Generous for an op's arguments (an `agent.run` prompt
/// is the largest realistic payload) and small enough that a hostile or broken
/// client cannot make the listener allocate without bound.
const MAX_REQUEST_BYTES: u64 = 64 * 1024;

/// How much of an over-cap request is drained before answering it. See
/// [`drain`]: enough that a sender of a merely-too-big request finishes writing
/// and reads the refusal, not enough to be a way to hold the connection.
const MAX_DRAIN_BYTES: u64 = 4 * MAX_REQUEST_BYTES;

/// How long the accept loop parks between polls, and how many polls between
/// re-checks that the socket path still exists. Accept is polled rather than
/// blocked on so the reap check has somewhere to run; 50ms is imperceptible on a
/// connect and costs one `stat` a second.
const ACCEPT_POLL: Duration = Duration::from_millis(50);
const PATH_CHECK_EVERY: u32 = 20;

/// Answers requests and records what happened.
///
/// The seam between the socket and everything above it. Implemented by the app
/// (round-tripping to the webview) and by the tests (answering inline).
pub trait Dispatcher: Send + Sync + 'static {
    /// Answer one allowlisted request. Called only for ops that
    /// [`registry::lookup`] accepted — an unknown op is `denied` before it gets
    /// here, so a dispatcher never has to defend against one.
    fn dispatch(&self, request: &Request) -> Envelope;

    /// Record a lifecycle or per-request event.
    fn log(&self, level: &str, message: &str);
}

/// What happened at bind time.
enum Bound {
    /// This process owns the socket. Carries the address it actually bound.
    Ours(Listener, Endpoint),
    /// A live instance already owns it — do not bind, do not unlink.
    AlreadyLive,
    /// Binding failed for a reason retrying will not fix.
    Failed(std::io::Error),
}

/// The address a listener bound, captured **once** at bind time.
///
/// Resolving the path again on every reap check would re-read the process
/// environment, so a listener could end up checking — or re-binding onto — an
/// address it never owned if `$XDG_RUNTIME_DIR` or `$TMPDIR` changed underneath
/// it. Holding the bound value makes the reap check ask about *this* socket.
#[derive(Clone)]
struct Endpoint {
    printable: String,
    #[cfg(unix)]
    path: std::path::PathBuf,
}

impl Endpoint {
    fn current() -> Self {
        Self {
            printable: paths::endpoint(),
            #[cfg(unix)]
            path: paths::socket_path(),
        }
    }

    /// Whether this socket has been removed underneath us (the `$TMPDIR` reap
    /// case). Always `false` on Windows: a named pipe has no filesystem entry to
    /// reap, and the listener holds it for the process's lifetime.
    fn reaped(&self) -> bool {
        #[cfg(unix)]
        {
            !self.path.exists()
        }
        #[cfg(windows)]
        {
            false
        }
    }
}

/// A running listener's stop switch.
///
/// The app never uses it — process exit is the app's shutdown — but a caller
/// that outlives its listener needs one, and the tests here do: a server thread
/// that kept serving after its test returned would still be polling when the
/// next test rebinds, which is a real (if test-only) way for two listeners to
/// fight over one address.
#[derive(Clone, Default)]
pub struct Stopper(std::sync::Arc<std::sync::atomic::AtomicBool>);

impl Stopper {
    /// Ask the accept loop to wind down at its next poll.
    pub fn stop(&self) {
        self.0.store(true, std::sync::atomic::Ordering::SeqCst);
    }

    fn stopped(&self) -> bool {
        self.0.load(std::sync::atomic::Ordering::SeqCst)
    }
}

/// Bind, serve, and re-bind if the socket path is taken out from under us.
///
/// Returns when the socket is unusable — another instance owns it, the bind
/// failed, or accept failed unrecoverably — or when `stopper` is tripped. Every
/// exit but a deliberate stop is logged first.
pub fn serve(dispatcher: impl Dispatcher + Clone, stopper: Stopper) {
    loop {
        let (listener, endpoint) = match bind() {
            Bound::Ours(l, e) => (l, e),
            Bound::AlreadyLive => {
                dispatcher.log(
                    "warn",
                    &format!(
                        "another Silo instance already owns {} — not listening",
                        paths::endpoint()
                    ),
                );
                return;
            }
            Bound::Failed(e) => {
                dispatcher.log(
                    "error",
                    &format!("failed to bind {}: {e}", paths::endpoint()),
                );
                return;
            }
        };
        dispatcher.log("info", &format!("listening on {}", endpoint.printable));

        // Returns `true` only when the path vanished under us; anything else is
        // fatal or deliberate and has already been handled.
        if !accept_loop(&dispatcher, &stopper, listener, &endpoint) {
            return;
        }
        dispatcher.log(
            "warn",
            &format!("{} disappeared — re-binding", endpoint.printable),
        );
    }
}

/// Take ownership of the socket path.
fn bind() -> Bound {
    #[cfg(unix)]
    if let Err(e) = paths::ensure_dir() {
        return Bound::Failed(e);
    }
    let endpoint = Endpoint::current();

    // Probe before binding: a path that exists is either a live instance's
    // (leave it strictly alone) or a crashed one's corpse (ours to remove).
    // `interprocess`'s own `try_overwrite` cannot make that distinction — it
    // would displace a running instance — so the probe is done here.
    #[cfg(unix)]
    if endpoint.path.exists() {
        if connect_probe() {
            return Bound::AlreadyLive;
        }
        if let Err(e) = std::fs::remove_file(&endpoint.path) {
            return Bound::Failed(e);
        }
    }
    #[cfg(windows)]
    if connect_probe() {
        return Bound::AlreadyLive;
    }

    let name = match paths::name() {
        Ok(n) => n,
        Err(e) => return Bound::Failed(e),
    };
    let listener = match ListenerOptions::new()
        .name(name)
        .nonblocking(ListenerNonblockingMode::Accept)
        .create_sync()
    {
        Ok(l) => l,
        Err(e) => return Bound::Failed(e),
    };

    // `0600` explicitly, right after bind. The crate's own `mode()` option is
    // not portable to every platform Silo ships (it reports `Unsupported` where
    // the pre-bind `fchmod` is unavailable), and the process umask is a default
    // rather than a guarantee. The window between bind and chmod is covered by
    // the `0700` parent directory: nothing else can traverse in to reach it.
    #[cfg(unix)]
    if let Err(e) = std::fs::set_permissions(&endpoint.path, unix_mode(0o600)) {
        return Bound::Failed(e);
    }

    Bound::Ours(listener, endpoint)
}

#[cfg(unix)]
fn unix_mode(mode: u32) -> std::fs::Permissions {
    use std::os::unix::fs::PermissionsExt;
    std::fs::Permissions::from_mode(mode)
}

/// Whether something is listening on our endpoint right now.
fn connect_probe() -> bool {
    match paths::name() {
        Ok(name) => Stream::connect(name).is_ok(),
        Err(_) => false,
    }
}

/// Accept until the socket path disappears (`true`, re-bind), the listener fails
/// unrecoverably (`false`), or the stopper is tripped (`false`).
fn accept_loop(
    dispatcher: &(impl Dispatcher + Clone),
    stopper: &Stopper,
    listener: Listener,
    endpoint: &Endpoint,
) -> bool {
    let mut ticks: u32 = 0;
    loop {
        match listener.accept() {
            Ok(stream) => {
                // One thread per connection: dispatch blocks waiting on the
                // webview, and that must not stall the accept loop or serialize
                // independent clients (R8).
                let dispatcher = dispatcher.clone();
                std::thread::spawn(move || handle_connection(&dispatcher, stream));
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                if stopper.stopped() {
                    return false;
                }
                std::thread::sleep(ACCEPT_POLL);
                ticks = ticks.wrapping_add(1);
                if ticks % PATH_CHECK_EVERY == 0 && endpoint.reaped() {
                    return true;
                }
            }
            Err(e) => {
                dispatcher.log("error", &format!("accept failed: {e}"));
                return false;
            }
        }
    }
}

/// Read one request, answer it, close.
fn handle_connection(dispatcher: &impl Dispatcher, stream: Stream) {
    // **Accepted streams must be put back into blocking mode explicitly.** On
    // macOS and the BSDs `accept()` inherits `O_NONBLOCK` from the listening
    // socket, which the accept loop sets — so without this a read returns
    // `WouldBlock` the moment the receive buffer empties, and every request
    // larger than one buffer fill (8 KiB) fails partway through. Linux does not
    // inherit the flag, which is exactly what makes this the kind of bug that
    // ships.
    let _ = stream.set_nonblocking(false);
    let _ = stream.set_recv_timeout(Some(READ_TIMEOUT));
    let _ = stream.set_send_timeout(Some(READ_TIMEOUT));

    // `take` caps the read, so an endless line is refused rather than buffered
    // without bound. One byte over the cap is read so "at the limit" and "over
    // it" stay distinguishable.
    let mut reader = BufReader::new(&stream).take(MAX_REQUEST_BYTES + 1);
    let mut line = String::new();

    let response = match reader.read_line(&mut line) {
        // Connected and said nothing. `bind`'s liveness probe is exactly this,
        // so it is normal traffic rather than an error — and there is nothing
        // to answer.
        Ok(0) => return,
        Ok(n) if n as u64 > MAX_REQUEST_BYTES => {
            // Read the rest of the oversized line before answering. Closing on
            // a client still mid-`write` breaks its pipe, so it would learn
            // "could not send" instead of *why* it was refused — and a refusal
            // an agent cannot read is barely better than a hang.
            drain(&mut reader);
            Envelope::err(
                ErrorCode::Internal,
                format!("request exceeds the {MAX_REQUEST_BYTES}-byte limit"),
            )
        }
        Ok(_) => dispatch_line(dispatcher, line.trim()),
        // A timed-out or broken read still gets an answer attempt: if the peer
        // is gone the write simply fails, and if it is still waiting it learns
        // what happened instead of seeing a bare closed connection.
        Err(e) => Envelope::err(ErrorCode::Internal, format!("could not read the request: {e}")),
    };

    // A client that hung up first makes this fail. Its pending entry, if any, is
    // already gone, so there is nothing to clean up and nothing to report (R8).
    let mut out = &stream;
    let _ = out.write_all(response.to_line().as_bytes());
    let _ = out.flush();
}

/// Discard the tail of an over-cap request so the sender's write completes and
/// it can read the refusal.
///
/// Stops at the request line's newline rather than at EOF: the sender is not
/// going to close — it is waiting to *read* the answer — so draining to EOF
/// would stall until the read deadline and turn a fast refusal into a five
/// second one. Bounded by [`MAX_DRAIN_BYTES`] on top of that, so draining is not
/// itself a way to hold a connection open.
fn drain(reader: &mut std::io::Take<impl BufRead>) {
    reader.set_limit(MAX_DRAIN_BYTES);
    let mut scratch = String::new();
    loop {
        scratch.clear();
        match reader.read_line(&mut scratch) {
            Ok(0) => return,
            Ok(_) if scratch.ends_with('\n') => return,
            Ok(_) => {}
            Err(_) => return,
        }
    }
}

/// Parse one request line, check it against the allowlist, dispatch.
fn dispatch_line(dispatcher: &impl Dispatcher, line: &str) -> Envelope {
    let request: Request = match serde_json::from_str(line) {
        Ok(r) => r,
        // Refused before dispatching anything: nothing is emitted to the
        // webview for a request we could not read (R5).
        Err(e) => return Envelope::err(ErrorCode::Internal, format!("malformed request: {e}")),
    };
    if request.op.is_empty() {
        return Envelope::err(ErrorCode::Internal, "request names no op");
    }

    let Some(op) = registry::lookup(&request.op) else {
        dispatcher.log(
            "warn",
            &format!("refused unknown op \"{}\"", request.op),
        );
        return Envelope::err(
            ErrorCode::Denied,
            format!("\"{}\" is not a Control operation", request.op),
        );
    };

    let result = dispatcher.dispatch(&request);

    // The tier is logged with every outcome, so the Output panel's Control
    // channel is a legible audit trail of what the channel was asked to *change*
    // rather than only of what it was asked.
    let tier = match op.tier {
        Tier::Read => "read",
        Tier::Mutate => "mutate",
    };
    dispatcher.log(
        if result.ok { "info" } else { "warn" },
        &format!(
            "{} [{tier}] → {}",
            request.op,
            result.error.as_ref().map_or("ok", |e| e.code.as_str())
        ),
    );
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::sync::{Arc, Mutex};

    /// A dispatcher that answers inline, counts calls, and records its log.
    #[derive(Clone, Default)]
    struct TestDispatcher {
        calls: Arc<AtomicU32>,
        lines: Arc<Mutex<Vec<String>>>,
        /// Milliseconds to stall before answering, to prove concurrent clients
        /// are not serialized behind one another.
        delay_ms: u64,
    }

    impl Dispatcher for TestDispatcher {
        fn dispatch(&self, request: &Request) -> Envelope {
            self.calls.fetch_add(1, Ordering::SeqCst);
            if self.delay_ms > 0 {
                std::thread::sleep(Duration::from_millis(self.delay_ms));
            }
            Envelope::ok(serde_json::json!({ "echo": request.op, "cwd": request.cwd }))
        }

        fn log(&self, level: &str, message: &str) {
            self.lines
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .push(format!("{level}: {message}"));
        }
    }

    /// Run `f` with the runtime base redirected to a private temp dir, so the
    /// resolved socket path is this test's own and never the developer's live
    /// instance. Serialized on the crate's env guard, since the base is process
    /// -global and cargo runs tests in parallel threads.
    fn with_socket_dir<T>(tag: &str, f: impl FnOnce() -> T) -> T {
        let _g = crate::commands::app_paths::env_lock();
        // Short base under /tmp: a socket path is capped at ~104 bytes, and
        // `std::env::temp_dir()` on macOS is already half of that.
        let dir = format!("/tmp/silo-ctl-t-{}-{tag}", std::process::id());
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let prev = std::env::var("XDG_RUNTIME_DIR").ok();
        std::env::set_var("XDG_RUNTIME_DIR", &dir);

        let out = f();

        match prev {
            Some(v) => std::env::set_var("XDG_RUNTIME_DIR", v),
            None => std::env::remove_var("XDG_RUNTIME_DIR"),
        }
        let _ = std::fs::remove_dir_all(&dir);
        out
    }

    /// A server that stops itself when the test drops it.
    ///
    /// Load-bearing, not tidiness: the socket address comes from process-global
    /// env, so a server thread outliving its test would still be polling — and
    /// re-binding — while the *next* test owns the address.
    struct Server {
        stopper: Stopper,
        handle: Option<std::thread::JoinHandle<()>>,
    }

    impl Drop for Server {
        fn drop(&mut self) {
            self.stopper.stop();
            if let Some(handle) = self.handle.take() {
                let _ = handle.join();
            }
        }
    }

    /// Serve on a background thread and wait until the socket answers.
    fn start(dispatcher: TestDispatcher) -> Server {
        let stopper = Stopper::default();
        let handle = std::thread::spawn({
            let stopper = stopper.clone();
            move || serve(dispatcher, stopper)
        });
        for _ in 0..200 {
            if connect_probe() {
                return Server {
                    stopper,
                    handle: Some(handle),
                };
            }
            std::thread::sleep(Duration::from_millis(10));
        }
        stopper.stop();
        panic!("listener never came up at {}", paths::endpoint());
    }

    /// One request, one response, as a client would.
    fn ask(line: &str) -> String {
        let stream = Stream::connect(paths::name().unwrap()).expect("connect");
        let _ = stream.set_recv_timeout(Some(Duration::from_secs(5)));
        let mut out = &stream;
        out.write_all(line.as_bytes()).unwrap();
        out.write_all(b"\n").unwrap();
        out.flush().unwrap();
        let mut response = String::new();
        BufReader::new(&stream).read_line(&mut response).unwrap();
        response
    }

    fn envelope(line: &str) -> Envelope {
        serde_json::from_str(line.trim()).expect("a parseable envelope")
    }

    #[test]
    #[cfg(unix)]
    fn answers_a_registered_op_and_creates_the_socket_0600() {
        use std::os::unix::fs::PermissionsExt;

        with_socket_dir("ok", || {
            let d = TestDispatcher::default();
            let _server = start(d.clone());

            let env = envelope(&ask(r#"{"id":"a","op":"status","args":{},"cwd":"/x"}"#));
            assert!(env.ok, "{env:?}");
            assert_eq!(env.data.unwrap()["cwd"], serde_json::json!("/x"));
            assert_eq!(d.calls.load(Ordering::SeqCst), 1);

            // The socket's own mode is the authorization story (R2).
            let mode = std::fs::metadata(paths::socket_path())
                .unwrap()
                .permissions()
                .mode()
                & 0o777;
            assert_eq!(mode, 0o600, "socket mode was {mode:o}");
        });
    }

    #[test]
    #[cfg(unix)]
    fn an_unknown_op_is_denied_without_reaching_the_dispatcher() {
        with_socket_dir("denied", || {
            let d = TestDispatcher::default();
            let _server = start(d.clone());

            let env = envelope(&ask(r#"{"id":"a","op":"terminal.write","args":{}}"#));
            assert!(!env.ok);
            assert_eq!(env.error.unwrap().code, ErrorCode::Denied);
            assert_eq!(
                d.calls.load(Ordering::SeqCst),
                0,
                "an unknown op must be refused at the registry, not dispatched"
            );
        });
    }

    #[test]
    #[cfg(unix)]
    fn a_malformed_or_op_less_request_is_refused_before_dispatch() {
        with_socket_dir("malformed", || {
            let d = TestDispatcher::default();
            let _server = start(d.clone());

            for line in [r#"{"id":"a","#, "not json at all", r#"{"id":"a","op":""}"#] {
                let env = envelope(&ask(line));
                assert!(!env.ok, "{line} should be refused");
                assert_eq!(env.error.unwrap().code, ErrorCode::Internal);
            }
            assert_eq!(d.calls.load(Ordering::SeqCst), 0);
        });
    }

    #[test]
    #[cfg(unix)]
    fn a_request_larger_than_one_buffer_fill_still_round_trips() {
        // The regression this exists for: on macOS/BSD an accepted stream
        // inherits the listener's `O_NONBLOCK`, so before `set_nonblocking
        // (false)` every request over one 8 KiB buffer fill failed partway
        // through the read. A 32 KiB `--prompt` is a realistic payload.
        with_socket_dir("big", || {
            let d = TestDispatcher::default();
            let _server = start(d.clone());

            let prompt = "x".repeat(32 * 1024);
            let line = serde_json::json!({
                "id": "a", "op": "agent.run", "args": { "prompt": prompt }, "cwd": "/w",
            })
            .to_string();
            assert!(line.len() > 8 * 1024, "the payload must exceed one fill");

            let env = envelope(&ask(&line));
            assert!(env.ok, "{env:?}");
            assert_eq!(env.data.unwrap()["cwd"], serde_json::json!("/w"));
            assert_eq!(d.calls.load(Ordering::SeqCst), 1);
        });
    }

    #[test]
    #[cfg(unix)]
    fn a_request_over_the_size_cap_is_refused() {
        with_socket_dir("size", || {
            let d = TestDispatcher::default();
            let _server = start(d.clone());

            let huge = format!(
                r#"{{"id":"a","op":"agent.run","args":{{"prompt":"{}"}}}}"#,
                "x".repeat(MAX_REQUEST_BYTES as usize)
            );
            let env = envelope(&ask(&huge));
            assert!(!env.ok);
            assert_eq!(env.error.unwrap().code, ErrorCode::Internal);
            assert_eq!(d.calls.load(Ordering::SeqCst), 0);
        });
    }

    #[test]
    #[cfg(unix)]
    fn two_concurrent_clients_are_answered_independently() {
        with_socket_dir("concurrent", || {
            // A 300ms dispatch: if connections were serialized, two clients
            // would take 600ms and the second answer would arrive late.
            let d = TestDispatcher {
                delay_ms: 300,
                ..Default::default()
            };
            let _server = start(d.clone());

            let started = std::time::Instant::now();
            let a = std::thread::spawn(|| ask(r#"{"id":"a","op":"status","cwd":"/a"}"#));
            let b = std::thread::spawn(|| ask(r#"{"id":"b","op":"ws.live","cwd":"/b"}"#));
            let (a, b) = (a.join().unwrap(), b.join().unwrap());
            let elapsed = started.elapsed();

            // Each client gets *its own* answer, not the other's.
            assert_eq!(envelope(&a).data.unwrap()["cwd"], serde_json::json!("/a"));
            assert_eq!(envelope(&b).data.unwrap()["cwd"], serde_json::json!("/b"));
            assert_eq!(d.calls.load(Ordering::SeqCst), 2);
            assert!(
                elapsed < Duration::from_millis(550),
                "clients were serialized: {elapsed:?}"
            );
        });
    }

    #[test]
    #[cfg(unix)]
    fn a_client_that_hangs_up_early_does_not_wedge_the_listener() {
        with_socket_dir("hangup", || {
            let d = TestDispatcher::default();
            let _server = start(d.clone());

            // Send and drop without reading the reply.
            {
                let stream = Stream::connect(paths::name().unwrap()).unwrap();
                let mut out = &stream;
                out.write_all(b"{\"id\":\"a\",\"op\":\"status\"}\n").unwrap();
                out.flush().unwrap();
            }

            // The next client is still served.
            let env = envelope(&ask(r#"{"id":"b","op":"status","cwd":"/b"}"#));
            assert!(env.ok, "{env:?}");
        });
    }

    #[test]
    #[cfg(unix)]
    fn a_stale_socket_file_is_taken_over() {
        with_socket_dir("stale", || {
            // A corpse left by a crashed predecessor: the path exists, nothing
            // is listening. Binding must replace it rather than give up.
            paths::ensure_dir().unwrap();
            std::fs::write(paths::socket_path(), b"").unwrap();
            assert!(paths::socket_path().exists());

            let d = TestDispatcher::default();
            let _server = start(d.clone());
            assert!(envelope(&ask(r#"{"id":"a","op":"status"}"#)).ok);
        });
    }

    #[test]
    #[cfg(unix)]
    fn a_live_socket_is_refused_and_left_alone() {
        with_socket_dir("live", || {
            let first = TestDispatcher::default();
            let _server = start(first.clone());

            // A second instance must not displace the first: no unlink, no
            // bind, and a logged refusal. `serve` returns immediately here
            // rather than entering an accept loop, so it is called inline.
            let second = TestDispatcher::default();
            serve(second.clone(), Stopper::default());

            let lines = second.lines.lock().unwrap().clone();
            assert!(
                lines.iter().any(|l| l.contains("already owns")),
                "expected a logged refusal, got {lines:?}"
            );
            // The first instance is still the one answering.
            assert!(envelope(&ask(r#"{"id":"a","op":"status"}"#)).ok);
            assert_eq!(first.calls.load(Ordering::SeqCst), 1);
            assert_eq!(second.calls.load(Ordering::SeqCst), 0);
        });
    }

    #[test]
    #[cfg(unix)]
    fn the_listener_re_binds_when_its_socket_is_reaped() {
        with_socket_dir("reap", || {
            let d = TestDispatcher::default();
            let _server = start(d.clone());
            assert!(envelope(&ask(r#"{"id":"a","op":"status"}"#)).ok);

            // The $TMPDIR reap case ADR 0022 documents: the path is removed out
            // from under a live instance. It must cost one request, not this
            // instance's reachability for the rest of its life.
            std::fs::remove_file(paths::socket_path()).unwrap();

            let mut recovered = false;
            for _ in 0..200 {
                std::thread::sleep(Duration::from_millis(25));
                if connect_probe() {
                    recovered = true;
                    break;
                }
            }
            assert!(recovered, "the listener never re-bound");
            assert!(envelope(&ask(r#"{"id":"b","op":"status"}"#)).ok);

            let lines = d.lines.lock().unwrap().clone();
            assert!(
                lines.iter().any(|l| l.contains("re-binding")),
                "the re-bind should be logged: {lines:?}"
            );
        });
    }
}
