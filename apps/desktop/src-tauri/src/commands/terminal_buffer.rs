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

    let seven_days_secs = 7 * 24 * 60 * 60;

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
                        if elapsed.as_secs() > seven_days_secs {
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
}
