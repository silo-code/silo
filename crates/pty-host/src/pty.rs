//! PTY ownership via `libc::forkpty`. The daemon process calls this, becoming
//! the owner of the real master fd (the keystone for Proof 2: `tcgetpgrp` on
//! this fd reports the *shell's* foreground group, not a client's).

use std::ffi::CString;
use std::os::unix::io::RawFd;
use std::ptr;

pub struct Pty {
    /// Real PTY master fd, owned by the daemon for the session's lifetime.
    pub master: RawFd,
    /// The forkpty child — the session/group leader (its pgid == this pid).
    pub child: libc::pid_t,
}

/// `forkpty` a new session running `cmd` in `cwd` at the given size.
///
/// In the child: set `TERM`/`COLORTERM`, `chdir`, then `execvp`. In the parent
/// (the daemon): return the master fd + child pid. The child is already the
/// controlling process of the slave (forkpty does `setsid` + `TIOCSCTTY`).
pub fn fork_pty(cmd: &[String], cwd: &str, cols: u16, rows: u16) -> Result<Pty, String> {
    if cmd.is_empty() {
        return Err("empty command".into());
    }
    let mut master: RawFd = -1;
    let ws = libc::winsize {
        ws_row: rows,
        ws_col: cols,
        ws_xpixel: 0,
        ws_ypixel: 0,
    };
    // SAFETY: classic forkpty; we handle both branches and never return from the
    // child except via exec or _exit.
    let pid = unsafe {
        libc::forkpty(
            &mut master,
            ptr::null_mut(),
            ptr::null_mut(),
            &ws as *const libc::winsize as *mut libc::winsize,
        )
    };
    if pid < 0 {
        return Err("forkpty failed".into());
    }
    if pid == 0 {
        // ---- child ----
        unsafe {
            set_env("TERM", "xterm-256color");
            set_env("COLORTERM", "truecolor");
            if let Ok(c) = CString::new(cwd) {
                libc::chdir(c.as_ptr());
            }
        }
        // Build argv (NULL-terminated).
        let cargs: Vec<CString> = cmd
            .iter()
            .map(|s| CString::new(s.as_str()).unwrap_or_else(|_| CString::new("").unwrap()))
            .collect();
        let mut argv: Vec<*const libc::c_char> = cargs.iter().map(|c| c.as_ptr()).collect();
        argv.push(ptr::null());
        unsafe {
            libc::execvp(argv[0], argv.as_ptr());
            // exec only returns on failure.
            libc::_exit(127);
        }
    }
    Ok(Pty { master, child: pid })
}

unsafe fn set_env(key: &str, val: &str) {
    if let (Ok(k), Ok(v)) = (CString::new(key), CString::new(val)) {
        libc::setenv(k.as_ptr(), v.as_ptr(), 1);
    }
}

/// Push a new window size to the PTY so TUIs get `SIGWINCH`.
pub fn set_winsize(master: RawFd, cols: u16, rows: u16) {
    let ws = libc::winsize {
        ws_row: rows,
        ws_col: cols,
        ws_xpixel: 0,
        ws_ypixel: 0,
    };
    unsafe {
        libc::ioctl(master, libc::TIOCSWINSZ, &ws as *const libc::winsize);
    }
}
