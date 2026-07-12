mod commands;
#[cfg(target_os = "macos")]
mod mac_keys;
mod webview_bridge;

#[cfg(windows)]
pub use commands::session_windows::run_daemon as run_win_session_host;

use tauri::{Emitter, Manager};

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
        let id = context.config().identifier.as_str();
        let ns: &str = if id == "com.silo.desktop" {
            "prod"
        } else {
            id.strip_prefix("com.silo.desktop.").unwrap_or("other")
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

    let builder = tauri::Builder::default();

    // Single-instance must be the FIRST plugin (per its docs). A second `silo
    // <path>` launch is forwarded here instead of opening a new window: we focus
    // the running window and emit `cli:open` for the webview to act on. Desktop
    // only — there is no second-launch model on mobile. The instance lock keys
    // off the bundle identifier, so "Silo Dev" and "Silo" stay independent.
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
        commands::cli::focus_main_window(app);
        if let Some(req) = commands::cli::resolve_cli_request(&argv, &cwd) {
            let _ = app.emit("cli:open", req);
        }
    }));

    let builder = builder
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(webview_bridge::init());

    // Auto-updater + relaunch — desktop only.
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build());

    builder
        .manage(commands::terminal::TerminalState::new())
        .manage(commands::process::ProcessStatsState::new())
        .manage(commands::cli::PendingLaunchArg::default())
        .setup(|app| {
            commands::watch::register(app.handle());

            // Cold start: stash the `silo <path>` arg from *this* process's argv
            // so the webview can drain it once it's listening (warm launches go
            // through the single-instance `cli:open` emit instead).
            {
                let argv: Vec<String> = std::env::args().collect();
                let cwd = std::env::current_dir()
                    .map(|p| p.to_string_lossy().into_owned())
                    .unwrap_or_default();
                if let Some(req) = commands::cli::resolve_cli_request(&argv, &cwd) {
                    if let Ok(mut guard) =
                        app.state::<commands::cli::PendingLaunchArg>().0.lock()
                    {
                        *guard = Some(req);
                    }
                }
            }

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

            // macOS: swizzle WKWebView dragging methods so that Finder
            // file-drop paths are captured via NSDraggingInfo (the
            // authoritative pasteboard) before WebKit processes the drag.
            // Called here — after windows are created — so WryWebView is
            // already registered as an ObjC class and can be targeted.
            #[cfg(target_os = "macos")]
            commands::finder_drop::install_drag_swizzle();

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
            commands::cli::cli_consume_launch_args,
            commands::cli::cli_install_shim,
            commands::devtools::open_devtools,
            commands::fs::fs_read_text,
            commands::fs::fs_read_bytes,
            commands::fs::fs_write_text,
            commands::fs::fs_write_bytes,
            commands::fs::fs_path_exists,
            commands::fs::fs_stat,
            commands::fs::fs_read_dir,
            commands::fs::fs_rename,
            commands::fs::fs_delete,
            commands::fs::fs_reveal,
            commands::fs::fs_create_dir,
            commands::fs::fs_copy_dir,
            commands::fs::fs_copy,
            commands::install::download_extract,
            commands::watch::start_watch,
            commands::watch::stop_watch,
            commands::process::process_exec,
            commands::process::process_exec_kill,
            commands::process::process_kill_group,
            commands::process::process_get_stats,
            commands::search::search_files,
            commands::terminal::terminal_create,
            commands::terminal::terminal_write,
            commands::terminal::terminal_resize,
            commands::terminal::terminal_kill,
            commands::terminal::terminal_attach,
            commands::terminal::terminal_start_stream,
            commands::terminal::terminal_get_buffer,
            commands::terminal::terminal_save_buffer,
            commands::terminal::terminal_foreground_snapshot,
            commands::network::net_fetch,
            commands::network::net_fetch_bytes,
            commands::network::net_fetch_headers,
            commands::webview::webview_snapshot,
            commands::finder_drop::dnd_get_finder_paths,
            commands::window_chrome::window_set_caption_color,
            commands::system::system_info,
            commands::app_paths::app_config_dir_override,
        ])
        .run(context)
        .expect("error while running tauri application");
}
