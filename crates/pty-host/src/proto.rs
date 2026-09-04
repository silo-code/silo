//! Spike-grade wire protocol: length-prefixed frames over the per-session Unix
//! socket. `[tag: u8][len: u32 BE][payload: len bytes]`.
//!
//! This is intentionally minimal — one socket per session, a tag byte to tell
//! control from data. Whether the real daemon wants a multiplexed transport is
//! an RFC 0010 open question; the spike answers it by living with per-session.

use std::io::{self, Read, Write};

// client -> daemon
pub const T_DATA: u8 = 0; // raw bytes for the PTY (both directions)
pub const T_RESIZE: u8 = 1; // payload: cols u16 BE, rows u16 BE
pub const T_KILL: u8 = 2; // force-terminate the session
pub const T_FG_REQ: u8 = 3; // request foreground info
// daemon -> client
pub const T_FG_REP: u8 = 4; // payload: "<pgid>\t<at_prompt 0|1>\t<leader name>"
pub const T_HELLO: u8 = 5; // first frame the daemon sends on connect: payload = PROTO_VERSION (u32 BE)
pub const T_SUBSCRIBE_FG: u8 = 6; // client -> daemon: become a foreground-events subscriber (stop data; receive T_FG_REP pushes)
pub const T_REPLAY_BEGIN: u8 = 7; // daemon -> client: the T_DATA frames that follow are ring history, not live output
pub const T_REPLAY_END: u8 = 8; // daemon -> client: history ends here; subsequent T_DATA is live

/// Wire-protocol version, exchanged in the `T_HELLO` handshake so an app build
/// never talks to a daemon left over from an incompatible older build (the
/// self-fork model makes that rare, but a daemon can outlive an app upgrade).
///
/// - **1** — the original: one `T_DATA` tag for both ring replay and live output.
/// - **2** — ring replay is bracketed by `T_REPLAY_BEGIN` / `T_REPLAY_END`
///   (RFC 0036), so a client can tell history from live output.
pub const PROTO_VERSION: u32 = 2;

/// Oldest daemon protocol this build can still adopt.
///
/// A daemon outlives the app that forked it, so a Silo upgrade routinely finds
/// sessions still being served by the previous release's daemon on the version
/// it started with. Refusing those would kill every running terminal on every
/// update that touches the protocol — the opposite of what a persistent session
/// host is for. Version 1 simply doesn't bracket its replay, which the client
/// handles by treating everything it sends as live (exactly pre-RFC-0036
/// behavior).
pub const MIN_COMPATIBLE_PROTO: u32 = 1;

/// Whether this build can adopt a daemon speaking `v`.
pub fn proto_compatible(v: u32) -> bool {
    (MIN_COMPATIBLE_PROTO..=PROTO_VERSION).contains(&v)
}

/// Whether a peer speaking `v` brackets its ring replay. False for an untagged
/// (version 1) peer, whose `T_DATA` frames must all be treated as live.
pub fn proto_tags_replay(v: u32) -> bool {
    v >= 2
}

pub fn write_frame<W: Write>(w: &mut W, tag: u8, payload: &[u8]) -> io::Result<()> {
    let len = payload.len() as u32;
    w.write_all(&[tag])?;
    w.write_all(&len.to_be_bytes())?;
    w.write_all(payload)?;
    w.flush()
}

pub fn read_frame<R: Read>(r: &mut R) -> io::Result<(u8, Vec<u8>)> {
    let mut hdr = [0u8; 5];
    r.read_exact(&mut hdr)?;
    let tag = hdr[0];
    let len = u32::from_be_bytes([hdr[1], hdr[2], hdr[3], hdr[4]]) as usize;
    let mut buf = vec![0u8; len];
    r.read_exact(&mut buf)?;
    Ok((tag, buf))
}

pub fn resize_payload(cols: u16, rows: u16) -> [u8; 4] {
    let c = cols.to_be_bytes();
    let r = rows.to_be_bytes();
    [c[0], c[1], r[0], r[1]]
}

pub fn parse_resize(p: &[u8]) -> Option<(u16, u16)> {
    if p.len() != 4 {
        return None;
    }
    Some((
        u16::from_be_bytes([p[0], p[1]]),
        u16::from_be_bytes([p[2], p[3]]),
    ))
}

pub fn hello_payload() -> [u8; 4] {
    PROTO_VERSION.to_be_bytes()
}

pub fn parse_hello(p: &[u8]) -> Option<u32> {
    if p.len() != 4 {
        return None;
    }
    Some(u32::from_be_bytes([p[0], p[1], p[2], p[3]]))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn frame_round_trips_tag_and_payload() {
        let mut buf = Vec::new();
        write_frame(&mut buf, T_DATA, b"hello").unwrap();
        let (tag, payload) = read_frame(&mut Cursor::new(buf)).unwrap();
        assert_eq!(tag, T_DATA);
        assert_eq!(payload, b"hello");
    }

    #[test]
    fn frame_handles_empty_payload() {
        let mut buf = Vec::new();
        write_frame(&mut buf, T_FG_REQ, &[]).unwrap();
        let (tag, payload) = read_frame(&mut Cursor::new(buf)).unwrap();
        assert_eq!(tag, T_FG_REQ);
        assert!(payload.is_empty());
    }

    #[test]
    fn back_to_back_frames_read_in_order() {
        let mut buf = Vec::new();
        write_frame(&mut buf, T_DATA, b"one").unwrap();
        write_frame(&mut buf, T_RESIZE, &resize_payload(120, 40)).unwrap();
        let mut cur = Cursor::new(buf);
        let (t1, p1) = read_frame(&mut cur).unwrap();
        let (t2, p2) = read_frame(&mut cur).unwrap();
        assert_eq!((t1, &p1[..]), (T_DATA, &b"one"[..]));
        assert_eq!(t2, T_RESIZE);
        assert_eq!(parse_resize(&p2), Some((120, 40)));
    }

    #[test]
    fn resize_payload_round_trips() {
        assert_eq!(parse_resize(&resize_payload(80, 24)), Some((80, 24)));
        assert_eq!(parse_resize(&[1, 2, 3]), None); // wrong length
    }

    #[test]
    fn replay_brackets_round_trip_as_empty_frames() {
        let mut buf = Vec::new();
        write_frame(&mut buf, T_REPLAY_BEGIN, &[]).unwrap();
        write_frame(&mut buf, T_DATA, b"history").unwrap();
        write_frame(&mut buf, T_REPLAY_END, &[]).unwrap();
        let mut cur = Cursor::new(buf);
        let (t1, p1) = read_frame(&mut cur).unwrap();
        let (t2, p2) = read_frame(&mut cur).unwrap();
        let (t3, p3) = read_frame(&mut cur).unwrap();
        assert_eq!((t1, p1.is_empty()), (T_REPLAY_BEGIN, true));
        assert_eq!((t2, &p2[..]), (T_DATA, &b"history"[..]));
        assert_eq!((t3, p3.is_empty()), (T_REPLAY_END, true));
    }

    #[test]
    fn replay_tags_do_not_collide_with_existing_ones() {
        let tags = [
            T_DATA,
            T_RESIZE,
            T_KILL,
            T_FG_REQ,
            T_FG_REP,
            T_HELLO,
            T_SUBSCRIBE_FG,
            T_REPLAY_BEGIN,
            T_REPLAY_END,
        ];
        let mut seen = tags.to_vec();
        seen.sort_unstable();
        seen.dedup();
        assert_eq!(seen.len(), tags.len());
    }

    #[test]
    fn adopts_this_version_and_the_untagged_predecessor() {
        assert!(proto_compatible(1));
        assert!(proto_compatible(PROTO_VERSION));
        assert!(!proto_compatible(0));
        assert!(!proto_compatible(PROTO_VERSION + 1));
    }

    #[test]
    fn only_version_2_and_up_brackets_replay() {
        assert!(!proto_tags_replay(1));
        assert!(proto_tags_replay(2));
        assert!(proto_tags_replay(PROTO_VERSION));
    }

    #[test]
    fn truncated_frame_is_an_error() {
        // header promises 10 bytes; only 2 follow
        let buf = vec![T_DATA, 0, 0, 0, 10, b'h', b'i'];
        assert!(read_frame(&mut Cursor::new(buf)).is_err());
    }
}
