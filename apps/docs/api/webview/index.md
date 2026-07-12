# ctx.webview <Badge type="tip" text="stable" />

Real DOM access, navigation control, and native pixel capture inside an
`<iframe>` your panel owns — including cross-origin content that the
browser's same-origin policy would otherwise fully sandbox. The host achieves
this by injecting a handshake-gated script into every frame (a Tauri
all-frames init script reaches subframes the browser itself can't be reached
from) and talking to it over `postMessage`; none of that machinery is visible
here — `attach` just gives you a working `WebFrame`.

Requires the `"webview"` permission — declare it in your extension manifest.
Trusted (bundled) extensions are unscoped, same trust model as `ctx.files` /
`ctx.process`.

```ts
ctx.webview: WebviewService
```

## `ctx.webview.attach(frame)` {#attach}

Attach the bridge to an iframe your panel owns. The iframe can be
cross-origin — that's the point. Returns a [`WebFrame`](#webframe); call
`.dispose()` (or push it onto `ctx.subscriptions`) when done with it.

```ts
attach(frame: HTMLIFrameElement): WebFrame
```

**Throws** synchronously if the `"webview"` permission isn't granted.

```tsx
function MyPanel({ ctx }: { ctx: ExtensionContext }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const frameRef = useRef<WebFrame | null>(null);

  useEffect(() => {
    if (!iframeRef.current) return;
    const frame = ctx.webview.attach(iframeRef.current);
    frameRef.current = frame;
    const sub = frame.onNavigate((e) =>
      console.log(e.type, e.url, e.newDocument),
    );
    return () => {
      sub.dispose();
      frame.dispose();
    };
  }, []);

  return <iframe ref={iframeRef} src="https://example.com" />;
}
```

## `WebFrame` {#webframe}

The live connection returned by `attach()`. Every method re-checks the
`"webview"` permission, not just the initial `attach()` call — a frame can
outlive the scope it was attached under (e.g. its owning extension reloading
with a narrower manifest), so a revoked permission surfaces as each method
throwing/rejecting rather than a handle that silently keeps working.

| Member                 | Description                                                                             |
| ---------------------- | --------------------------------------------------------------------------------------- |
| `url`                  | The frame's current URL, updated on every `onNavigate` event. `null` before first load. |
| `onNavigate(listener)` | Subscribe to in-frame navigation — full loads and SPA route changes alike.              |
| `onBlocked(listener)`  | Fires when a navigation looks frame-blocked (see below).                                |
| `back()` / `forward()` | Navigate the frame's history, if possible. Fire-and-forget.                             |
| `reload()`             | Reload the frame's current page. Fire-and-forget.                                       |
| `exec(code)`           | Run JavaScript inside the frame; resolves with its result.                              |
| `pickElement()`        | Interactive element picking — see below.                                                |
| `cancelPick()`         | Cancel an in-flight `pickElement()` call.                                               |
| `capture()`            | Native PNG snapshot of the frame's current visible viewport.                            |
| `captureRect(rect)`    | Native PNG snapshot of a frame-relative sub-rect.                                       |
| `captureFullPage()`    | Native PNG snapshot of the entire scrollable document, stitched from scrolled captures. |
| `dispose()`            | Tear down the bridge for this frame. Always safe to call, even more than once.          |

### `onNavigate` and `newDocument` {#nav}

Subscribe to in-frame navigation — full document loads and SPA route changes
(`history.pushState`/`replaceState`, hash changes, back/forward) alike. Each
event's `newDocument` flag is `true` only on the first event reported by a
freshly loaded document, `false` for every subsequent event from that same
document — frameworks commonly call `history.replaceState` while booting, so
a single full-page navigation can report a `"replace"` event _before_ its
`"load"`; without this flag a consumer building its own history stack can't
tell that boot-time `replaceState` (a brand-new page) apart from a genuine
in-page one (rewriting the current entry).

### `exec(code)` {#exec}

Run JavaScript inside the frame and resolve with its result. A single
expression's value is returned (e.g. `"document.title"`, `"location.href"`,
`"document.querySelectorAll('a').length"`) — matching how a devtools console
evaluates. Multi-statement code runs but only returns a value if it ends in
an explicit `return`-compatible form. The result must be structured-clone-safe
(no DOM nodes, functions, etc.).

```ts
exec<T = unknown>(code: string): Promise<T>
```

```ts
const title = await frame.exec<string>("document.title");
const linkCount = await frame.exec<number>(
  "document.querySelectorAll('a').length",
);
```

### `pickElement()` / `cancelPick()` {#pick}

Enter interactive element-pick mode: the user hovers to highlight and clicks
to select, or presses Escape to cancel. Resolves with the picked element, or
`null` if cancelled. No timeout — this is inherently user-paced; if your
panel needs to abort a pick programmatically (e.g. the user closed the panel
mid-pick), call `cancelPick()`, which resolves the pending `pickElement()`
call with `null`. `pickElement()`'s promise also rejects if the frame
navigates away before the user picks anything.

```ts
pickElement(): Promise<PickedElement | null>
cancelPick(): void
```

```ts
const picked = await frame.pickElement();
if (picked) {
  console.log(picked.selector, picked.text);
  const blob = await frame.captureRect(picked.rect);
}
```

### `onBlocked` {#blocked}

Fires when a navigation lands on what looks like a frame-blocked page — sites
sending `X-Frame-Options` / `frame-ancestors` don't error, the engine just
commits an empty document at the target URL, so this is a heuristic (empty
title + no body content, re-confirmed a moment later to rule out a transient
interstitial or redirector), not a definitive diagnosis. Treat it as "this
page probably won't work embedded — offer to open it in a browser instead"
(see [`ctx.ui.openExternal`](/api/ui/)).

### `captureFullPage()` {#capture-full-page}

Stitches a full-page screenshot from scrolled captures; scroll position is
restored afterward. Rejects if the frame currently has zero viewport height
(e.g. its panel isn't visible/laid out) rather than hanging.

## Type links

- [`WebviewService`](/api/types/interfaces/WebviewService)
- [`WebFrame`](/api/types/interfaces/WebFrame)
- [`WebviewNavType`](/api/types/type-aliases/WebviewNavType)
- [`WebviewNavigateEvent`](/api/types/interfaces/WebviewNavigateEvent)
- [`WebviewRect`](/api/types/interfaces/WebviewRect)
- [`PickedElement`](/api/types/interfaces/PickedElement)

## See also

- [`ctx.net.fetchHeaders`](/api/net/#fetchHeaders) — check `X-Frame-Options` /
  CSP before embedding a URL, without needing the `"webview"` permission
- [`ctx.ui.openExternal`](/api/ui/) — open a URL in the user's default browser
  as a fallback when `onBlocked` fires
- `core.webview-bridge-test` (bundled, dev builds only) — a reference
  implementation exercising this API end-to-end against real cross-origin
  pages
