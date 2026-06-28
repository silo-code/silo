use dashmap::DashMap;
use parking_lot::Mutex;
use std::io::Read;
use std::sync::Arc;
use tauri::Emitter;

use super::session_backend::{log_event, ForegroundInfo, ForegroundSub};

/// Decode PTY bytes as UTF-8, returning the valid prefix as a String and any
/// incomplete trailing multi-byte sequence as leftover bytes to carry into the
/// next read. Genuinely invalid bytes (not just split across a read boundary)
/// are emitted as the U+FFFD replacement character so the stream still advances.
///
/// This avoids the artifact where a multi-byte glyph (e.g. `─` = E2 94 80) split
/// across two reads would be lossily decoded into replacement characters on each
/// side of the boundary.
pub fn decode_utf8_stream(bytes: &[u8]) -> (String, Vec<u8>) {
    match std::str::from_utf8(bytes) {
        Ok(s) => (s.to_string(), Vec::new()),
        Err(e) => {
            let valid_up_to = e.valid_up_to();
            // SAFETY: from_utf8 reported these bytes as valid UTF-8.
            let mut out =
                unsafe { std::str::from_utf8_unchecked(&bytes[..valid_up_to]) }.to_string();
            match e.error_len() {
                // None => an incomplete sequence at the very end; carry it over.
                None => (out, bytes[valid_up_to..].to_vec()),
                // Some(len) => genuinely invalid bytes mid-stream; replace + continue.
                Some(len) => {
                    out.push('\u{FFFD}');
                    let (rest, carry) = decode_utf8_stream(&bytes[valid_up_to + len..]);
                    out.push_str(&rest);
                    (out, carry)
                }
            }
        }
    }
}

/// Reader loop shared by terminal_create and terminal_attach. Pumps PTY output
/// to the frontend. Scrollback persistence is handled on the frontend via the
/// xterm.js SerializeAddon (see terminal_save_buffer) — the backend no longer
/// captures or interprets the byte stream.
pub fn run_reader_loop(
    reader: Arc<Mutex<Box<dyn Read + Send>>>,
    handle: String,
    app: tauri::AppHandle,
    session_id: String,
) {
    let mut buf = vec![0u8; 8192];
    // Holds an incomplete multi-byte UTF-8 sequence split across reads.
    let mut carry: Vec<u8> = Vec::new();
    loop {
        let mut r = reader.lock();
        match r.read(&mut buf) {
            Ok(n) if n > 0 => {
                let bytes = if carry.is_empty() {
                    &buf[..n]
                } else {
                    carry.extend_from_slice(&buf[..n]);
                    &carry[..]
                };
                let (data, leftover) = decode_utf8_stream(bytes);
                carry = leftover;
                if !data.is_empty() {
                    let _ = app.emit(&format!("terminal_output:{}", session_id), data);
                }
            }
            Ok(_) => {
                log_event(
                    "exit",
                    &format!("session={} handle={} reason=eof", session_id, handle),
                );
                let _ = app.emit(&format!("terminal_exit:{}", session_id), 0);
                break;
            }
            Err(e) => {
                log_event(
                    "exit",
                    &format!(
                        "session={} handle={} reason=read_error detail={}",
                        session_id, handle, e
                    ),
                );
                let _ = app.emit(&format!("terminal_exit:{}", session_id), 1);
                break;
            }
        }
    }
}

/// Forward a session's foreground-process updates (RFC 0010 N1) to the frontend
/// as `terminal_foreground:<sessionId>` events, until the stream ends. Also
/// updates `fg_cache` so callers can snapshot the last known state on demand
/// (via the `terminal_foreground_snapshot` command) without waiting for a change.
pub fn run_foreground_loop(
    mut sub: Box<dyn ForegroundSub>,
    app: tauri::AppHandle,
    session_id: String,
    fg_cache: Arc<DashMap<String, ForegroundInfo>>,
) {
    while let Some(fg) = sub.next() {
        fg_cache.insert(session_id.clone(), fg.clone());
        let _ = app.emit(&format!("terminal_foreground:{}", session_id), fg);
    }
    fg_cache.remove(&session_id);
}

#[cfg(test)]
mod tests {
    use super::decode_utf8_stream;

    // `─` (BOX DRAWINGS LIGHT HORIZONTAL) is E2 94 80 — the glyph that splattered
    // into replacement chars when split across reads.
    const DASH: [u8; 3] = [0xE2, 0x94, 0x80];

    #[test]
    fn passes_through_complete_utf8() {
        let (s, carry) = decode_utf8_stream("ab─cd".as_bytes());
        assert_eq!(s, "ab─cd");
        assert!(carry.is_empty());
    }

    #[test]
    fn carries_incomplete_trailing_sequence() {
        // Read 1 ends mid-glyph: "a" + E2 94
        let mut bytes = b"a".to_vec();
        bytes.extend_from_slice(&DASH[..2]);
        let (s, carry) = decode_utf8_stream(&bytes);
        assert_eq!(s, "a");
        assert_eq!(carry, DASH[..2].to_vec());

        // Read 2 = carry + remaining byte (80) + "b" => completes the glyph.
        let mut next = carry;
        next.push(DASH[2]);
        next.extend_from_slice(b"b");
        let (s2, carry2) = decode_utf8_stream(&next);
        assert_eq!(s2, "─b");
        assert!(carry2.is_empty());
    }

    #[test]
    fn replaces_genuinely_invalid_bytes() {
        // A lone continuation byte (0x80) is invalid, not just incomplete.
        let (s, carry) = decode_utf8_stream(&[b'x', 0x80, b'y']);
        assert_eq!(s, "x\u{FFFD}y");
        assert!(carry.is_empty());
    }

    #[test]
    fn split_across_three_reads() {
        let (s0, c0) = decode_utf8_stream(&DASH[..1]); // E2
        assert_eq!(s0, "");
        assert_eq!(c0, DASH[..1].to_vec());
        let mut b1 = c0;
        b1.push(DASH[1]); // E2 94
        let (s1, c1) = decode_utf8_stream(&b1);
        assert_eq!(s1, "");
        assert_eq!(c1, DASH[..2].to_vec());
        let mut b2 = c1;
        b2.push(DASH[2]); // E2 94 80
        let (s2, c2) = decode_utf8_stream(&b2);
        assert_eq!(s2, "─");
        assert!(c2.is_empty());
    }
}
