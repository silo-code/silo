fn main() {
    tauri_build::build();

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
