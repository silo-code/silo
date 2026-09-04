fn main() {
    tauri_build::build();
    emit_identifier();

    // macOS's Local Network permission prompt needs an Info.plist the OS can
    // find. `tauri build` writes one into the bundled .app's Contents/, but
    // `cargo build` / `tauri dev` run the bare `target/debug/silo` binary
    // with no bundle at all, so macOS can't show the prompt and just denies
    // access silently (see NSLocalNetworkUsageDescription's comment in
    // Info.plist). Embedding the same plist into the binary's
    // __TEXT,__info_plist section is the standard workaround bare CLI tools
    // use to get TCC prompts without a full bundle. Debug-only: never
    // touches what `tauri build` ships.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos")
        && std::env::var("PROFILE").as_deref() == Ok("debug")
    {
        let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
        let plist_path = std::path::Path::new(&manifest_dir).join("Info.plist");
        println!(
            "cargo:rustc-link-arg=-Wl,-sectcreate,__TEXT,__info_plist,{}",
            plist_path.display()
        );
    }
}

/// Export the app's **bundle identifier** as the compile-time `SILO_IDENTIFIER`
/// env var (read by `commands::identity`).
///
/// The app itself reads its identifier from the Tauri context, but the Control
/// API's client half (RFC 0034) runs in `main.rs` *before* Tauri init and still
/// has to derive the same socket namespace and config root — so the value has to
/// be available without an `AppHandle`.
///
/// Resolution mirrors `tauri_build`/`tauri_codegen` exactly: the on-disk
/// `tauri.conf.json`, then the inline JSON in `TAURI_CONFIG`, which is how the
/// Tauri CLI passes `--config src-tauri/tauri.dev.conf.json` (and
/// `tauri.nightly.conf.json`) through to the compiler. Getting that merge wrong
/// would silently give "Silo Dev" the production namespace, so the identifier is
/// never defaulted: a miss is a hard build failure.
fn emit_identifier() {
    println!("cargo:rerun-if-changed=tauri.conf.json");
    println!("cargo:rerun-if-env-changed=TAURI_CONFIG");

    let base = std::fs::read_to_string("tauri.conf.json")
        .expect("read tauri.conf.json for SILO_IDENTIFIER");
    let base: serde_json::Value =
        serde_json::from_str(&base).expect("parse tauri.conf.json for SILO_IDENTIFIER");

    // The `--config` override wins when it names an identifier, exactly as
    // json_patch::merge would for this one scalar key.
    let identifier = std::env::var("TAURI_CONFIG")
        .ok()
        .and_then(|env| serde_json::from_str::<serde_json::Value>(&env).ok())
        .and_then(|patch| patch.get("identifier")?.as_str().map(str::to_string))
        .or_else(|| base.get("identifier")?.as_str().map(str::to_string))
        .expect("tauri config has no `identifier` — SILO_IDENTIFIER cannot be resolved");

    println!("cargo:rustc-env=SILO_IDENTIFIER={identifier}");
}
