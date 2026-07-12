import type { Disposable } from "./types";
import type { Event } from "./event";

// `ctx.webview` — real DOM access, navigation control, and native pixel
// capture inside an `<iframe>` your panel owns, including cross-origin
// content that the browser's same-origin policy would otherwise fully
// sandbox. The host achieves this by injecting a handshake-gated script into
// every frame (a Tauri all-frames init script reaches subframes the browser
// itself can't be reached from) and talking to it over `postMessage`; none of
// that machinery is visible here — `attach` just gives you a working
// `WebFrame`. Requires the `"webview"` {@link Permission}.

/**
 * The kind of in-frame navigation reported by {@link WebFrame.onNavigate}.
 *
 * - `"load"` — a full document load (the initial navigation, or any
 *   non-SPA link click / `location.href` assignment).
 * - `"push"` / `"replace"` — `history.pushState` / `history.replaceState`,
 *   the SPA route-change primitives (React Router, Vue Router, etc.).
 * - `"pop"` — a `popstate` event (back/forward within the SPA).
 * - `"hash"` — a `hashchange` event.
 *
 * @category Core Types
 * @public
 */
export type WebviewNavType = "push" | "replace" | "pop" | "load" | "hash";

/**
 * One navigation event from {@link WebFrame.onNavigate}.
 *
 * @category Core Types
 * @public
 */
export interface WebviewNavigateEvent {
  /** The kind of navigation — see {@link WebviewNavType}. */
  type: WebviewNavType;
  /** The frame's URL after the navigation. */
  url: string;
  /**
   * `true` on the first event reported by a freshly created document — i.e.
   * this event is the result of a full document load, whoever initiated it.
   * `false` for every subsequent event from the same document (SPA route
   * changes, the page's own `replaceState` calls, hash changes).
   *
   * This matters because frameworks commonly call `history.replaceState`
   * while booting, so a single full-page navigation can report a `"replace"`
   * event *before* its `"load"`. Without this flag a consumer tracking its
   * own history stack can't tell that boot-time `"replace"` (a brand-new
   * page — usually a new history entry) apart from a genuine in-page
   * `replaceState` (rewrite the current entry).
   */
  newDocument: boolean;
}

/**
 * A rectangle in frame-relative CSS pixels — the coordinate space
 * `getBoundingClientRect()` returns inside the frame's own document. Used by
 * {@link WebFrame.captureRect} (e.g. for a picked element or a marquee
 * selection) and returned as part of {@link PickedElement}.
 *
 * @category Core Types
 * @public
 */
export interface WebviewRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The result of {@link WebFrame.pickElement} — what the user clicked while
 * picking.
 *
 * @category Core Types
 * @public
 */
export interface PickedElement {
  /** A CSS selector breadcrumb from `<html>` down to the clicked element (tag + up to 2 classes per level). */
  selector: string;
  /** The element's trimmed text content, truncated to 200 characters. */
  text: string;
  /** The element's frame-relative bounding rect — pass to {@link WebFrame.captureRect} to screenshot just this element. */
  rect: WebviewRect;
}

/**
 * A live connection to an embedded frame's content, returned by
 * {@link WebviewService.attach}. Dispose it (or let `ctx.subscriptions`
 * dispose it) when your panel unmounts.
 *
 * @category Consumer Services
 * @public
 */
export interface WebFrame extends Disposable {
  /** The frame's current URL, updated on every {@link onNavigate} event. `null` before the first load. */
  readonly url: string | null;
  /** Subscribe to in-frame navigation — the only way to track SPA route changes and full loads alike. See {@link WebviewNavType}. */
  onNavigate: Event<WebviewNavigateEvent>;
  /**
   * Fires when a navigation lands on what looks like a frame-blocked page —
   * sites sending `X-Frame-Options` / `frame-ancestors` don't error, WebKit
   * (and other engines) just commit an empty document at the target URL, so
   * this is a heuristic (empty title + no body content after load), not a
   * definitive diagnosis. Treat it as "this page probably won't work
   * embedded — offer to open it in a browser instead."
   */
  onBlocked: Event<void>;
  /** Navigate the frame back in its history, if possible. */
  back(): void;
  /** Navigate the frame forward in its history, if possible. */
  forward(): void;
  /** Reload the frame's current page. */
  reload(): void;
  /**
   * Run JavaScript inside the frame and resolve with its result. A single
   * expression's value is returned (e.g. `"document.title"`,
   * `"location.href"`, `"document.querySelectorAll('a').length"`) — matching
   * how a devtools console evaluates. Multi-statement code runs but only
   * returns a value if it ends in an explicit `return`-compatible form.
   * The result must be structured-clone-safe (no DOM nodes, functions, etc.).
   */
  exec<T = unknown>(code: string): Promise<T>;
  /**
   * Enter interactive element-pick mode: the user hovers to highlight and
   * clicks to select, or presses Escape to cancel. Resolves with the picked
   * element, or `null` if cancelled. No timeout — this is inherently
   * user-paced.
   */
  pickElement(): Promise<PickedElement | null>;
  /**
   * Cancel an in-flight {@link pickElement} call — exits pick mode in the
   * frame and resolves the pending `pickElement()` promise with `null`. A
   * no-op if no pick is active (including if it already ended, e.g. via
   * Escape or a click).
   */
  cancelPick(): void;
  /** A native PNG snapshot of the frame's current visible viewport. */
  capture(): Promise<Blob>;
  /** A native PNG snapshot of a frame-relative sub-rect — e.g. a {@link PickedElement.rect} or a marquee selection. */
  captureRect(rect: WebviewRect): Promise<Blob>;
  /** A native PNG snapshot of the frame's entire scrollable document, stitched from scrolled captures. Scroll position is restored afterward. */
  captureFullPage(): Promise<Blob>;
}

/**
 * The webview-bridge domain, exposed as {@link ExtensionContext.webview}.
 * Requires the `"webview"` {@link Permission}.
 *
 * @example
 * ```tsx
 * function MyPanel({ ctx }: { ctx: ExtensionContext }) {
 *   const iframeRef = useRef<HTMLIFrameElement>(null);
 *   const frameRef = useRef<WebFrame | null>(null);
 *
 *   useEffect(() => {
 *     if (!iframeRef.current) return;
 *     const frame = ctx.webview.attach(iframeRef.current);
 *     frameRef.current = frame;
 *     const sub = frame.onNavigate((e) => console.log(e.type, e.url));
 *     return () => { sub.dispose(); frame.dispose(); };
 *   }, []);
 *
 *   return <iframe ref={iframeRef} src="https://example.com" />;
 * }
 * ```
 *
 * @category Consumer Services
 * @public
 */
export interface WebviewService {
  /**
   * Attach the bridge to an iframe your panel owns. The iframe can be
   * cross-origin — that's the point. Returns a {@link WebFrame}; call
   * `.dispose()` (or push it onto `ctx.subscriptions`) when done with it.
   */
  attach(frame: HTMLIFrameElement): WebFrame;
}
