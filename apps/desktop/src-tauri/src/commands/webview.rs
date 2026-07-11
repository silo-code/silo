//! `webview_snapshot` — rect-cropped pixel capture of the app's own main
//! webview (Phase 1 of the `ctx.webview` iframe bridge). Because any embedded
//! iframe's pixels are part of the main webview's render tree, this captures
//! cross-origin iframe content perfectly with no OS permission prompt and no
//! window-occlusion risk (unlike a screen-capture-based approach). The
//! counterpart to the init-script bridge in `webview_bridge.rs`, which gives
//! script/DOM access into the same iframes.
//!
//! Rect is in logical (CSS) px, matching `getBoundingClientRect()`. Output
//! PNG bytes are physical px (device-pixel-ratio scaled) — same binary
//! framing as `commands::network::net_fetch_bytes` (raw bytes over the fast
//! IPC path, no base64 bloat).

#[tauri::command]
pub async fn webview_snapshot(
    window: tauri::WebviewWindow,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<tauri::ipc::Response, String> {
    #[cfg(target_os = "macos")]
    {
        let (tx, rx) = std::sync::mpsc::channel::<Result<Vec<u8>, String>>();

        window
            .with_webview(move |webview| {
                macos::take_snapshot(webview, x, y, width, height, tx);
            })
            .map_err(|e| e.to_string())?;

        let bytes: Vec<u8> = tauri::async_runtime::spawn_blocking(move || {
            rx.recv()
                .map_err(|e| format!("snapshot channel closed: {e}"))
                .and_then(|inner| inner)
        })
        .await
        .map_err(|e| e.to_string())??;

        Ok(tauri::ipc::Response::new(bytes))
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = (window, x, y, width, height);
        Err(
            "webview_snapshot is not yet implemented on this platform (Phase 1 is macOS-only)"
                .to_string(),
        )
    }
}

#[cfg(target_os = "macos")]
mod macos {
    use objc2::runtime::AnyObject;
    use objc2::{AnyThread, MainThreadMarker};
    use objc2_app_kit::{NSBitmapImageFileType, NSBitmapImageRep};
    use objc2_core_foundation::{CGPoint, CGRect, CGSize};
    use objc2_foundation::{NSDictionary, NSString};
    use objc2_web_kit::{WKSnapshotConfiguration, WKWebView};
    use std::sync::mpsc::Sender;

    /// Runs on the main thread (guaranteed by `WebviewWindow::with_webview`).
    /// Sends exactly one result down `tx`: PNG bytes, or an error string.
    pub fn take_snapshot(
        webview: tauri::webview::PlatformWebview,
        x: f64,
        y: f64,
        width: f64,
        height: f64,
        tx: Sender<Result<Vec<u8>, String>>,
    ) {
        let Some(mtm) = MainThreadMarker::new() else {
            let _ = tx.send(Err(
                "webview_snapshot: take_snapshot called off the main thread".into(),
            ));
            return;
        };

        // SAFETY: `webview.inner()` is a valid WKWebView* for the lifetime of
        // this callback (Tauri owns the webview and we're on its main thread,
        // per `with_webview`'s contract).
        let view: &WKWebView = unsafe { &*webview.inner().cast() };

        let config = unsafe { WKSnapshotConfiguration::new(mtm) };
        let rect = CGRect {
            origin: CGPoint { x, y },
            size: CGSize { width, height },
        };
        unsafe {
            config.setRect(rect);
            config.setAfterScreenUpdates(true);
        }

        let block = block2::RcBlock::new(move |image_ptr, error_ptr| {
            // SAFETY: called only by WKWebView's completion handler with its
            // own Apple-supplied pointers — see `convert_to_png`'s doc comment.
            let result = unsafe { convert_to_png(image_ptr, error_ptr) };
            // Best-effort: if the receiver already gave up (command future
            // dropped), there's nothing else to do.
            let _ = tx.send(result);
        });

        unsafe {
            view.takeSnapshotWithConfiguration_completionHandler(Some(&config), &block);
        }
    }

    /// SAFETY: called only from the WKWebView completion handler with
    /// Apple-supplied pointers; at most one of `image_ptr`/`error_ptr` is
    /// non-null. Neither pointer is retained past this call — we finish all
    /// use of them synchronously and only send owned bytes onward.
    unsafe fn convert_to_png(
        image_ptr: *mut objc2_app_kit::NSImage,
        error_ptr: *mut objc2_foundation::NSError,
    ) -> Result<Vec<u8>, String> {
        if let Some(error) = error_ptr.as_ref() {
            return Err(format!("takeSnapshot failed: {error:?}"));
        }
        let Some(image) = image_ptr.as_ref() else {
            return Err("takeSnapshot returned neither an image nor an error".into());
        };

        let Some(tiff) = image.TIFFRepresentation() else {
            return Err("NSImage.TIFFRepresentation returned nil".into());
        };
        let Some(bitmap) = NSBitmapImageRep::initWithData(NSBitmapImageRep::alloc(), &tiff)
        else {
            return Err("NSBitmapImageRep(data:) failed to parse TIFF data".into());
        };

        let empty_props: objc2::rc::Retained<NSDictionary<NSString, AnyObject>> =
            NSDictionary::from_slices::<NSString>(&[], &[]);
        let Some(png_data) =
            bitmap.representationUsingType_properties(NSBitmapImageFileType::PNG, &empty_props)
        else {
            return Err("NSBitmapImageRep PNG encoding failed".into());
        };

        Ok(png_data.to_vec())
    }
}
