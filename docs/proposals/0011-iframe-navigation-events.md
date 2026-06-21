---
status: draft
created: 2026-06-21
---

# 0011. Iframe navigation events via webview init script

## Summary

Expose in-iframe navigation events (pushState, replaceState, popstate, load) to
extensions via a new `ctx.webview` service, implemented by injecting a thin
JavaScript shim into every frame through Tauri's `initialization_script`.
This makes back/forward navigation functional inside the Local Web Viewer and
any future extension that embeds web content.

## Motivation

When an extension embeds a URL in an `<iframe>`, the browser's cross-origin
security model prevents the parent frame from:

- Reading `frame.contentWindow.location.href`
- Listening to `popstate` / `pushState` events inside the frame
- Calling `frame.contentWindow.history.back()` (SecurityError)

This means the Local Web Viewer (`silo.local-web-viewer`) cannot track in-frame
navigation. After the user clicks a link within a SPA (React Router, Vue Router,
Next.js, etc.), the address bar doesn't update, the back button doesn't become
available, and refresh reloads the original entry-point URL instead of the
current page.

The standard workaround — having the embedded app emit `window.parent.postMessage`
on route changes — requires modifying every app you want to embed, which is
impractical for a general tool.

## Design

### Layer 1 — Tauri init script (host-level, `apps/desktop`)

Tauri's `WebviewWindowBuilder::initialization_script(script)` injects JavaScript
that runs **before any page script** in **every frame** (including cross-origin
iframes), because Tauri uses `WKUserScript` with `forMainFrameOnly: false` and
the equivalent on Windows/Linux.

Add a script to `apps/desktop/src-tauri/src/lib.rs` via the webview builder:

```javascript
(function () {
  // Only instrument subframes — skip the main Silo window.
  if (window === window.top) return;

  function notify(type) {
    try {
      window.parent.postMessage(
        { __silo_frame_nav: true, type, url: location.href },
        "*",
      );
    } catch (_) {}
  }

  // SPA push/replace navigation
  const _push = history.pushState;
  history.pushState = function () {
    _push.apply(this, arguments);
    notify("push");
  };
  const _replace = history.replaceState;
  history.replaceState = function () {
    _replace.apply(this, arguments);
    notify("replace");
  };

  // Browser back/forward within the SPA
  window.addEventListener("popstate", function () {
    notify("pop");
  });

  // Traditional full-page loads and hash changes
  window.addEventListener("load", function () {
    notify("load");
  });
  window.addEventListener("hashchange", function () {
    notify("hash");
  });
})();
```

This script runs in every iframe's JS context, intercepts all navigation
primitives, and posts a structured message to the parent frame.

### Layer 2 — Host message listener + event bus (`packages/extension-host`)

In the extension host's startup (or in the webview surface service), listen to
`window.addEventListener('message', ...)` and forward messages that carry
`__silo_frame_nav: true` through an internal event bus, keyed by the source
window reference (`event.source`).

```typescript
// packages/extension-host/src/extension-host/webview-service.ts
window.addEventListener("message", (event) => {
  if (!event.data?.__silo_frame_nav) return;
  frameNavBus.emit(event.source as Window, {
    type: event.data.type, // 'push' | 'replace' | 'pop' | 'load' | 'hash'
    url: event.data.url as string,
  });
});
```

### Layer 3 — SDK surface (`packages/sdk`)

Add a `ctx.webview` property of type `WebviewService`:

```typescript
// packages/sdk/src/webview-service.ts

export type FrameNavType = "push" | "replace" | "pop" | "load" | "hash";

export interface FrameNavigateEvent {
  /** Navigation type: SPA push/replace, popstate, full-page load, or hash change. */
  type: FrameNavType;
  /** The iframe's current URL at the time of the event. */
  url: string;
}

export interface WebviewService {
  /**
   * Subscribe to navigation events from a specific iframe element.
   * The handler fires whenever the iframe pushes a new route, navigates back,
   * or completes a full-page load.
   *
   * Returns a {@link Disposable} — add it to `ctx.subscriptions` or call
   * `dispose()` manually to unsubscribe.
   *
   * @category Consumer Services
   * @public
   */
  onFrameNavigate(
    frame: HTMLIFrameElement,
    handler: (event: FrameNavigateEvent) => void,
  ): Disposable;
}
```

Extension usage:

```typescript
// In LocalWebViewerPanel:
useEffect(() => {
  if (!iframeRef.current) return;
  const sub = ctx.webview.onFrameNavigate(iframeRef.current, (event) => {
    setAddressBar(event.url);
    setUrl(event.url);
    api.updateParameters({ url: event.url });
  });
  return () => sub.dispose();
}, [iframeRef.current]);
```

### What this replaces in the Local Web Viewer

Once `ctx.webview` ships, the Local Web Viewer can:

1. Update the address bar on every SPA route change
2. Maintain a proper back/forward history stack for both SPA and full-page nav
3. Refresh the current page (URL is always known)

The extension keeps its `ctx.net.fetchHeaders` embeddability check — that remains
valuable for detecting blocked sites before attempting the load.

## Alternatives considered

**WKWebView navigation delegate (Rust/macOS-only)**  
A native `WKNavigationDelegate` can observe all subframe navigations, but it is
macOS-specific and requires platform-conditional Rust code. Not viable for a
cross-platform SDK primitive.

**postMessage from the embedded app**  
Apps can emit `window.parent.postMessage` on route changes themselves. This
works today with zero SDK changes for apps you control, and is the recommended
workaround until this RFC ships. It does not work for third-party apps.

**Polling `frame.contentWindow.name`**  
`window.name` is one of the few cross-origin readable properties. A polling loop
could detect changes if apps write their URL there. Unreliable — no standard
practice requires this, and it adds latency and CPU overhead.

**`location.href` polling**  
`frame.contentWindow.location.href` throws SecurityError for cross-origin
frames; polling cannot distinguish "same URL" from "new URL" without reading it.

## Decision

_To be filled in when the RFC is accepted._

Once implemented, flip `ctx.webview` on the [Roadmap](/roadmap) from `planned`
to `stable` and add its hand-authored page at `apps/docs/api/state/webview.md`.
