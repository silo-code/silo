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
    }
}
