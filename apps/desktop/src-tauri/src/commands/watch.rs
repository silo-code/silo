use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

use notify::{recommended_watcher, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime, State};

#[derive(Default)]
pub struct WatcherRegistry {
    inner: Mutex<HashMap<String, RecommendedWatcher>>,
}

#[derive(Serialize, Clone)]
pub struct FileChangeEvent {
    pub watch_id: String,
    pub paths: Vec<String>,
    pub kind: String,
}

/// Whether an event path survives to the frontend. The noise filter is a
/// project-tree concern only — with `filter_noise` off every path is kept.
fn keeps_path(filter_noise: bool, path: &str) -> bool {
    !filter_noise || !should_skip(path)
}

fn should_skip(path: &str) -> bool {
    // Skip events from noisy / heavy directories. Keep this list short and
    // conservative — anything matched here will not surface to the frontend.
    // Paths are already forward-slash–normalized at this point (see below), so
    // the separators in these needles always match on every platform.
    //
    // This list is written for **project trees**. It is bypassed entirely when
    // `start_watch` is called with `filter_noise: false` — the host does that
    // for extension-storage directories (RFC 0032), whose subfolder names are
    // the extension's own business: one named `cache/` must not get a watcher
    // that silently never fires.
    const NEEDLES: &[&str] = &[
        "/node_modules/",
        "/target/",
        "/dist/",
        "/build/",
        "/.next/",
        "/.cache/",
        "/.DS_Store",
    ];
    NEEDLES.iter().any(|n| path.contains(n))
}

#[tauri::command]
pub fn start_watch<R: Runtime>(
    app: AppHandle<R>,
    registry: State<'_, WatcherRegistry>,
    watch_id: String,
    path: String,
    // Apply the project-tree noise filter (`should_skip`). Optional so an older
    // caller keeps today's behaviour; the host passes `false` only for paths
    // inside its extension-storage root.
    filter_noise: Option<bool>,
) -> Result<(), String> {
    let filter_noise = filter_noise.unwrap_or(true);
    let mut guard = registry.inner.lock().map_err(|e| e.to_string())?;
    if let Some(existing) = guard.remove(&watch_id) {
        drop(existing);
    }

    let emit_id = watch_id.clone();
    let emit_app = app.clone();
    let mut watcher: RecommendedWatcher = recommended_watcher(move |res: notify::Result<Event>| {
        match res {
            Ok(event) => {
                if !matches!(
                    event.kind,
                    EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)
                ) {
                    return;
                }
                // Normalize to forward slashes before filtering and emitting so
                // `should_skip`'s NEEDLES and the TypeScript layer both see `/`
                // on every platform (Windows uses `\` natively).
                let paths: Vec<String> = event
                    .paths
                    .iter()
                    .map(|p| super::fs::normalize_path(p))
                    .filter(|p| keeps_path(filter_noise, p))
                    .collect();
                if paths.is_empty() {
                    return;
                }
                let _ = emit_app.emit(
                    "file:changed",
                    FileChangeEvent {
                        watch_id: emit_id.clone(),
                        paths,
                        kind: format!("{:?}", event.kind),
                    },
                );
            }
            Err(err) => {
                eprintln!("watch error: {:?}", err);
            }
        }
    })
    .map_err(|e| e.to_string())?;

    let path_buf = PathBuf::from(&path);
    watcher
        .watch(&path_buf, RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    guard.insert(watch_id, watcher);
    Ok(())
}

#[tauri::command]
pub fn stop_watch(registry: State<'_, WatcherRegistry>, watch_id: String) -> Result<(), String> {
    let mut guard = registry.inner.lock().map_err(|e| e.to_string())?;
    if let Some(handle) = guard.remove(&watch_id) {
        drop(handle);
    }
    Ok(())
}

pub fn register<R: Runtime>(app: &AppHandle<R>) {
    app.manage(WatcherRegistry::default());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn filters_project_noise_when_enabled() {
        assert!(!keeps_path(true, "/work/app/node_modules/x/index.js"));
        assert!(!keeps_path(true, "/work/app/dist/bundle.js"));
        assert!(!keeps_path(true, "/work/app/.cache/blob"));
        assert!(!keeps_path(true, "/work/app/.DS_Store"));
        assert!(keeps_path(true, "/work/app/src/main.ts"));
    }

    #[test]
    fn keeps_everything_when_filtering_is_off() {
        // Extension-storage directories: the subfolder names are the
        // extension's own business, so none of the needles apply (RFC 0032).
        let storage = "/home/u/.config/silo/extension-storage/silo.tasks/global";
        assert!(keeps_path(false, &format!("{storage}/cache/tasks.jsonl")));
        assert!(keeps_path(false, &format!("{storage}/build/out.json")));
        assert!(keeps_path(false, &format!("{storage}/node_modules/x")));
        assert!(keeps_path(false, &format!("{storage}/tasks.jsonl")));
    }
}
