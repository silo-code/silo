// Persistent map: app session id -> backend session handle.
//
// Guard against the failure mode where the handle is *re-derived* from a
// compile-time constant (e.g. a session-name prefix). When that constant
// changes (e.g. the prefix is renamed), every still-alive session is orphaned
// because reattach computed a name that no longer matched the live session. The
// fix: persist the authoritative handle at create time and look it up on
// reattach instead of recomputing it. This map is backend-agnostic — it stores
// opaque handle strings, independent of any particular backend.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

fn registry_path() -> Option<PathBuf> {
    // Tests (and advanced users) can redirect the registry file via env so the
    // real home-dir copy is never touched.
    if let Ok(p) = std::env::var("SILO_SESSION_REGISTRY") {
        return Some(PathBuf::from(p));
    }
    dirs::home_dir().map(|h| h.join(".app-editor/terminal-sessions.json"))
}

// Serializes read-modify-write so concurrent terminal commands can't clobber
// each other's entries.
fn guard() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

fn read_map() -> HashMap<String, String> {
    let path = match registry_path() {
        Some(p) => p,
        None => return HashMap::new(),
    };
    let text = match std::fs::read_to_string(&path) {
        Ok(t) => t,
        Err(_) => return HashMap::new(),
    };
    serde_json::from_str(&text).unwrap_or_default()
}

fn write_map(map: &HashMap<String, String>) {
    let path = match registry_path() {
        Some(p) => p,
        None => return,
    };
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    if let Ok(text) = serde_json::to_string_pretty(map) {
        let _ = std::fs::write(&path, text);
    }
}

/// Record the backend handle for an app session id (idempotent).
pub fn save(session_id: &str, handle: &str) {
    let _g = guard().lock();
    let mut map = read_map();
    map.insert(session_id.to_string(), handle.to_string());
    write_map(&map);
}

/// Look up the persisted handle for an app session id.
pub fn load(session_id: &str) -> Option<String> {
    let _g = guard().lock();
    read_map().get(session_id).cloned()
}

/// Forget a session (called when it is intentionally killed).
pub fn remove(session_id: &str) {
    let _g = guard().lock();
    let mut map = read_map();
    map.remove(session_id);
    write_map(&map);
}

/// All known session_id -> handle mappings. Reconciliation (matching persisted
/// tabs against live backend sessions) will consume this.
#[allow(dead_code)]
pub fn all() -> HashMap<String, String> {
    let _g = guard().lock();
    read_map()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn save_load_remove_roundtrip() {
        // Redirect the registry to a temp file for the duration of the test.
        let mut file = std::env::temp_dir();
        file.push(format!("silo-session-test-{}.json", std::process::id()));
        std::env::set_var("SILO_SESSION_REGISTRY", &file);
        let _ = std::fs::remove_file(&file);

        assert_eq!(load("s1"), None);

        save("s1", "handle-1");
        save("s2", "handle-2");
        assert_eq!(load("s1").as_deref(), Some("handle-1"));
        assert_eq!(all().len(), 2);

        // Idempotent overwrite.
        save("s1", "handle-1b");
        assert_eq!(load("s1").as_deref(), Some("handle-1b"));

        remove("s1");
        assert_eq!(load("s1"), None);
        assert_eq!(load("s2").as_deref(), Some("handle-2"));

        let _ = std::fs::remove_file(&file);
        std::env::remove_var("SILO_SESSION_REGISTRY");
    }
}
