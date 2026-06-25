//! Windows-only: sync the DWM caption (title-bar) background color.
//!
//! `DWMWA_CAPTION_COLOR` (attribute 35) lets the app paint the caption bar
//! with a custom COLORREF on Windows 11 build 22000+. Older Windows versions
//! ignore the attribute silently, so the call is always safe to make.

#[cfg(windows)]
#[link(name = "Dwmapi")]
extern "system" {
    fn DwmSetWindowAttribute(
        hwnd: isize,
        dw_attribute: u32,
        pv_attribute: *const core::ffi::c_void,
        cb_attribute: u32,
    ) -> i32;
}

#[cfg(windows)]
const DWMWA_CAPTION_COLOR: u32 = 35;

/// Paint the caption bar to match the app background color.
/// `r`, `g`, `b` are sRGB 0–255. No-ops on Windows 10 and earlier.
#[tauri::command]
#[allow(unused_variables)]
pub fn window_set_caption_color(window: tauri::WebviewWindow, r: u8, g: u8, b: u8) {
    #[cfg(windows)]
    {
        use tauri::raw_window_handle::{HasWindowHandle, RawWindowHandle};

        let Ok(handle) = window.window_handle() else {
            return;
        };
        let RawWindowHandle::Win32(h) = handle.as_raw() else {
            return;
        };
        // COLORREF format: 0x00BBGGRR
        let colorref: u32 = ((b as u32) << 16) | ((g as u32) << 8) | (r as u32);
        unsafe {
            DwmSetWindowAttribute(
                h.hwnd.get(),
                DWMWA_CAPTION_COLOR,
                &colorref as *const u32 as *const core::ffi::c_void,
                core::mem::size_of::<u32>() as u32,
            );
        }
    }
}
