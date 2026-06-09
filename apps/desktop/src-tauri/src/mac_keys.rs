// macOS-only Shift-state monitor.
//
// AppKit's NSEvent local monitor stops firing during an HTML5 drag — the
// webview's drag session captures the event flow before it reaches the
// standard responder chain. Polling `CGEventSource::flags_state` reads
// the HID-level modifier state directly and is unaffected by drag mode,
// so it's our fallback. 30ms cadence is fast enough for "press Shift
// mid-drag" UX (well below human perception of latency).

#![cfg(target_os = "macos")]

use core_graphics::event::CGEventFlags;
use core_graphics::event_source::CGEventSourceStateID;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::Duration;

// `CGEventSourceFlagsState` isn't exposed by the core-graphics crate, so we
// link it manually. Reads the HID-level modifier state — survives the
// webview drag session that silences AppKit's event monitors.
#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGEventSourceFlagsState(state_id: CGEventSourceStateID) -> CGEventFlags;
}

fn current_shift_state() -> bool {
    unsafe {
        let flags = CGEventSourceFlagsState(CGEventSourceStateID::CombinedSessionState);
        flags.contains(CGEventFlags::CGEventFlagShift)
    }
}

pub fn install_shift_monitor<F>(callback: F)
where
    F: Fn(bool) + Send + Sync + 'static,
{
    thread::spawn(move || {
        let last = AtomicBool::new(false);
        loop {
            let shift = current_shift_state();
            let prev = last.swap(shift, Ordering::SeqCst);
            if prev != shift {
                callback(shift);
            }
            thread::sleep(Duration::from_millis(30));
        }
    });
}
