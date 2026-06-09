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

fn should_skip(path: &str) -> bool {
    // Skip events from noisy / heavy directories. Keep this list short and
    // conservative — anything matched here will not surface to the frontend.
    const NEEDLES: &[&str] = &[
        "/node_modules/",
        "/.git/",
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
) -> Result<(), String> {
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
                let paths: Vec<String> = event
                    .paths
                    .iter()
                    .map(|p| p.to_string_lossy().to_string())
                    .filter(|p| !should_skip(p))
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
