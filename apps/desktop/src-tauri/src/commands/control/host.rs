//! The running app's [`Dispatcher`] — how an accepted Control request becomes an
//! answer (RFC 0034 R8, R9).
//!
//! Two kinds of op, per the registry:
//!
//! - **Host-answered** (`status`) short-circuits here, without allocating a
//!   pending entry or touching the webview. That is what keeps it available when
//!   the webview is wedged, which is the whole reason `status` exists.
//! - **Webview-answered** round-trips: emit `control://request`, wait on a
//!   pending entry keyed by a host-side monotonic id, match `control://reply`.
//!   The pattern is ADR 0012's, including its 5s deadline.
//!
//! Webview ops are dispatched to single-threaded JavaScript, so they serialize
//! naturally: two concurrent `agent.run` calls cannot interleave. That is a
//! property of the runtime, stated here so it is not silently relied on.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{channel, Sender};
use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Listener as _, Manager, Runtime};

use super::envelope::{Envelope, ErrorCode, Request};
use super::listener::{self, Dispatcher};
use super::registry::{self, Answerer};
use super::status;

/// How long the host waits for the webview to answer one request. Matches
/// `automation.rs`'s `REPLY_TIMEOUT` — same round trip, same order of magnitude.
const REPLY_TIMEOUT: Duration = Duration::from_secs(5);

/// Correlates in-flight requests with their webview replies.
///
/// The key is a host-side monotonic id, never the client's `id`: a client that
/// guessed or replayed another client's correlation id must not be able to
/// address its pending entry (R8).
#[derive(Default)]
pub struct ControlState {
    next_id: AtomicU64,
    pending: Mutex<HashMap<u64, Sender<Reply>>>,
}

#[derive(Clone, Serialize)]
struct RequestEvent {
    id: u64,
    op: String,
    args: serde_json::Value,
    cwd: String,
}

#[derive(Clone, Deserialize)]
struct Reply {
    id: u64,
    #[serde(default)]
    data: serde_json::Value,
    /// A classified refusal from the handler. Absent → `data` is the answer.
    #[serde(default)]
    error: Option<ReplyError>,
}

#[derive(Clone, Deserialize)]
struct ReplyError {
    code: ErrorCode,
    message: String,
}

/// The app's dispatcher. Cheap to clone — one `AppHandle`.
struct HostDispatcher<R: Runtime> {
    app: AppHandle<R>,
}

impl<R: Runtime> Clone for HostDispatcher<R> {
    fn clone(&self) -> Self {
        Self {
            app: self.app.clone(),
        }
    }
}

impl<R: Runtime> Dispatcher for HostDispatcher<R> {
    fn dispatch(&self, request: &Request) -> Envelope {
        // The listener has already refused anything not in the allowlist, so a
        // miss here is a registry that names an op nothing implements.
        let Some(op) = registry::lookup(&request.op) else {
            return Envelope::err(ErrorCode::Denied, "unknown operation");
        };
        match op.answered_by {
            Answerer::Host => match op.name {
                "status" => Envelope::ok(
                    serde_json::to_value(status::snapshot())
                        .unwrap_or_else(|_| serde_json::json!({})),
                ),
                other => Envelope::err(
                    ErrorCode::Internal,
                    format!("\"{other}\" is registered host-answered but has no handler"),
                ),
            },
            Answerer::Webview => self.round_trip(request),
        }
    }

    /// Two destinations on purpose. `control://log` reaches the Output panel's
    /// **Control** channel, which is where a user looks — but the webview may
    /// not exist yet, and bind, refusal and takeover all happen before it does.
    /// So the same line also goes to stderr, matching `automation.rs`, and a
    /// startup-time refusal is never invisible.
    fn log(&self, level: &str, message: &str) {
        eprintln!("[control] {message}");
        let _ = self.app.emit(
            "control://log",
            serde_json::json!({ "level": level, "message": message }),
        );
    }
}

impl<R: Runtime> HostDispatcher<R> {
    /// Emit to the webview and wait for its reply.
    fn round_trip(&self, request: &Request) -> Envelope {
        let state = self.app.state::<ControlState>();
        let id = state.next_id.fetch_add(1, Ordering::SeqCst);
        let (tx, rx) = channel::<Reply>();
        state
            .pending
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(id, tx);

        let event = RequestEvent {
            id,
            op: request.op.clone(),
            args: request.args.clone(),
            cwd: request.cwd.clone(),
        };
        if self.app.emit("control://request", event).is_err() {
            state
                .pending
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .remove(&id);
            return Envelope::err(ErrorCode::Internal, "failed to dispatch to the webview");
        }

        match rx.recv_timeout(REPLY_TIMEOUT) {
            Ok(reply) => match reply.error {
                Some(err) => Envelope::err(err.code, err.message),
                None => Envelope::ok(reply.data),
            },
            Err(_) => {
                // Drop the pending entry rather than leaking it — a late reply
                // then finds no waiter and is discarded (R8).
                state
                    .pending
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .remove(&id);
                Envelope::err(
                    ErrorCode::Timeout,
                    format!("Silo did not answer within {}s", REPLY_TIMEOUT.as_secs()),
                )
            }
        }
    }
}

/// Wire up the Control API and start serving.
///
/// Called from `lib.rs`'s `setup`, next to `automation::register` — but on every
/// platform and in every build profile.
pub fn register<R: Runtime>(app: &AppHandle<R>) {
    app.manage(ControlState::default());
    status::mark_started();

    // Replies arrive as ordinary events, so the production IPC surface gains no
    // invoke command for this.
    let reply_app = app.clone();
    app.listen("control://reply", move |event| {
        if let Ok(reply) = serde_json::from_str::<Reply>(event.payload()) {
            let state = reply_app.state::<ControlState>();
            // Bind first so the MutexGuard temporary drops before `state`.
            let waiter = state
                .pending
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .remove(&reply.id);
            if let Some(tx) = waiter {
                let _ = tx.send(reply);
            }
        }
    });

    // The webview tells us when its control dispatcher is live; `status`
    // reports it, and `--launch` polls on it (R9, R7).
    let ready_app = app.clone();
    app.listen("control://ready", move |event| {
        let ready = event.payload().trim() != "false";
        status::set_webview_ready(ready);
        let dispatcher = HostDispatcher {
            app: ready_app.clone(),
        };
        dispatcher.log(
            "info",
            if ready {
                "webview dispatcher registered"
            } else {
                "webview dispatcher torn down"
            },
        );
    });

    // No stopper is retained: the app's shutdown *is* process exit, and the
    // bound socket is unlinked as the listener drops with it.
    let dispatcher = HostDispatcher { app: app.clone() };
    std::thread::spawn(move || listener::serve(dispatcher, listener::Stopper::default()));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_reply_error_deserializes_into_the_closed_vocabulary() {
        let reply: Reply =
            serde_json::from_str(r#"{"id":3,"error":{"code":"not-found","message":"no"}}"#)
                .unwrap();
        assert_eq!(reply.id, 3);
        let err = reply.error.expect("an error body");
        assert_eq!(err.code, ErrorCode::NotFound);
        assert_eq!(err.message, "no");
    }

    #[test]
    fn a_reply_without_an_error_is_a_success_with_data() {
        let reply: Reply =
            serde_json::from_str(r#"{"id":1,"data":{"terminalId":"t_1"}}"#).unwrap();
        assert!(reply.error.is_none());
        assert_eq!(reply.data["terminalId"], serde_json::json!("t_1"));
    }

    #[test]
    fn a_reply_with_an_unknown_code_fails_to_parse_rather_than_inventing_one() {
        // The vocabulary is closed on the wire too: a handler cannot smuggle a
        // new code through, and a failed parse leaves the request to time out
        // rather than answering with something unmapped.
        assert!(
            serde_json::from_str::<Reply>(r#"{"id":1,"error":{"code":"oops","message":"x"}}"#)
                .is_err()
        );
    }
}
