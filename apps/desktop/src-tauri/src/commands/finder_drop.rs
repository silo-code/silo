// Finder → Silo drag-and-drop file path interception.
//
// macOS problem: WKWebView with dragDropEnabled:false fires HTML5 drag events
// for Finder file drags, but DataTransfer.getData("text/uri-list") is always
// empty — WebKit only populates DataTransfer.files (no .path in WKWebView), and
// named pasteboards (NSDragPboard) are a different object from the drag-session
// pasteboard passed by the OS to the NSDraggingDestination delegate.
//
// Solution: swizzle WKWebView's draggingEntered: method so we receive the
// NSDraggingInfo before WebKit does, read the file paths from
// NSDraggingInfo.draggingPasteboard (the authoritative source), store them in a
// static, and clear on draggingExited:/concludeDragOperation:. The Tauri command
// `dnd_get_finder_paths` simply reads the static; JS calls it during the very
// first dragover event (while the drag is still active) and caches the result.

use std::sync::OnceLock;
use std::sync::Mutex;

static DRAG_PATHS: OnceLock<Mutex<Vec<String>>> = OnceLock::new();

fn drag_paths_store() -> &'static Mutex<Vec<String>> {
    DRAG_PATHS.get_or_init(|| Mutex::new(Vec::new()))
}

/// Return the file paths being dragged from Finder into the current window.
/// Populated by the WKWebView swizzle installed at startup; empty on non-macOS.
#[tauri::command]
pub fn dnd_get_finder_paths() -> Vec<String> {
    drag_paths_store()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone()
}

/// Install the WKWebView NSDraggingDestination swizzle.
/// Must be called before the first WKWebView is created (i.e. before app.run()).
pub fn install_drag_swizzle() {
    #[cfg(target_os = "macos")]
    macos::install();
}

// ─── macOS implementation ────────────────────────────────────────────────────

#[cfg(target_os = "macos")]
mod macos {
    use super::drag_paths_store;
    use std::ffi::{CStr, CString, c_char, c_void};
    use std::ptr;
    use std::sync::atomic::{AtomicPtr, Ordering};
    use objc2::rc::autoreleasepool;
    use objc2::runtime::{AnyObject, Sel};
    use objc2::{class, msg_send, sel};

    // Original IMPs saved at swizzle time so we can call through to WebKit.
    static ORIG_ENTERED: AtomicPtr<c_void> = AtomicPtr::new(ptr::null_mut());
    static ORIG_EXITED: AtomicPtr<c_void> = AtomicPtr::new(ptr::null_mut());
    static ORIG_CONCLUDE: AtomicPtr<c_void> = AtomicPtr::new(ptr::null_mut());
    static ORIG_BEGIN_DRAG: AtomicPtr<c_void> = AtomicPtr::new(ptr::null_mut());

    // Raw ObjC runtime — not all exposed cleanly through objc2::ffi in 0.6.
    extern "C" {
        fn class_getInstanceMethod(cls: *const c_void, sel: Sel) -> *mut c_void;
        fn method_setImplementation(method: *mut c_void, imp: *const c_void) -> *const c_void;
    }

    // NSDragOperation is NSUInteger (u64 on 64-bit).
    type NSDragOperation = u64;

    // ── hooked draggingEntered: ──────────────────────────────────────────────
    unsafe extern "C" fn hooked_dragging_entered(
        this: *mut AnyObject,
        cmd: Sel,
        sender: *mut AnyObject,
    ) -> NSDragOperation {
        // Capture paths before WebKit touches the drag info.
        autoreleasepool(|_| {
            let paths = paths_from_drag_info(sender);
            eprintln!("[finder_drop] draggingEntered — captured {} path(s): {:?}", paths.len(), paths);
            *drag_paths_store().lock().unwrap_or_else(|e| e.into_inner()) = paths;
        });

        let orig = ORIG_ENTERED.load(Ordering::Acquire);
        let f: unsafe extern "C" fn(*mut AnyObject, Sel, *mut AnyObject) -> NSDragOperation =
            std::mem::transmute(orig);
        f(this, cmd, sender)
    }

    // ── hooked draggingExited: ───────────────────────────────────────────────
    unsafe extern "C" fn hooked_dragging_exited(
        this: *mut AnyObject,
        cmd: Sel,
        sender: *mut AnyObject,
    ) {
        eprintln!("[finder_drop] draggingExited — clearing cache");
        drag_paths_store()
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clear();

        let orig = ORIG_EXITED.load(Ordering::Acquire);
        if !orig.is_null() {
            let f: unsafe extern "C" fn(*mut AnyObject, Sel, *mut AnyObject) =
                std::mem::transmute(orig);
            f(this, cmd, sender);
        }
    }

    // ── hooked concludeDragOperation: ───────────────────────────────────────
    unsafe extern "C" fn hooked_conclude_drag(
        this: *mut AnyObject,
        cmd: Sel,
        sender: *mut AnyObject,
    ) {
        eprintln!("[finder_drop] concludeDragOperation — clearing cache");
        drag_paths_store()
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clear();

        let orig = ORIG_CONCLUDE.load(Ordering::Acquire);
        if !orig.is_null() {
            let f: unsafe extern "C" fn(*mut AnyObject, Sel, *mut AnyObject) =
                std::mem::transmute(orig);
            f(this, cmd, sender);
        }
    }

    // ── outgoing drag: inject NSFilenamesPboardType ──────────────────────────

    // Swizzle beginDraggingSessionWithItems:event:source: so we can add
    // NSFilenamesPboardType to the drag pasteboard after WebKit sets it up.
    // Finder requires NSFilenamesPboardType to accept a file-drop; WebKit
    // does not write it even when the DataTransfer carries text/uri-list.
    unsafe extern "C" fn hooked_begin_dragging_session(
        this: *mut AnyObject,
        cmd: Sel,
        items: *mut AnyObject,   // NSArray<NSDraggingItem *>
        event: *mut AnyObject,   // NSEvent *
        source: *mut AnyObject,  // id<NSDraggingSource>
    ) -> *mut AnyObject /* NSDraggingSession * */ {
        let orig = ORIG_BEGIN_DRAG.load(Ordering::Acquire);
        let f: unsafe extern "C" fn(
            *mut AnyObject, Sel,
            *mut AnyObject, *mut AnyObject, *mut AnyObject,
        ) -> *mut AnyObject = std::mem::transmute(orig);
        let session = f(this, cmd, items, event, source);

        if !session.is_null() {
            autoreleasepool(|_| {
                let pb: *mut AnyObject = msg_send![session, draggingPasteboard];
                if !pb.is_null() {
                    inject_filenames_if_needed(pb);
                }
            });
        }
        session
    }

    // Read the drag pasteboard and, if it contains file URLs in any
    // WebKit-written type, also write NSFilenamesPboardType so Finder can
    // accept the drop. Logs all types for diagnostics.
    unsafe fn inject_filenames_if_needed(pb: *mut AnyObject) {
        let types: *mut AnyObject = msg_send![pb, types];
        if types.is_null() { return; }
        let count: usize = msg_send![types, count];
        eprintln!("[finder_drop] outgoing drag: {} pasteboard type(s)", count);

        let mut file_paths: Vec<String> = Vec::new();

        for i in 0..count {
            let t: *mut AnyObject = msg_send![types, objectAtIndex: i];
            if t.is_null() { continue; }
            let utf8: *const c_char = msg_send![t, UTF8String];
            if utf8.is_null() { continue; }
            let type_name = CStr::from_ptr(utf8).to_str().unwrap_or("?");
            eprintln!("[finder_drop]   type[{}]: {}", i, type_name);

            // Collect file paths from likely URL types WebKit may write.
            // (public.url, public.file-url, NSURLPboardType are all candidates)
            let is_url_type = matches!(type_name,
                "public.url" | "public.file-url" | "Apple URL pasteboard type"
            );
            if is_url_type {
                let val: *mut AnyObject = msg_send![pb, stringForType: t];
                if val.is_null() { continue; }
                let vutf8: *const c_char = msg_send![val, UTF8String];
                if vutf8.is_null() { continue; }
                let url_str = CStr::from_ptr(vutf8).to_str().unwrap_or("");
                eprintln!("[finder_drop]     value: {}", url_str);
                // Grab each line (text/uri-list is CRLF-separated)
                for line in url_str.split(['\r', '\n']) {
                    let line = line.trim();
                    if line.starts_with("file://") {
                        let path = percent_decode_path(line.trim_start_matches("file://"));
                        if !path.is_empty() && !file_paths.contains(&path) {
                            file_paths.push(path);
                        }
                    }
                }
            }
        }

        if file_paths.is_empty() {
            eprintln!("[finder_drop] outgoing drag: no file URLs found");
            return;
        }
        eprintln!("[finder_drop] outgoing drag: injecting {} path(s): {:?}", file_paths.len(), file_paths);

        // Build NSArray<NSString> of POSIX paths.
        let path_ptrs: Vec<*mut AnyObject> = file_paths.iter().map(|p| {
            let cs = CString::new(p.as_str()).unwrap_or_default();
            let s: *mut AnyObject = msg_send![class!(NSString), stringWithUTF8String: cs.as_ptr()];
            s
        }).filter(|p| !p.is_null()).collect();

        if path_ptrs.is_empty() { return; }

        let arr: *mut AnyObject = msg_send![
            class!(NSArray),
            arrayWithObjects: path_ptrs.as_ptr(),
            count: path_ptrs.len()
        ];

        let fnames_type: *mut AnyObject = msg_send![
            class!(NSString),
            stringWithUTF8String: b"NSFilenamesPboardType\0".as_ptr() as *const c_char
        ];
        let type_arr: *mut AnyObject = msg_send![class!(NSArray), arrayWithObject: fnames_type];

        // Add the type to the drag pasteboard (owner:nil = we don't need callbacks).
        let _: bool = msg_send![pb, addTypes: type_arr, owner: ptr::null::<AnyObject>()];
        let _: bool = msg_send![pb, setPropertyList: arr, forType: fnames_type];
        eprintln!("[finder_drop] outgoing drag: NSFilenamesPboardType written");
    }

    // Minimal percent-decode for file paths (%20 → space, etc.).
    fn percent_decode_path(s: &str) -> String {
        // Remove the leading extra slash if the URL is file:///path
        let s = s.strip_prefix('/').unwrap_or(s);
        let s = format!("/{}", s); // restore the leading /
        let mut out = String::with_capacity(s.len());
        let mut bytes = s.bytes();
        while let Some(b) = bytes.next() {
            if b == b'%' {
                let h1 = bytes.next().and_then(|b| (b as char).to_digit(16));
                let h2 = bytes.next().and_then(|b| (b as char).to_digit(16));
                if let (Some(h1), Some(h2)) = (h1, h2) {
                    out.push(((h1 * 16 + h2) as u8) as char);
                }
            } else {
                out.push(b as char);
            }
        }
        out
    }

    // ── read paths from NSDraggingInfo ───────────────────────────────────────
    unsafe fn paths_from_drag_info(info: *mut AnyObject) -> Vec<String> {
        if info.is_null() {
            return vec![];
        }
        let pb: *mut AnyObject = msg_send![info, draggingPasteboard];
        if pb.is_null() {
            eprintln!("[finder_drop] draggingPasteboard is nil");
            return vec![];
        }

        // Primary: NSFilenamesPboardType → NSArray<NSString> of absolute paths.
        let paths = try_filenames_type(pb);
        if !paths.is_empty() {
            return paths;
        }

        // Fallback: read NSURL objects (modern macOS approach).
        try_file_urls(pb)
    }

    unsafe fn try_filenames_type(pb: *mut AnyObject) -> Vec<String> {
        let str_cls = class!(NSString);
        let type_str: *mut AnyObject = msg_send![
            str_cls,
            stringWithUTF8String: b"NSFilenamesPboardType\0".as_ptr() as *const c_char
        ];
        if type_str.is_null() {
            return vec![];
        }
        let plist: *mut AnyObject = msg_send![pb, propertyListForType: type_str];
        if plist.is_null() {
            eprintln!("[finder_drop] NSFilenamesPboardType → nil");
            return vec![];
        }
        let count: usize = msg_send![plist, count];
        eprintln!("[finder_drop] NSFilenamesPboardType count={}", count);
        let mut paths = Vec::with_capacity(count);
        for i in 0..count {
            let item: *mut AnyObject = msg_send![plist, objectAtIndex: i];
            if item.is_null() {
                continue;
            }
            let utf8: *const c_char = msg_send![item, UTF8String];
            if utf8.is_null() {
                continue;
            }
            if let Ok(s) = CStr::from_ptr(utf8).to_str() {
                paths.push(s.to_owned());
            }
        }
        paths
    }

    unsafe fn try_file_urls(pb: *mut AnyObject) -> Vec<String> {
        // [pb readObjectsForClasses:@[[NSURL class]] options:nil]
        let url_cls = class!(NSURL);
        let arr_cls = class!(NSArray);
        let url_cls_obj: *mut AnyObject = url_cls as *const _ as *mut AnyObject;
        let classes: *mut AnyObject =
            msg_send![arr_cls, arrayWithObject: url_cls_obj];
        let objects: *mut AnyObject =
            msg_send![pb, readObjectsForClasses: classes, options: ptr::null::<AnyObject>()];
        if objects.is_null() {
            eprintln!("[finder_drop] readObjectsForClasses → nil");
            return vec![];
        }
        let count: usize = msg_send![objects, count];
        eprintln!("[finder_drop] readObjectsForClasses NSURL count={}", count);
        let mut paths = Vec::with_capacity(count);
        for i in 0..count {
            let url: *mut AnyObject = msg_send![objects, objectAtIndex: i];
            if url.is_null() {
                continue;
            }
            let is_file: bool = msg_send![url, isFileURL];
            if !is_file {
                continue;
            }
            let path_obj: *mut AnyObject = msg_send![url, path];
            if path_obj.is_null() {
                continue;
            }
            let utf8: *const c_char = msg_send![path_obj, UTF8String];
            if utf8.is_null() {
                continue;
            }
            if let Ok(s) = CStr::from_ptr(utf8).to_str() {
                paths.push(s.to_owned());
            }
        }
        paths
    }

    // ── swizzle installation ─────────────────────────────────────────────────
    fn swizzle_method(cls_ptr: *const c_void, sel: Sel, imp: *const c_void, store: &AtomicPtr<c_void>) {
        unsafe {
            let method = class_getInstanceMethod(cls_ptr, sel);
            if method.is_null() {
                eprintln!("[finder_drop] class_getInstanceMethod returned null for {:?}", sel);
                return;
            }
            let orig = method_setImplementation(method, imp);
            store.store(orig as *mut c_void, Ordering::Release);
            eprintln!("[finder_drop] swizzled {:?}", sel);
        }
    }

    pub fn install() {
        eprintln!("[finder_drop] installing WKWebView drag swizzle");
        // Try WryWebView first (WRY's WKWebView subclass); fall back to WKWebView.
        // WRY may or may not define its own drag methods depending on dragDropEnabled.
        let target_cls = {
            use objc2::runtime::AnyClass;
            let name = CString::new("WryWebView").unwrap();
            AnyClass::get(name.as_c_str())
                .map(|c| c as *const AnyClass as *const c_void)
                .unwrap_or_else(|| {
                    eprintln!("[finder_drop] WryWebView not found, using WKWebView");
                    unsafe { class!(WKWebView) as *const _ as *const c_void }
                })
        };

        swizzle_method(
            target_cls,
            sel!(draggingEntered:),
            hooked_dragging_entered as *const c_void,
            &ORIG_ENTERED,
        );
        swizzle_method(
            target_cls,
            sel!(draggingExited:),
            hooked_dragging_exited as *const c_void,
            &ORIG_EXITED,
        );
        swizzle_method(
            target_cls,
            sel!(concludeDragOperation:),
            hooked_conclude_drag as *const c_void,
            &ORIG_CONCLUDE,
        );
        swizzle_method(
            target_cls,
            sel!(beginDraggingSessionWithItems:event:source:),
            hooked_begin_dragging_session as *const c_void,
            &ORIG_BEGIN_DRAG,
        );
    }
}
