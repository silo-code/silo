//! Read the *real* foreground process of the session — its process group, name,
//! and working directory (RFC 0010 N1 + N2).
//!
//! Because the daemon owns the master fd, `tcgetpgrp(master)` returns the
//! process group the kernel currently routes terminal input to — i.e. the
//! program running *inside* the shell, or the shell itself at a prompt. A client
//! one hop from the shell (attaching through a separate multiplexer process)
//! can't see this — it would observe the client's group, not the shell's; owning
//! the master directly is what makes it visible.
//!
//! The group leader's pid equals the pgid, so we resolve its name and cwd from
//! that. `pgid`/`cwd_of` are cheap enough to poll every tick; `name_of` shells
//! out, so callers resolve it only when the group actually changes.

use std::os::unix::io::RawFd;

pub struct Foreground {
    pub pgid: i32,
    pub at_prompt: bool,
    pub leader: String,
    /// Working directory of the foreground leader ("" if unavailable).
    pub cwd: String,
}

/// The PTY's current foreground process-group id (cheap; poll freely).
pub fn pgid(master: RawFd) -> i32 {
    unsafe { libc::tcgetpgrp(master) }
}

/// Full foreground snapshot. `shell_pid` is the forkpty child (session leader);
/// foreground == shell ⇒ at a prompt.
pub fn query(master: RawFd, shell_pid: i32) -> Foreground {
    let pgid = pgid(master);
    Foreground {
        pgid,
        at_prompt: pgid == shell_pid,
        leader: if pgid > 0 { name_of(pgid) } else { "?".to_string() },
        cwd: if pgid > 0 { cwd_of(pgid) } else { String::new() },
    }
}

/// Resolve a pid to a program name. Shells out to `ps` (portable across
/// macOS/Linux) — the slow part, so callers cache it across the group's life.
pub fn name_of(pid: i32) -> String {
    let out = std::process::Command::new("ps")
        .args(["-p", &pid.to_string(), "-o", "comm="])
        .output();
    match out {
        Ok(o) => {
            let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
            if s.is_empty() {
                "?".to_string()
            } else {
                s
            }
        }
        Err(_) => "?".to_string(),
    }
}

/// Resolve a pid's current working directory ("" if it can't be read). cheap
/// enough to poll every tick (so a bare `cd` at the prompt is caught).
#[cfg(target_os = "macos")]
pub fn cwd_of(pid: i32) -> String {
    // macOS has no /proc; ask the kernel via proc_pidinfo for the vnode path of
    // the process's current directory.
    unsafe {
        let mut info: libc::proc_vnodepathinfo = std::mem::zeroed();
        let size = std::mem::size_of::<libc::proc_vnodepathinfo>() as libc::c_int;
        let n = libc::proc_pidinfo(
            pid,
            libc::PROC_PIDVNODEPATHINFO,
            0,
            &mut info as *mut _ as *mut libc::c_void,
            size,
        );
        if n <= 0 {
            return String::new();
        }
        // vip_path is a nested fixed array (MAXPATHLEN) in the libc binding but
        // contiguous bytes; read it as a NUL-terminated C string.
        std::ffi::CStr::from_ptr(info.pvi_cdir.vip_path.as_ptr() as *const libc::c_char)
            .to_string_lossy()
            .into_owned()
    }
}

#[cfg(not(target_os = "macos"))]
pub fn cwd_of(pid: i32) -> String {
    std::fs::read_link(format!("/proc/{pid}/cwd"))
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_default()
}

/// Wire form for `T_FG_REP`: `<pgid>\t<at_prompt 0|1>\t<leader>\t<cwd>`.
pub fn encode(fg: &Foreground) -> Vec<u8> {
    format!(
        "{}\t{}\t{}\t{}",
        fg.pgid,
        if fg.at_prompt { 1 } else { 0 },
        fg.leader,
        fg.cwd
    )
    .into_bytes()
}

pub fn decode(payload: &[u8]) -> Option<Foreground> {
    let s = String::from_utf8_lossy(payload);
    let mut it = s.splitn(4, '\t');
    let pgid: i32 = it.next()?.parse().ok()?;
    let at_prompt = it.next()? == "1";
    let leader = it.next()?.to_string();
    // cwd is last and optional (empty/absent → "").
    let cwd = it.next().unwrap_or("").to_string();
    Some(Foreground {
        pgid,
        at_prompt,
        leader,
        cwd,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encode_decode_round_trips() {
        let fg = Foreground {
            pgid: 4321,
            at_prompt: false,
            leader: "vim".to_string(),
            cwd: "/Users/dev/proj".to_string(),
        };
        let d = decode(&encode(&fg)).expect("decodes");
        assert_eq!(d.pgid, 4321);
        assert!(!d.at_prompt);
        assert_eq!(d.leader, "vim");
        assert_eq!(d.cwd, "/Users/dev/proj");
    }

    #[test]
    fn decode_handles_at_prompt_and_leaders_with_no_tabs() {
        let d = decode(b"100\t1\t-zsh\t/tmp").unwrap();
        assert_eq!(d.pgid, 100);
        assert!(d.at_prompt);
        assert_eq!(d.leader, "-zsh");
        assert_eq!(d.cwd, "/tmp");
    }

    #[test]
    fn decode_tolerates_missing_cwd() {
        // An older 3-field frame still decodes, with an empty cwd.
        let d = decode(b"100\t1\t-zsh").unwrap();
        assert_eq!(d.leader, "-zsh");
        assert_eq!(d.cwd, "");
    }

    #[test]
    fn decode_rejects_malformed() {
        assert!(decode(b"notanumber\t1\tx\t/").is_none());
        assert!(decode(b"").is_none());
    }
}
