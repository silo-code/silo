// Periodic PTY-session maintenance: reap orphaned session-host daemons by
// workspace membership, never by time.
//
// The contract (the persistent-workspace promise): a session referenced by
// any existing workspace file — open or closed, idle for months — is never
// touched. The only death signal is "the workspace that owned this session
// no longer exists in Silo's workspace list": its sessions should already
// have been killed when the workspace was deleted, so anything still running
// is cleanup debt from a missed kill (a crash mid-delete, a killed test
// harness). This sweep exists so that debt is collected within hours while
// Silo runs — not only at the next restart, which for a user who keeps Silo
// up for months may be weeks away.
//
// Safety properties, in order of importance:
// - Sessions not in the session registry are exempt: the registry records
//   every session this app created (`terminal.rs` saves at create time), so
//   anything absent from it — e.g. a session made via the standalone
//   `pty-host` CLI — isn't ours to kill.
// - Two-strike rule: a candidate must be orphaned across two consecutive
//   sweeps before it's killed, so one unluckily-timed snapshot (a terminal
//   created after the workspace files were last flushed — the frontend
//   persists on a debounce) can never kill anything.
// - Fail-safe reads: if the workspace store can't be read or any file in it
//   fails to parse, the whole sweep is skipped — "couldn't determine" is
//   never treated as "not referenced".

use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use super::session_backend::{active_backend, log_event};
use super::session_registry;
use pty_host::discovery;

// First sweep shortly after startup (covers the crash-then-relaunch case),
// a quick second pass to satisfy the two-strike rule without waiting a full
// hour, then hourly for as long as the app runs.
const FIRST_SWEEP_DELAY: Duration = Duration::from_secs(90);
const SECOND_SWEEP_DELAY: Duration = Duration::from_secs(10 * 60);
const SWEEP_INTERVAL: Duration = Duration::from_secs(60 * 60);

/// The `workspaces/` dir under the config root exported by `lib.rs::run()`
/// as `SILO_CONFIG_ROOT` (mirroring the `SILO_DATA_DIR`/`SILO_PTY_NS`
/// pattern). `None` when unset — the sweep then never runs.
fn workspaces_dir() -> Option<PathBuf> {
    std::env::var("SILO_CONFIG_ROOT")
        .ok()
        .filter(|s| !s.is_empty())
        .map(|root| PathBuf::from(root).join("workspaces"))
}

/// Every `sessionId` referenced by one workspace file's terminals. `None` on
/// parse failure (fail-safe — a half-written file mid-flush must abort the
/// sweep, not expose its sessions as unreferenced).
fn extract_session_ids(json: &str) -> Option<Vec<String>> {
    let v: serde_json::Value = serde_json::from_str(json).ok()?;
    let terminals = match v.get("workspace").and_then(|w| w.get("terminals")) {
        Some(t) => t.as_array()?.clone(),
        // A workspace with no terminals key is valid — it just references
        // no sessions.
        None => Vec::new(),
    };
    Some(
        terminals
            .iter()
            .filter_map(|t| t.get("sessionId").and_then(|s| s.as_str()))
            .map(str::to_string)
            .collect(),
    )
}

/// Every session id referenced by any existing workspace file. `Err` (with
/// the reason, for the skip log) if the store can't be read in full — the
/// caller must skip the sweep entirely. A silent skip would let one corrupt
/// file disable maintenance forever with no trace; the live verification of
/// this module found exactly that (a stray 0-byte workspace file).
fn referenced_session_ids() -> Result<HashSet<String>, String> {
    let dir = workspaces_dir().ok_or("SILO_CONFIG_ROOT unset")?;
    let entries =
        std::fs::read_dir(&dir).map_err(|e| format!("read_dir {}: {e}", dir.display()))?;
    let mut out = HashSet::new();
    for e in entries.flatten() {
        let p = e.path();
        if p.extension().and_then(|s| s.to_str()) != Some("json") {
            continue;
        }
        let text =
            std::fs::read_to_string(&p).map_err(|e| format!("read {}: {e}", p.display()))?;
        out.extend(
            extract_session_ids(&text)
                .ok_or_else(|| format!("unparseable workspace file {}", p.display()))?,
        );
    }
    Ok(out)
}

/// Pure: which registry-known sessions are live but referenced by no
/// existing workspace file? Iterates the registry (not the live list), so
/// sessions the app never created are structurally exempt.
fn orphan_candidates(
    live_handles: &HashSet<String>,
    registry: &HashMap<String, String>,
    referenced: &HashSet<String>,
) -> Vec<(String, String)> {
    let mut out: Vec<(String, String)> = registry
        .iter()
        .filter(|(sid, handle)| live_handles.contains(*handle) && !referenced.contains(*sid))
        .map(|(sid, handle)| (sid.clone(), handle.clone()))
        .collect();
    out.sort();
    out
}

/// Pure: apply the two-strike rule. Returns the candidates that were already
/// suspects last sweep (confirmed — kill now) and replaces the suspect set
/// with this sweep's candidates, so a candidate that disappears between
/// sweeps (its workspace file flushed late) is forgotten, not accumulated.
fn confirm_orphans(
    suspects: &mut HashSet<(String, String)>,
    candidates: Vec<(String, String)>,
) -> Vec<(String, String)> {
    let current: HashSet<(String, String)> = candidates.into_iter().collect();
    let mut confirmed: Vec<(String, String)> =
        current.intersection(suspects).cloned().collect();
    confirmed.sort();
    *suspects = current;
    confirmed
}

/// The two-strike suspect set, shared between the periodic background sweep
/// and an on-demand trigger (`trigger_sweep_now`, exposed to the dev-only
/// automation RPC for integration tests) — both must drive the *same* state,
/// or a manual trigger interleaved with the timer could see a candidate as
/// "first time" twice in a row and never confirm it, or double-count it.
fn suspects_state() -> &'static Mutex<HashSet<(String, String)>> {
    static STATE: OnceLock<Mutex<HashSet<(String, String)>>> = OnceLock::new();
    STATE.get_or_init(|| Mutex::new(HashSet::new()))
}

/// Run one sweep pass. Safe to call concurrently (from the background timer
/// and an on-demand trigger both) — serialized on `suspects_state()`'s lock
/// for the pass's full duration, so two passes can't interleave and
/// double-confirm or double-kill the same candidate.
fn run_sweep() {
    let mut suspects = suspects_state().lock().unwrap_or_else(|e| e.into_inner());

    // File-level cleanup first: dead sockets and orphaned sidecar files.
    discovery::reap_stale();

    let referenced = match referenced_session_ids() {
        Ok(r) => r,
        Err(reason) => {
            // Couldn't read the workspace store — skip, and drop any prior
            // suspicions so a bad read can't count as a strike. Loudly: a
            // persistent read failure would otherwise disable maintenance
            // forever with nothing in the log to show for it.
            log_event("maintenance_skip", &reason);
            suspects.clear();
            return;
        }
    };
    let live: HashSet<String> = discovery::list_sessions().into_iter().collect();
    let registry = session_registry::all();

    let confirmed =
        confirm_orphans(&mut suspects, orphan_candidates(&live, &registry, &referenced));
    for (session_id, handle) in confirmed {
        log_event(
            "maintenance_reap",
            &format!("session={session_id} handle={handle} reason=no-workspace-references"),
        );
        let _ = active_backend().kill(&handle);
        session_registry::remove(&session_id);
    }
}

/// Run one sweep pass immediately, outside the normal timer. Exposed to the
/// dev-only automation RPC (`triggerMaintenanceSweep`) so integration tests
/// can exercise the real membership-based reap deterministically instead of
/// waiting out the real hourly cadence.
pub fn trigger_sweep_now() {
    run_sweep();
}

/// Test-only seam: `SILO_TEST_MAINT_SWEEP_MS` collapses all three delays to
/// one fast interval so a live verification doesn't wait out real hours.
fn sweep_delay(tick: usize) -> Duration {
    if let Some(ms) = std::env::var("SILO_TEST_MAINT_SWEEP_MS")
        .ok()
        .and_then(|s| s.parse().ok())
    {
        return Duration::from_millis(ms);
    }
    match tick {
        0 => FIRST_SWEEP_DELAY,
        1 => SECOND_SWEEP_DELAY,
        _ => SWEEP_INTERVAL,
    }
}

/// Pure: should the automatic timer be disabled? Factored out from
/// `spawn_maintenance_sweep` so the "empty string doesn't count as set"
/// nuance (a shell `export FOO=` some CI step forgot to unset) is unit
/// testable without spawning a real thread.
fn auto_sweep_disabled(env_value: Option<String>) -> bool {
    env_value.is_some_and(|v| !v.is_empty())
}

/// Spawn the maintenance sweep. Call once, at app startup. A no-op when
/// `SILO_DISABLE_MAINTENANCE_SWEEP` is set: the automatic timer's first tick
/// (90s after startup, by default) has no way to know a test suite is mid-run
/// against the same app instance, and a sweep firing at an unpredictable
/// moment can reap a test's in-flight, not-yet-persisted session out from
/// under it — found in CI when it disrupted an unrelated integration test.
/// Set by `integration.yml`'s app-launch step; `triggerMaintenanceSweep`
/// (the automation RPC op) stays fully available regardless, so tests that
/// want a sweep still get one, deterministically, on their own terms.
pub fn spawn_maintenance_sweep() {
    if auto_sweep_disabled(std::env::var("SILO_DISABLE_MAINTENANCE_SWEEP").ok()) {
        return;
    }
    std::thread::spawn(|| {
        let mut tick = 0usize;
        loop {
            std::thread::sleep(sweep_delay(tick));
            tick += 1;
            run_sweep();
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Mutex, OnceLock};

    // `SILO_TEST_MAINT_SWEEP_MS` is process-global; the two tests below both
    // touch it and cargo runs tests in parallel by default, so they'd race
    // each other without this.
    fn sweep_env_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    #[test]
    fn sweep_delay_progresses_first_second_then_hourly() {
        let _g = sweep_env_lock().lock().unwrap_or_else(|e| e.into_inner());
        let prev = std::env::var("SILO_TEST_MAINT_SWEEP_MS").ok();
        std::env::remove_var("SILO_TEST_MAINT_SWEEP_MS");

        assert_eq!(sweep_delay(0), FIRST_SWEEP_DELAY);
        assert_eq!(sweep_delay(1), SECOND_SWEEP_DELAY);
        assert_eq!(sweep_delay(2), SWEEP_INTERVAL);
        assert_eq!(sweep_delay(100), SWEEP_INTERVAL);

        match prev {
            Some(v) => std::env::set_var("SILO_TEST_MAINT_SWEEP_MS", v),
            None => std::env::remove_var("SILO_TEST_MAINT_SWEEP_MS"),
        }
    }

    #[test]
    fn sweep_delay_env_override_wins_at_every_tick() {
        let _g = sweep_env_lock().lock().unwrap_or_else(|e| e.into_inner());
        let prev = std::env::var("SILO_TEST_MAINT_SWEEP_MS").ok();
        std::env::set_var("SILO_TEST_MAINT_SWEEP_MS", "250");

        assert_eq!(sweep_delay(0), Duration::from_millis(250));
        assert_eq!(sweep_delay(1), Duration::from_millis(250));
        assert_eq!(sweep_delay(2), Duration::from_millis(250));

        match prev {
            Some(v) => std::env::set_var("SILO_TEST_MAINT_SWEEP_MS", v),
            None => std::env::remove_var("SILO_TEST_MAINT_SWEEP_MS"),
        }
    }

    #[test]
    fn auto_sweep_disabled_only_when_set_and_non_empty() {
        assert!(!auto_sweep_disabled(None), "unset must not disable it");
        assert!(
            !auto_sweep_disabled(Some(String::new())),
            "an empty value (e.g. a forgotten `export FOO=`) must not disable it either"
        );
        assert!(auto_sweep_disabled(Some("1".to_string())));
    }

    #[test]
    fn extract_session_ids_reads_terminals() {
        let json = r#"{"workspace":{"id":"ws_1","terminals":[
            {"id":"t1","sessionId":"aaa"},{"id":"t2","sessionId":"bbb"}
        ]}}"#;
        assert_eq!(extract_session_ids(json).unwrap(), vec!["aaa", "bbb"]);
    }

    #[test]
    fn extract_session_ids_tolerates_missing_terminals_but_not_bad_json() {
        assert_eq!(
            extract_session_ids(r#"{"workspace":{"id":"ws_1"}}"#).unwrap(),
            Vec::<String>::new()
        );
        // A half-written file must poison the whole sweep, not read as empty.
        assert_eq!(extract_session_ids(r#"{"workspace":{"termi"#), None);
    }

    #[test]
    fn orphan_candidates_applies_all_three_filters() {
        let live: HashSet<String> =
            ["h-orphan", "h-referenced", "h-cli"].map(String::from).into();
        let registry: HashMap<String, String> = [
            ("sid-orphan".to_string(), "h-orphan".to_string()),
            ("sid-referenced".to_string(), "h-referenced".to_string()),
            ("sid-dead".to_string(), "h-dead".to_string()), // not live
        ]
        .into();
        let referenced: HashSet<String> = ["sid-referenced".to_string()].into();

        // Only the live, registry-known, unreferenced session is a candidate:
        // the referenced one is protected, the dead one has nothing to kill,
        // and h-cli (live but not in the registry) is structurally exempt.
        assert_eq!(
            orphan_candidates(&live, &registry, &referenced),
            vec![("sid-orphan".to_string(), "h-orphan".to_string())]
        );
    }

    #[test]
    fn confirm_orphans_requires_two_consecutive_strikes() {
        let orphan = ("sid-1".to_string(), "h-1".to_string());
        let transient = ("sid-2".to_string(), "h-2".to_string());
        let mut suspects = HashSet::new();

        // First sighting: suspect only, nothing confirmed.
        let killed = confirm_orphans(&mut suspects, vec![orphan.clone(), transient.clone()]);
        assert!(killed.is_empty());

        // Second sweep: `transient`'s workspace file has since flushed, so it
        // is no longer a candidate — only the persisting orphan is confirmed.
        let killed = confirm_orphans(&mut suspects, vec![orphan.clone()]);
        assert_eq!(killed, vec![orphan.clone()]);

        // `transient` was forgotten, not accumulated: seeing it again later
        // starts its count over.
        let killed = confirm_orphans(&mut suspects, vec![transient.clone()]);
        assert!(killed.is_empty());
    }
}
