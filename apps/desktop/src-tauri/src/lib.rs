mod commands;
#[cfg(target_os = "macos")]
mod mac_keys;

#[cfg(target_os = "macos")]
use tauri::Emitter;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let context = tauri::generate_context!();

    // Namespace PTY-host sockets by *app identity* (the bundle identifier), so
    // independent Silo instances never share session sockets regardless of build
    // profile: "Silo Dev" (com.silo.desktop.dev) → "dev", production "Silo"
    // (com.silo.desktop) → "prod". Set before anything can spawn a terminal; the
    // self-forked daemon inherits it from this process's env.
    #[cfg(unix)]
    {
        let ns = if context.config().identifier.ends_with(".dev") {
            "dev"
        } else {
            "prod"
        };
        std::env::set_var("SILO_PTY_NS", ns);
    }

    // Root for Silo's per-user runtime state (terminal session registry,
    // scrollback buffers, backend logs), keyed by *app identity* under the OS
    // app-data dir so dev and prod never share state — same isolation principle
    // as SILO_PTY_NS above. Exported via env so the self-forked PTY-host daemon
    // (`main.rs`), which has no Tauri AppHandle, inherits the same root. Read
    // through `commands::app_paths::data_dir`.
    if let Some(data_dir) = dirs::data_dir() {
        std::env::set_var(
            "SILO_DATA_DIR",
            data_dir.join(&context.config().identifier),
        );
    }

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_window_state::Builder::default().build());

    // Auto-updater + relaunch — desktop only.
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build());

    builder
        .manage(commands::terminal::TerminalState::new())
        .setup(|app| {
            commands::watch::register(app.handle());

            // Dev-only automation RPC (Cargo feature `automation` + the
            // SILO_AUTOMATION env var both required). Excluded from release.
            #[cfg(feature = "automation")]
            commands::automation::register(app.handle());

            // macOS: install a Shift-state monitor at the AppKit layer.
            // WebKit eats every JS key event during an HTML5 drag, but
            // NSEvent's local monitor sits below that and still sees the
            // modifier transitions. We forward each Shift on/off into the
            // page via the standard event channel.
            #[cfg(target_os = "macos")]
            {
                let emit_handle = app.handle().clone();
                mac_keys::install_shift_monitor(move |shift_held| {
                    let _ = emit_handle.emit("app:shift-state", shift_held);
                });
            }

            // Cleanup stale terminal buffers on startup
            std::thread::spawn(|| {
                let _ = commands::terminal_buffer::cleanup_stale_buffers();
            });

            // The application menu is constructed in JS (src/extensions/menu-items.ts)
            // and installed via setAsAppMenu() after extensions activate. That lets
            // built-in and third-party extensions contribute menu items through the
            // same registry.

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::devtools::open_devtools,
            commands::fs::fs_read_text,
            commands::fs::fs_read_bytes,
            commands::fs::fs_write_text,
            commands::fs::fs_path_exists,
            commands::fs::fs_read_dir,
            commands::fs::fs_rename,
            commands::fs::fs_delete,
            commands::fs::fs_reveal,
            commands::fs::fs_create_dir,
            commands::fs::fs_copy_dir,
            commands::watch::start_watch,
            commands::watch::stop_watch,
            commands::process::process_exec,
            commands::terminal::terminal_create,
            commands::terminal::terminal_write,
            commands::terminal::terminal_resize,
            commands::terminal::terminal_kill,
            commands::terminal::terminal_attach,
            commands::terminal::terminal_get_buffer,
            commands::terminal::terminal_save_buffer,
        ])
        .run(context)
        .expect("error while running tauri application");
}
