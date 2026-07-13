use sha2::{Digest, Sha256};
use std::io::Cursor;

/// Download a `.tgz` tarball from `url` and extract its contents into `dest_dir`.
///
/// Used by the extension manager to stage npm, URL, and registry installs: the
/// TypeScript side calls this after resolving the tarball URL, then walks
/// `dest_dir` to find the extracted `package.json` manifest.
///
/// When `expected_sha256` is set (registry installs — the index pins a digest
/// at ingest, RFC 0014), the downloaded bytes are hashed and a mismatch fails
/// the install *before* anything is extracted, so a tampered or swapped asset
/// never reaches disk.
///
/// npm tarballs prefix every path with `package/`, so extraction yields
/// `dest_dir/package/<files>`. GitHub release tarballs vary by publisher.
/// The TypeScript install pipeline probes both roots.
#[tauri::command]
pub async fn download_extract(
    url: String,
    dest_dir: String,
    expected_sha256: Option<String>,
) -> Result<(), String> {
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

    if let Some(expected) = expected_sha256 {
        let actual = hex_sha256(&bytes);
        if !actual.eq_ignore_ascii_case(expected.trim()) {
            return Err(format!(
                "integrity check failed: tarball sha256 {actual} does not match the registry's pinned digest {expected} — refusing to install"
            ));
        }
    }

    let cursor = Cursor::new(bytes);
    let gz = flate2::read::GzDecoder::new(cursor);
    let mut archive = tar::Archive::new(gz);
    archive
        .unpack(&dest_dir)
        .map_err(|e| format!("extraction failed: {e}"))
}

fn hex_sha256(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hex_sha256_matches_known_vector() {
        // `echo -n silo | shasum -a 256`
        assert_eq!(
            hex_sha256(b"silo"),
            "30ec2f855071fb404f5ced96a5b0743d61a6adeeaacd7c6445240c5d52e18b57"
        );
    }
}
