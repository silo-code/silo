use serde::Serialize;

#[derive(Serialize)]
pub struct SystemInfoResponse {
    pub os: &'static str,
    pub arch: &'static str,
}

/// Returns compile-time OS and CPU architecture constants. These are baked into
/// the binary — no runtime lookup needed, no extra dependencies.
#[tauri::command]
pub fn system_info() -> SystemInfoResponse {
    SystemInfoResponse {
        os: std::env::consts::OS,
        arch: std::env::consts::ARCH,
    }
}
