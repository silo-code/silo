//! The **Disk-read** half of `silo ws list` (RFC 0034 R10).
//!
//! ADR 0047 designates workspace enumeration as Disk-read: it must work with no
//! app running, so it is answered in the short-lived client process from the
//! files the webview persists — `<config-root>/workspaces/<id>.json`, each
//! holding `{ "workspace": { … } }` (see `state/persistence.ts`). The Control
//! channel only *annotates* that answer; it never supplies it.
//!
//! Two rules the rest of the module exists to keep:
//!
//! - **A bad file is skipped, never fatal.** The frontend writes these on a
//!   debounce, so a half-written or truncated file is a normal thing to catch
//!   mid-flush. Failing the whole listing over one would make `silo ws list`
//!   intermittently useless. (The session-maintenance sweep takes the opposite
//!   choice deliberately — for it, "couldn't determine" must never read as "not
//!   referenced", because the consequence there is killing a live session.)
//! - **The warning goes to stderr.** `--json` stdout must stay parseable by a
//!   single read (R1), so no diagnostic ever touches stdout.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::commands::identity;

/// One workspace as it exists on disk. Every field here is read from the
/// workspace file; live state arrives separately, from the `ws.live` op.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DiskWorkspace {
    /// The workspace id, in the form `--ws` accepts (ADR 0047 rule 5), so a
    /// follow-up call is unambiguous.
    pub id: String,
    /// The display name.
    pub name: String,
    /// The primary folder.
    pub folder: String,
}

/// The `workspaces/` directory under this build's config root.
pub fn workspaces_dir() -> Option<PathBuf> {
    identity::config_root().map(|root| root.join("workspaces"))
}

/// Read one workspace file's `{ "workspace": … }` payload into a
/// [`DiskWorkspace`]. `None` for anything that is not a complete, usable record
/// — unparseable JSON, a missing `workspace` object, or a missing `id`/`folder`.
///
/// A missing `name` is *not* a reason to skip: it is cosmetic, and the id and
/// folder are what a caller acts on. It falls back to the folder's basename,
/// which is what the UI shows for an unnamed workspace anyway.
fn parse_workspace(json: &str) -> Option<DiskWorkspace> {
    let v: serde_json::Value = serde_json::from_str(json).ok()?;
    let ws = v.get("workspace")?;
    let id = ws.get("id")?.as_str()?.to_string();
    let folder = ws.get("folder")?.as_str()?.to_string();
    if id.is_empty() || folder.is_empty() {
        return None;
    }
    let name = ws
        .get("name")
        .and_then(|n| n.as_str())
        .filter(|n| !n.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| {
            Path::new(&folder)
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_else(|| folder.clone())
        });
    Some(DiskWorkspace { id, name, folder })
}

/// Every workspace under `dir`, sorted by name then id so the listing is stable
/// across calls (directory order is not).
///
/// Unusable files are skipped and named on `warnings`; a missing directory is an
/// empty listing, not an error — a fresh install has never persisted one.
pub fn read_workspaces_in(dir: &Path) -> (Vec<DiskWorkspace>, Vec<String>) {
    let mut out = Vec::new();
    let mut warnings = Vec::new();

    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return (out, warnings),
        Err(e) => {
            warnings.push(format!("could not read {}: {e}", dir.display()));
            return (out, warnings);
        }
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("json") {
            continue;
        }
        match std::fs::read_to_string(&path) {
            Ok(text) => match parse_workspace(&text) {
                Some(ws) => out.push(ws),
                None => warnings.push(format!("skipped unreadable {}", path.display())),
            },
            Err(e) => warnings.push(format!("skipped {}: {e}", path.display())),
        }
    }

    out.sort_by(|a, b| a.name.cmp(&b.name).then_with(|| a.id.cmp(&b.id)));
    (out, warnings)
}

/// Every workspace under this build's config root.
pub fn read_workspaces() -> (Vec<DiskWorkspace>, Vec<String>) {
    match workspaces_dir() {
        Some(dir) => read_workspaces_in(&dir),
        None => (
            Vec::new(),
            vec!["could not resolve the Silo config root".to_string()],
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("silo-ws-list-{}-{tag}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write(dir: &Path, name: &str, body: &str) {
        std::fs::write(dir.join(name), body).unwrap();
    }

    #[test]
    fn reads_id_folder_and_name() {
        let ws = parse_workspace(
            r#"{"workspace":{"id":"ws_1","name":"Silo","folder":"/src/silo","terminals":[]}}"#,
        )
        .expect("a complete record parses");
        assert_eq!(
            ws,
            DiskWorkspace {
                id: "ws_1".into(),
                name: "Silo".into(),
                folder: "/src/silo".into(),
            }
        );
    }

    #[test]
    fn a_missing_name_falls_back_to_the_folder_basename() {
        let ws = parse_workspace(r#"{"workspace":{"id":"ws_1","folder":"/src/silo"}}"#).unwrap();
        assert_eq!(ws.name, "silo");
        // An empty name is treated as absent, not rendered as a blank row.
        let ws = parse_workspace(r#"{"workspace":{"id":"ws_1","name":"","folder":"/a/b"}}"#)
            .unwrap();
        assert_eq!(ws.name, "b");
    }

    #[test]
    fn an_unusable_record_is_none() {
        // Half-written (the debounced-flush case), and missing load-bearing
        // fields. Each is a skip, and the caller turns it into a warning.
        assert!(parse_workspace(r#"{"workspace":{"id":"ws_1","fol"#).is_none());
        assert!(parse_workspace("").is_none());
        assert!(parse_workspace("{}").is_none());
        assert!(parse_workspace(r#"{"workspace":{"folder":"/a"}}"#).is_none());
        assert!(parse_workspace(r#"{"workspace":{"id":"ws_1"}}"#).is_none());
        assert!(parse_workspace(r#"{"workspace":{"id":"","folder":"/a"}}"#).is_none());
        assert!(parse_workspace(r#"{"workspace":{"id":"ws_1","folder":""}}"#).is_none());
    }

    #[test]
    fn lists_every_workspace_sorted_and_stable() {
        let dir = fixture_dir("sorted");
        write(
            &dir,
            "ws_b.json",
            r#"{"workspace":{"id":"ws_b","name":"Zeta","folder":"/z"}}"#,
        );
        write(
            &dir,
            "ws_a.json",
            r#"{"workspace":{"id":"ws_a","name":"Alpha","folder":"/a"}}"#,
        );
        // Non-JSON siblings (the index blob lives beside these) are ignored.
        write(&dir, "notes.txt", "not a workspace");

        let (list, warnings) = read_workspaces_in(&dir);
        assert!(warnings.is_empty(), "{warnings:?}");
        assert_eq!(
            list.iter().map(|w| w.id.as_str()).collect::<Vec<_>>(),
            vec!["ws_a", "ws_b"]
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_malformed_file_is_skipped_with_a_warning_not_a_failure() {
        let dir = fixture_dir("malformed");
        write(
            &dir,
            "ws_ok.json",
            r#"{"workspace":{"id":"ws_ok","name":"Good","folder":"/g"}}"#,
        );
        // A 0-byte file — exactly the case that disabled the maintenance sweep
        // in the wild, and the reason this listing must not be fail-safe.
        write(&dir, "ws_empty.json", "");
        write(&dir, "ws_partial.json", r#"{"workspace":{"id":"ws_p"#);

        let (list, warnings) = read_workspaces_in(&dir);
        assert_eq!(list.len(), 1, "the good workspace still lists: {list:?}");
        assert_eq!(list[0].id, "ws_ok");
        assert_eq!(warnings.len(), 2, "both bad files warn: {warnings:?}");
        assert!(warnings.iter().all(|w| w.contains("ws_empty") || w.contains("ws_partial")));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_missing_directory_is_an_empty_listing_not_an_error() {
        // A fresh install has never persisted a workspace; `silo ws list` must
        // still exit 0 with nothing rather than reporting a failure.
        let dir = fixture_dir("missing").join("never-created");
        let (list, warnings) = read_workspaces_in(&dir);
        assert!(list.is_empty());
        assert!(warnings.is_empty(), "{warnings:?}");
    }

    #[test]
    fn workspaces_dir_hangs_off_the_config_root() {
        let _g = crate::commands::app_paths::env_lock();
        let prev = std::env::var("SILO_CONFIG_DIR").ok();

        std::env::set_var("SILO_CONFIG_DIR", "/tmp/silo-cfg");
        assert_eq!(
            workspaces_dir(),
            Some(PathBuf::from("/tmp/silo-cfg/workspaces"))
        );

        // No override → the identity's own root, which is what an ordinary
        // `silo ws list` from a plain shell resolves.
        std::env::remove_var("SILO_CONFIG_DIR");
        let resolved = workspaces_dir().expect("a config root on supported platforms");
        assert!(resolved.ends_with("workspaces"), "{resolved:?}");
        assert!(
            resolved
                .parent()
                .and_then(|p| p.file_name())
                .and_then(|s| s.to_str())
                .is_some_and(|name| name.starts_with("silo")),
            "{resolved:?}"
        );

        if let Some(v) = prev {
            std::env::set_var("SILO_CONFIG_DIR", v);
        }
    }
}
