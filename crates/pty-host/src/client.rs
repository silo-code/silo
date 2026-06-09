//! The attach client: relays the local terminal <-> session socket, plus the
//! one-shot `fg`/`kill` control commands.

use std::io::Write;
use std::os::unix::io::AsRawFd;
use std::os::unix::net::UnixStream;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use crate::foreground;
use crate::paths;
use crate::proto::*;

const DETACH_KEY: u8 = 0x1d; // Ctrl-]

static WINCH: AtomicBool = AtomicBool::new(false);

extern "C" fn on_winch(_sig: libc::c_int) {
    WINCH.store(true, Ordering::SeqCst);
}

/// Connect to a session socket, retrying briefly (the daemon may still be
/// binding right after `new`).
fn connect(name: &str) -> Result<UnixStream, String> {
    let path = paths::sock_path(name);
    let deadline = Instant::now() + Duration::from_millis(2000);
    loop {
        match UnixStream::connect(&path) {
            Ok(s) => return Ok(s),
            Err(_) if Instant::now() < deadline => {
                std::thread::sleep(Duration::from_millis(20));
            }
            Err(e) => return Err(format!("no session '{name}': {e}")),
        }
    }
}

/// Interactive attach: raw-mode the local tty and relay bytes both ways until
/// the shell exits or the user presses Ctrl-] to detach.
pub fn attach(name: &str) -> Result<(), String> {
    let stream = connect(name)?;
    let restore = enable_raw_mode();
    install_winch();

    // Initial resize from the current terminal size.
    if let Some((c, r)) = tty_size() {
        let mut s = &stream;
        let _ = write_frame(&mut s, T_RESIZE, &resize_payload(c, r));
    }

    // Reader: socket -> stdout. Exits the process when the daemon goes away.
    {
        let mut rs = stream.try_clone().map_err(|e| e.to_string())?;
        std::thread::spawn(move || {
            let stdout = std::io::stdout();
            loop {
                match read_frame(&mut rs) {
                    Ok((T_DATA, p)) => {
                        let mut h = stdout.lock();
                        let _ = h.write_all(&p);
                        let _ = h.flush();
                    }
                    Ok(_) => {}
                    Err(_) => std::process::exit(0),
                }
            }
        });
    }

    // Main: stdin -> socket, honoring SIGWINCH and the detach key.
    let mut ws = &stream;
    let mut buf = [0u8; 4096];
    let stdin_fd = std::io::stdin().as_raw_fd();
    loop {
        if WINCH.swap(false, Ordering::SeqCst) {
            if let Some((c, r)) = tty_size() {
                let _ = write_frame(&mut ws, T_RESIZE, &resize_payload(c, r));
            }
        }
        let n = unsafe { libc::read(stdin_fd, buf.as_mut_ptr() as *mut libc::c_void, buf.len()) };
        if n < 0 {
            // Interrupted by SIGWINCH — loop to flush the resize.
            continue;
        }
        if n == 0 {
            break;
        }
        let data = &buf[..n as usize];
        if data.contains(&DETACH_KEY) {
            break; // detach: leave the session running
        }
        if write_frame(&mut ws, T_DATA, data).is_err() {
            break;
        }
    }

    restore_mode(restore);
    println!("\r\n[detached]");
    Ok(())
}

/// One-shot: print the live foreground process of a session (Proof 2).
pub fn fg(name: &str) -> Result<(), String> {
    let mut s = connect(name)?;
    write_frame(&mut s, T_FG_REQ, &[]).map_err(|e| e.to_string())?;
    // Skip any ring-replay data frames; wait for the reply.
    let deadline = Instant::now() + Duration::from_millis(2000);
    while Instant::now() < deadline {
        match read_frame(&mut s) {
            Ok((T_FG_REP, p)) => {
                if let Some(fg) = foreground::decode(&p) {
                    println!(
                        "session '{name}': fg pgid={} leader={} at_prompt={}",
                        fg.pgid, fg.leader, fg.at_prompt
                    );
                    return Ok(());
                }
                return Err("bad fg reply".into());
            }
            Ok(_) => continue,
            Err(e) => return Err(format!("read: {e}")),
        }
    }
    Err("timed out waiting for fg reply".into())
}

/// Force-terminate a session.
pub fn kill(name: &str) -> Result<(), String> {
    let mut s = connect(name)?;
    write_frame(&mut s, T_KILL, &[]).map_err(|e| e.to_string())?;
    println!("session '{name}': kill sent");
    Ok(())
}

/// List live sessions (reaping any stale sockets), via the shared reconciliation
/// helpers the Silo backend also uses.
pub fn list() -> Result<(), String> {
    crate::discovery::reap_stale();
    let names = crate::discovery::list_sessions();
    if names.is_empty() {
        println!("(no sessions)");
    } else {
        for n in names {
            println!("{n}\tlive");
        }
    }
    Ok(())
}

// --- local tty helpers ---

fn install_winch() {
    unsafe {
        libc::signal(libc::SIGWINCH, on_winch as *const () as usize);
    }
}

fn tty_size() -> Option<(u16, u16)> {
    let mut ws: libc::winsize = unsafe { std::mem::zeroed() };
    let rc = unsafe { libc::ioctl(libc::STDIN_FILENO, libc::TIOCGWINSZ, &mut ws) };
    if rc == 0 && ws.ws_col > 0 {
        Some((ws.ws_col, ws.ws_row))
    } else {
        None
    }
}

fn enable_raw_mode() -> Option<libc::termios> {
    unsafe {
        let mut orig: libc::termios = std::mem::zeroed();
        if libc::tcgetattr(libc::STDIN_FILENO, &mut orig) != 0 {
            return None;
        }
        let mut raw = orig;
        libc::cfmakeraw(&mut raw);
        libc::tcsetattr(libc::STDIN_FILENO, libc::TCSANOW, &raw);
        Some(orig)
    }
}

fn restore_mode(orig: Option<libc::termios>) {
    if let Some(o) = orig {
        unsafe {
            libc::tcsetattr(libc::STDIN_FILENO, libc::TCSANOW, &o);
        }
    }
}
