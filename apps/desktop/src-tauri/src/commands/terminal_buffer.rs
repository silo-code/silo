use std::fs;
use std::path::PathBuf;

// Per-session terminal buffer persistence.
//
// We store the xterm.js SerializeAddon output (a self-contained, balanced
// escape-sequence string that recreates the screen + scrollback). This mirrors
// VS Code's "process revive": the live terminal emulator serializes its own
// buffer, we persist that string to disk, and on reattach we write it back into
// a fresh same-size terminal. The backend is just a keyed blob store — it does
// not parse or interpret the data.

fn get_buffer_dir() -> Result<PathBuf, String> {
    let root = super::app_paths::data_dir().ok_or("No data directory")?;
    let dir = root.join("terminal-buffers");
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create buffer dir: {}", e))?;
    Ok(dir)
}

pub fn save_buffer(session_id: &str, data: &str) -> Result<(), String> {
    let dir = get_buffer_dir()?;
    let path = dir.join(format!("{}.term", session_id));
    fs::write(&path, data).map_err(|e| format!("Failed to persist buffer: {}", e))?;
    Ok(())
}

pub fn load_buffer(session_id: &str) -> Result<String, String> {
    let dir = get_buffer_dir()?;
    let path = dir.join(format!("{}.term", session_id));
    if !path.exists() {
        return Ok(String::new());
    }
    fs::read_to_string(&path).map_err(|e| format!("Failed to read buffer: {}", e))
}

pub fn cleanup_stale_buffers() -> Result<(), String> {
    let dir = match get_buffer_dir() {
        Ok(d) => d,
        Err(_) => return Ok(()), // Dir doesn't exist yet, nothing to clean
    };

    // 90 days, not a week: these buffers are the only way terminal tabs
    // restore their scrollback after a reboot (a live daemon replays its own
    // ring, but a reboot kills every daemon). A workspace parked for a month
    // must come back with its scrollback intact — that persistence is the
    // product promise, so retention here has to comfortably outlast any
    // realistic absence.
    let max_age_secs = 90 * 24 * 60 * 60;

    for entry in fs::read_dir(&dir).map_err(|e| format!("Failed to read dir: {}", e))? {
        let entry = entry.map_err(|e| format!("Dir entry error: {}", e))?;
        let path = entry.path();

        let ext = path.extension().and_then(|s| s.to_str());
        // Clean both the current ".term" blobs and any legacy ".bin" ring-buffer
        // files left over from the previous raw-capture implementation.
        if ext == Some("term") || ext == Some("bin") {
            if let Ok(metadata) = fs::metadata(&path) {
                if let Ok(modified) = metadata.modified() {
                    if let Ok(elapsed) = modified.elapsed() {
                        if elapsed.as_secs() > max_age_secs {
                            let _ = fs::remove_file(&path);
                        }
                    }
                }
            }
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn save_load_buffer_under_data_dir() {
        let _g = super::super::app_paths::env_lock();
        // Redirect the data root to a temp dir; buffers must land under it and
        // round-trip, and a missing buffer reads back as empty (not an error).
        let mut root = std::env::temp_dir();
        root.push(format!("silo-buffer-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        std::env::set_var("SILO_DATA_DIR", &root);

        assert_eq!(load_buffer("missing").as_deref(), Ok(""));

        save_buffer("s1", "scrollback\x1b[0m").unwrap();
        assert!(root.join("terminal-buffers/s1.term").exists());
        assert_eq!(load_buffer("s1").as_deref(), Ok("scrollback\x1b[0m"));

        std::env::remove_var("SILO_DATA_DIR");
        let _ = fs::remove_dir_all(&root);
    }

    /// Backdate `path`'s mtime by `ago`.
    ///
    /// `File::set_modified` rather than `libc::utimes`: `libc` is a
    /// `cfg(unix)` dependency, so the FFI version didn't compile on Windows
    /// at all — and this needs no `unsafe`, no extra dependency, and no
    /// platform branch.
    fn backdate_mtime(path: &std::path::Path, ago: std::time::Duration) {
        let target = std::time::SystemTime::now() - ago;
        fs::OpenOptions::new()
            .write(true)
            .open(path)
            .and_then(|f| f.set_modified(target))
            .unwrap_or_else(|e| panic!("backdate {path:?}: {e}"));
    }

    #[test]
    fn cleanup_retains_90_days_but_purges_older() {
        let _g = super::super::app_paths::env_lock();
        let mut root = std::env::temp_dir();
        root.push(format!("silo-buffer-cleanup-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        std::env::set_var("SILO_DATA_DIR", &root);

        save_buffer("fresh", "still watching this one").unwrap();
        save_buffer("month-old", "a month\x1b[0m of\x1b[0m idle").unwrap();
        save_buffer("ancient", "predates the fix").unwrap();
        save_buffer("ancient-legacy", "old raw-capture format").unwrap();

        let dir = root.join("terminal-buffers");
        // Within the 90-day retention (the exact scenario this change exists
        // for: a workspace parked for a month, not touched).
        backdate_mtime(
            &dir.join("month-old.term"),
            std::time::Duration::from_secs(30 * 24 * 60 * 60),
        );
        // Past the new 90-day threshold — must still be purged, not kept
        // forever just because the threshold grew.
        backdate_mtime(
            &dir.join("ancient.term"),
            std::time::Duration::from_secs(91 * 24 * 60 * 60),
        );
        let legacy_bin = dir.join("ancient-legacy.term");
        let legacy_bin = {
            let renamed = dir.join("ancient-legacy.bin");
            fs::rename(&legacy_bin, &renamed).unwrap();
            renamed
        };
        backdate_mtime(&legacy_bin, std::time::Duration::from_secs(91 * 24 * 60 * 60));

        cleanup_stale_buffers().unwrap();

        assert!(dir.join("fresh.term").exists(), "fresh buffer must survive");
        assert!(
            dir.join("month-old.term").exists(),
            "a month-old buffer must survive the new 90-day retention"
        );
        assert!(
            !dir.join("ancient.term").exists(),
            "a 91-day-old buffer must still be purged"
        );
        assert!(
            !legacy_bin.exists(),
            "legacy .bin buffers are purged by the same threshold"
        );

        std::env::remove_var("SILO_DATA_DIR");
        let _ = fs::remove_dir_all(&root);
    }
}
