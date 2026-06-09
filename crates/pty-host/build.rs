fn main() {
    // glibc keeps forkpty/openpty in libutil; macOS has them in libSystem.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("linux") {
        println!("cargo:rustc-link-lib=util");
    }
}
