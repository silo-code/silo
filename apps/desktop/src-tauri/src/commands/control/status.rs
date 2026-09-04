//! `status` — the one op that never round-trips to the webview (RFC 0034 R9).
//!
//! The host answers it directly from what it already knows: version, identity,
//! pid, uptime, and a **readiness** flag the webview sets once its control
//! dispatcher is registered. That is what makes a wedged app diagnosable — a
//! webview that never came up still answers `status`, and says
//! `webview: "starting"`, so "Silo is broken" and "Silo is not running" never
//! look identical.
//!
//! It is also what `--launch` polls: waiting for *readiness* rather than for
//! socket existence means a request is never delivered to an instance that
//! cannot serve it.
//!
//! `automation.rs` already answers its `ping` host-side for the same reason;
//! this generalizes that precedent rather than inventing one.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use std::time::Instant;

use serde::{Deserialize, Serialize};

use crate::commands::identity;

/// Whether the webview's control dispatcher is registered and serving.
///
/// A process-global rather than Tauri managed state: the listener thread starts
/// before `setup` finishes managing anything, and `status` must be answerable
/// from the first accepted connection.
fn ready_flag() -> &'static AtomicBool {
    static READY: AtomicBool = AtomicBool::new(false);
    &READY
}

/// When this process started, for the `uptimeMs` field. Initialized on first
/// read, which the listener does at bind — long before any client can ask.
fn started_at() -> &'static Instant {
    static STARTED: OnceLock<Instant> = OnceLock::new();
    STARTED.get_or_init(Instant::now)
}

/// Record the process start time. Called at listener bind so `uptimeMs` counts
/// from startup rather than from the first `status` call.
pub fn mark_started() {
    let _ = started_at();
}

/// The webview registered (or tore down) its control dispatcher.
pub fn set_webview_ready(ready: bool) {
    ready_flag().store(ready, Ordering::SeqCst);
}

/// How the instance describes its own webview.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Webview {
    /// The control dispatcher is registered: every op is servable.
    Ready,
    /// The process is alive but the webview has not registered — still booting,
    /// or wedged. Distinguishable from "no instance", which is `not-running`.
    Starting,
}

/// The `status` op's `data`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub version: String,
    pub identity: String,
    pub pid: u32,
    pub uptime_ms: u64,
    pub webview: Webview,
}

/// Answer `status` from host state alone.
pub fn snapshot() -> Status {
    Status {
        version: env!("CARGO_PKG_VERSION").to_string(),
        identity: identity::IDENTIFIER.to_string(),
        pid: std::process::id(),
        uptime_ms: started_at().elapsed().as_millis() as u64,
        webview: if ready_flag().load(Ordering::SeqCst) {
            Webview::Ready
        } else {
            Webview::Starting
        },
    }
}

/// Human-readable rendering for `silo status` without `--json`.
pub fn render(status: &Status) -> String {
    let secs = status.uptime_ms / 1000;
    let uptime = if secs >= 3600 {
        format!("{}h {}m", secs / 3600, (secs % 3600) / 60)
    } else if secs >= 60 {
        format!("{}m {}s", secs / 60, secs % 60)
    } else {
        format!("{secs}s")
    };
    let webview = match status.webview {
        Webview::Ready => "ready",
        Webview::Starting => "starting (not yet serving commands)",
    };
    format!(
        "Silo {} ({})\n  pid      {}\n  uptime   {}\n  webview  {}\n",
        status.version, status.identity, status.pid, uptime, webview
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Serializes the tests that flip the process-global readiness flag.
    fn flag_lock() -> std::sync::MutexGuard<'static, ()> {
        static LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
        LOCK.lock().unwrap_or_else(|e| e.into_inner())
    }

    #[test]
    fn answers_with_the_webview_flag_unset() {
        // The wedged-app case: no webview ever registered, and `status` still
        // answers — with `starting`, not with a failure (R9).
        let _g = flag_lock();
        set_webview_ready(false);
        let s = snapshot();
        assert_eq!(s.webview, Webview::Starting);
        assert_eq!(s.pid, std::process::id());
        assert_eq!(s.version, env!("CARGO_PKG_VERSION"));
        assert_eq!(s.identity, identity::IDENTIFIER);
    }

    #[test]
    fn reports_ready_once_the_webview_registers() {
        let _g = flag_lock();
        set_webview_ready(true);
        assert_eq!(snapshot().webview, Webview::Ready);
        set_webview_ready(false);
        assert_eq!(snapshot().webview, Webview::Starting);
    }

    #[test]
    fn uptime_counts_from_process_start_not_first_call() {
        let _g = flag_lock();
        mark_started();
        let first = snapshot().uptime_ms;
        let second = snapshot().uptime_ms;
        assert!(second >= first, "uptime went backwards: {first} → {second}");
    }

    #[test]
    fn serializes_camel_case_with_a_kebab_case_webview() {
        let _g = flag_lock();
        set_webview_ready(false);
        let v = serde_json::to_value(snapshot()).unwrap();
        assert!(v.get("uptimeMs").is_some(), "expected camelCase: {v}");
        assert_eq!(v["webview"], serde_json::json!("starting"));
    }

    #[test]
    fn render_formats_uptime_by_magnitude() {
        let base = Status {
            version: "0.63.0".into(),
            identity: "com.silo.desktop".into(),
            pid: 4321,
            uptime_ms: 0,
            webview: Webview::Ready,
        };

        let seconds = render(&Status {
            uptime_ms: 42_000,
            ..base.clone()
        });
        assert!(seconds.contains("42s"), "{seconds}");
        assert!(seconds.contains("pid      4321"), "{seconds}");

        let minutes = render(&Status {
            uptime_ms: 125_000,
            ..base.clone()
        });
        assert!(minutes.contains("2m 5s"), "{minutes}");

        let hours = render(&Status {
            uptime_ms: 7_500_000,
            ..base.clone()
        });
        assert!(hours.contains("2h 5m"), "{hours}");

        // A starting webview says so in prose, not only in the JSON.
        let wedged = render(&Status {
            webview: Webview::Starting,
            ..base
        });
        assert!(wedged.contains("starting"), "{wedged}");
    }
}
