//! Dev-only automation RPC.
//!
//! A loopback HTTP server that lets an external driver (a test suite, or an
//! agent) operate the *real* running app: run registered commands, introspect
//! focus/DOM, read context keys. It exists to work around the fact that macOS
//! exposes no external automation hook for a WKWebView (no WebDriver, no CDP)
//! and gates synthetic input behind Accessibility — so instead of driving the
//! app from outside, the app voluntarily listens here.
//!
//! Gated so it can never reach end users, and locked down so a web page you
//! visit *during development* can't drive it:
//!   1. the `automation` Cargo feature — excluded from release builds entirely,
//!   2. the frontend bridge only loads under `import.meta.env.DEV`,
//!   3. every request must carry the `X-Silo-Automation: 1` header AND a
//!      loopback `Host`. A cross-origin page can't set a custom header without a
//!      CORS preflight (which this server never answers), and the `Host` check
//!      defeats DNS-rebinding. The socket is bound to `127.0.0.1` only.
//!
//! There is intentionally no runtime env switch: in a dev build the server is
//! always available (so tests/agents need no setup), but the request guard
//! above is what actually keeps it safe — not obscurity.
//!
//! Protocol (newline-free JSON over HTTP POST to `/`):
//!   request:  `{ "op": "<name>", "args": { ... } }`
//!   response: `{ "ok": true, "result": <value> }` | `{ "ok": false, "error": "<msg>" }`
//!
//! Most ops round-trip through the webview: the host emits `automation://request`,
//! the frontend bridge handles it and emits `automation://reply` back. `ping` is
//! answered host-side so liveness checks don't depend on the webview.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{channel, Sender};
use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Listener, Manager, Runtime};

/// Loopback port the RPC server binds to. Override with `SILO_AUTOMATION_PORT`.
const DEFAULT_PORT: u16 = 7878;

/// How long the host waits for the webview to answer one request.
const REPLY_TIMEOUT: Duration = Duration::from_secs(5);

/// Correlates in-flight HTTP requests with their webview replies.
#[derive(Default)]
pub struct AutomationState {
    next_id: AtomicU64,
    pending: Mutex<HashMap<u64, Sender<Reply>>>,
}

#[derive(Clone, Serialize)]
struct RequestEvent {
    id: u64,
    op: String,
    args: Value,
}

#[derive(Clone, Deserialize)]
struct Reply {
    id: u64,
    #[serde(default)]
    result: Value,
    #[serde(default)]
    error: Option<String>,
}

/// Wire up the automation surface. Always active in a dev build (the feature is
/// compiled out of release builds); the per-request guard in `handle_request`,
/// not an env switch, is what keeps it safe.
pub fn register<R: Runtime>(app: &AppHandle<R>) {
    app.manage(AutomationState::default());

    // Replies arrive as ordinary events — no extra invoke command, so the
    // production IPC surface is untouched by this module.
    let reply_app = app.clone();
    app.listen("automation://reply", move |event| {
        if let Ok(reply) = serde_json::from_str::<Reply>(event.payload()) {
            let state = reply_app.state::<AutomationState>();
            // Bind first so the MutexGuard temporary drops before `state`.
            let waiter = state.pending.lock().unwrap().remove(&reply.id);
            if let Some(tx) = waiter {
                let _ = tx.send(reply);
            }
        }
    });

    let port = std::env::var("SILO_AUTOMATION_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(DEFAULT_PORT);

    let server_app = app.clone();
    std::thread::spawn(move || run_server(server_app, port));
}

fn run_server<R: Runtime>(app: AppHandle<R>, port: u16) {
    let server = match tiny_http::Server::http(("127.0.0.1", port)) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[automation] failed to bind 127.0.0.1:{port}: {e}");
            return;
        }
    };
    eprintln!("[automation] RPC listening on http://127.0.0.1:{port}");
    for request in server.incoming_requests() {
        // One thread per request: dispatch blocks up to REPLY_TIMEOUT waiting
        // for the webview, and we don't want that to stall the accept loop.
        let app = app.clone();
        std::thread::spawn(move || handle_request(&app, request));
    }
}

/// Case-insensitive lookup of a request header value.
fn header<'a>(request: &'a tiny_http::Request, name: &str) -> Option<&'a str> {
    request
        .headers()
        .iter()
        .find(|h| h.field.as_str().as_str().eq_ignore_ascii_case(name))
        .map(|h| h.value.as_str())
}

/// Only accept requests that a browser couldn't forge:
///   - `X-Silo-Automation: 1` — a cross-origin page can't set a custom header
///     without a CORS preflight, which this server never answers.
///   - a loopback `Host` — defeats DNS-rebinding (where a page on `evil.com`,
///     rebound to 127.0.0.1, becomes same-origin and *can* set the header, but
///     still carries `Host: evil.com`).
fn request_allowed(request: &tiny_http::Request) -> bool {
    if header(request, "X-Silo-Automation") != Some("1") {
        return false;
    }
    match header(request, "Host") {
        Some(host) => {
            let hostname = host.rsplit_once(':').map_or(host, |(h, _)| h);
            hostname == "127.0.0.1" || hostname == "localhost"
        }
        None => false,
    }
}

fn handle_request<R: Runtime>(app: &AppHandle<R>, mut request: tiny_http::Request) {
    if !request_allowed(&request) {
        let body = json!({ "ok": false, "error": "forbidden" }).to_string();
        let _ = request.respond(
            tiny_http::Response::from_string(body).with_status_code(403),
        );
        return;
    }
    let mut body = String::new();
    let _ = request.as_reader().read_to_string(&mut body);
    let response = match serde_json::from_str::<Value>(&body) {
        Ok(v) => dispatch(app, v),
        Err(e) => json!({ "ok": false, "error": format!("invalid JSON: {e}") }),
    };
    let header =
        tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap();
    let _ = request
        .respond(tiny_http::Response::from_string(response.to_string()).with_header(header));
}

/// Capture the app's own window to a base64-encoded PNG (the dev `screenshot`
/// op). Picks the non-minimized window whose app name looks like ours,
/// preferring the focused window, then the largest. Saves to a temp PNG (so we
/// don't have to pin the `image` crate's version to xcap's), reads it back,
/// base64-encodes, and cleans up. On macOS this needs Screen Recording
/// permission for the app — the first call may fail or return black until it's
/// granted in System Settings › Privacy & Security › Screen Recording.
fn capture_screenshot() -> Result<Value, String> {
    use base64::Engine;
    let windows = xcap::Window::all().map_err(|e| format!("enumerate windows: {e}"))?;
    let mut candidates: Vec<&xcap::Window> = windows
        .iter()
        .filter(|w| {
            w.app_name()
                .map(|n| n.to_lowercase().contains("silo"))
                .unwrap_or(false)
                && !w.is_minimized().unwrap_or(true)
        })
        .collect();
    if candidates.is_empty() {
        return Err("no Silo window found to capture".into());
    }
    // Focused first, then largest area.
    candidates.sort_by_key(|w| {
        let focused = w.is_focused().unwrap_or(false);
        let area = w.width().unwrap_or(0) as u64 * w.height().unwrap_or(0) as u64;
        std::cmp::Reverse((focused, area))
    });
    let win = candidates[0];
    let img = win
        .capture_image()
        .map_err(|e| format!("capture failed (Screen Recording permission?): {e}"))?;
    let path = std::env::temp_dir().join(format!("silo-shot-{}.png", std::process::id()));
    img.save(&path).map_err(|e| format!("encode png: {e}"))?;
    let bytes = std::fs::read(&path).map_err(|e| format!("read png: {e}"))?;
    let _ = std::fs::remove_file(&path);
    Ok(json!({
        "png_base64": base64::engine::general_purpose::STANDARD.encode(&bytes),
        "width": img.width(),
        "height": img.height(),
        "app": win.app_name().unwrap_or_default(),
        "title": win.title().unwrap_or_default(),
    }))
}

fn dispatch<R: Runtime>(app: &AppHandle<R>, body: Value) -> Value {
    let op = body
        .get("op")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();

    // Answered host-side so a liveness probe doesn't depend on the webview.
    if op == "ping" {
        return json!({ "ok": true, "result": "pong" });
    }

    // Host-side: the webview can't rasterize itself, so we grab the OS window.
    // Returns a base64 PNG the caller can decode and view.
    if op == "screenshot" {
        return match capture_screenshot() {
            Ok(result) => json!({ "ok": true, "result": result }),
            Err(e) => json!({ "ok": false, "error": e }),
        };
    }

    let args = body.get("args").cloned().unwrap_or_else(|| json!({}));
    let state = app.state::<AutomationState>();
    let id = state.next_id.fetch_add(1, Ordering::SeqCst);
    let (tx, rx) = channel::<Reply>();
    state.pending.lock().unwrap().insert(id, tx);

    if app
        .emit("automation://request", RequestEvent { id, op, args })
        .is_err()
    {
        state.pending.lock().unwrap().remove(&id);
        return json!({ "ok": false, "error": "failed to dispatch to webview" });
    }

    match rx.recv_timeout(REPLY_TIMEOUT) {
        Ok(reply) => match reply.error {
            Some(err) => json!({ "ok": false, "error": err }),
            None => json!({ "ok": true, "result": reply.result }),
        },
        Err(_) => {
            state.pending.lock().unwrap().remove(&id);
            json!({ "ok": false, "error": "timed out waiting for webview reply" })
        }
    }
}
