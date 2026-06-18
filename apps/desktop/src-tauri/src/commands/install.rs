use std::io::Cursor;

/// Download a `.tgz` tarball from `url` and extract its contents into `dest_dir`.
///
/// Used by the extension manager to stage npm and URL installs: the TypeScript
/// side calls this after resolving the tarball URL, then walks `dest_dir` to
/// find the extracted `package.json` manifest.
///
/// npm tarballs prefix every path with `package/`, so extraction yields
/// `dest_dir/package/<files>`. GitHub release tarballs vary by publisher.
/// The TypeScript install pipeline probes both roots.
#[tauri::command]
pub async fn download_extract(url: String, dest_dir: String) -> Result<(), String> {
    let response = reqwest::get(&url)
        .await
        .map_err(|e| format!("download failed: {e}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "download failed: HTTP {}",
            response.status().as_u16()
        ));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("reading response body failed: {e}"))?;

    let cursor = Cursor::new(bytes);
    let gz = flate2::read::GzDecoder::new(cursor);
    let mut archive = tar::Archive::new(gz);
    archive
        .unpack(&dest_dir)
        .map_err(|e| format!("extraction failed: {e}"))
}
