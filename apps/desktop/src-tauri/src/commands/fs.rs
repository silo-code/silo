use std::path::Path;
use std::time::UNIX_EPOCH;

use serde::Serialize;
use tauri::ipc::Response;

/// Normalize path separators to forward slashes for the JS frontend.
/// On Unix/macOS this is a no-op; on Windows it converts `\` → `/` so the
/// entire TypeScript layer can assume POSIX-style paths regardless of platform.
pub(super) fn normalize_path(path: &Path) -> String {
    let s = path.to_string_lossy();
    if cfg!(windows) {
        s.replace('\\', "/")
    } else {
        s.into_owned()
    }
}

#[derive(Serialize)]
pub struct FileMeta {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified_ms: i64,
}

#[tauri::command]
pub fn fs_read_text(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("{}: {}", path, e))
}

#[tauri::command]
pub fn fs_read_bytes(path: String) -> Result<Response, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("{}: {}", path, e))?;
    Ok(Response::new(bytes))
}

#[tauri::command]
pub fn fs_write_text(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    std::fs::write(&path, content).map_err(|e| format!("{}: {}", path, e))
}

#[tauri::command]
pub fn fs_path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

#[tauri::command]
pub fn fs_read_dir(path: String) -> Result<Vec<FileMeta>, String> {
    let read = std::fs::read_dir(&path).map_err(|e| format!("{}: {}", path, e))?;
    let mut out = Vec::new();
    for entry in read.flatten() {
        let path_buf = entry.path();
        let metadata = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        let modified_ms = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);
        let name = entry.file_name().to_string_lossy().to_string();
        out.push(FileMeta {
            name,
            path: normalize_path(&path_buf),
            is_dir: metadata.is_dir(),
            size: metadata.len(),
            modified_ms,
        });
    }
    out.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });
    Ok(out)
}

#[tauri::command]
pub fn fs_create_dir(path: String) -> Result<(), String> {
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn fs_rename(old_path: String, new_path: String) -> Result<(), String> {
    std::fs::rename(&old_path, &new_path).map_err(|e| e.to_string())
}

/// Recursively copy a directory tree. Used to install an extension by copying
/// its folder into ~/.config/silo/extensions/<id>/. Copies bytes verbatim (no
/// fs_write_bytes exists, and fs_write_text would corrupt binary assets).
///
/// Skips `node_modules` and `.git`: an extension's runtime deps are bundled (or
/// externalized to the host), so a dev folder's node_modules is never wanted in
/// an install, and copying it would bloat the install by tens of MB.
#[tauri::command]
pub fn fs_copy_dir(src: String, dst: String) -> Result<(), String> {
    fn copy_recursive(src: &Path, dst: &Path) -> std::io::Result<()> {
        std::fs::create_dir_all(dst)?;
        for entry in std::fs::read_dir(src)? {
            let entry = entry?;
            let name = entry.file_name();
            if name == "node_modules" || name == ".git" {
                continue;
            }
            let from = entry.path();
            let to = dst.join(&name);
            if entry.file_type()?.is_dir() {
                copy_recursive(&from, &to)?;
            } else {
                std::fs::copy(&from, &to)?;
            }
        }
        Ok(())
    }
    copy_recursive(Path::new(&src), Path::new(&dst))
        .map_err(|e| format!("{} -> {}: {}", src, dst, e))
}

#[tauri::command]
pub fn fs_delete(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.is_dir() {
        std::fs::remove_dir_all(&path).map_err(|e| e.to_string())
    } else {
        std::fs::remove_file(&path).map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn fs_reveal(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-R")
            .arg(&path)
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
    #[cfg(target_os = "linux")]
    {
        let dir = Path::new(&path)
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or(path.clone());
        std::process::Command::new("xdg-open")
            .arg(&dir)
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(format!("/select,{}", path))
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
}
