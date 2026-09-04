mod commands;
#[cfg(target_os = "macos")]
mod mac_keys;
mod webview_bridge;

// Session-environment carrier (RFC 0028) — used by both daemon entry points
// in `main.rs`, so exported on every platform.
pub use commands::cli::local_flag_response;
pub use commands::session_env::{apply_bin_path, take_session_env};

// The Control API's client half (RFC 0034) — dispatched from `main.rs` before
// Tauri init, alongside the local-flag path above.
pub use commands::control::client::{control_request, run as run_control_request};

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
        // `commands::identity` owns this mapping so the Control API's client
        // half (RFC 0034), which runs before Tauri init in a process with no
        // AppHandle, derives the same namespace from the same rule.
        debug_assert_eq!(
            context.config().identifier.as_str(),
            commands::identity::IDENTIFIER,
            "build.rs resolved a different identifier than the Tauri context"
        );
        std::env::set_var("SILO_PTY_NS", commands::identity::ns());
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

    // Refresh the `silo` shim Silo puts on PATH inside its own terminals
    // (RFC 0028). Rewritten every launch because it embeds an absolute path to
    // the app binary, which an update or a move invalidates. Must run after
    // SILO_DATA_DIR is exported, since the bin dir hangs off it. Best-effort:
    // failure costs the bundled command, never startup.
    commands::cli::ensure_managed_shim();

    // The TS-owned user-config root (~/.config/silo[-suffix], or the
    // SILO_CONFIG_DIR override — same resolution as user-config.ts). The
    // session-maintenance sweep reads workspace files from here to decide
    // which PTY sessions are still owned by a known workspace.
    #[cfg(unix)]
    if let Some(root) = commands::identity::config_root() {
        std::env::set_var("SILO_CONFIG_ROOT", root);
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
        .plugin(tauri_plugin_clipboard_manager::init())
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

            // The Control API listener (RFC 0034). Unlike automation above, this
            // is in **every** build — the `0600` socket inside a `0700` runtime
            // directory is what gates it, not a Cargo feature. Bound here rather
            // than on webview-ready so socket presence means "the process is
            // alive", which is the predicate `silo status` needs to be able to
            // report a wedged webview at all.
            commands::control::host::register(app.handle());

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

            // Durable attach trail: one line at UI process start so post-mortems
            // can correlate proto / pid with later ui_* / host_* events in
            // terminal.log (see terminal_diag_log + logTerminalAttachTrace).
            // `proto` is the pty-host unix-socket wire version; the Windows
            // ConPTY backend (session_windows) has no equivalent, so it logs
            // a fixed "conpty" label instead.
            {
                #[cfg(unix)]
                let proto = pty_host::proto::PROTO_VERSION.to_string();
                #[cfg(windows)]
                let proto = "conpty".to_string();
                commands::session_backend::log_event(
                    "app_boot",
                    &format!(
                        "pid={} proto={} identifier={}",
                        std::process::id(),
                        proto,
                        app.config().identifier
                    ),
                );
            }

            // Cleanup stale terminal buffers on startup
            std::thread::spawn(|| {
                let _ = commands::terminal_buffer::cleanup_stale_buffers();
            });

            // Periodic PTY-session maintenance: reaps daemons whose owning
            // workspace was deleted (membership-based, never time-based —
            // sessions in existing workspaces, open or closed, are never
            // touched no matter how long they sit idle).
            #[cfg(unix)]
            commands::session_maintenance::spawn_maintenance_sweep();

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
            commands::terminal::terminal_diag_log,
            commands::terminal::terminal_foreground_snapshot,
            commands::network::net_fetch,
            commands::network::net_fetch_bytes,
            commands::network::net_fetch_headers,
            commands::webview::webview_snapshot,
            commands::finder_drop::dnd_get_finder_paths,
            commands::window_chrome::window_set_caption_color,
            commands::system::system_info,
            commands::system::default_shell,
            commands::app_paths::app_config_dir_override,
        ])
        .run(context)
        .expect("error while running tauri application");
}
