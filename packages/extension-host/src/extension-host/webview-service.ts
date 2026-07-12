import { invoke } from "@tauri-apps/api/core";
import type {
  Permission,
  WebviewService,
  WebFrame,
  WebviewNavType,
  WebviewNavigateEvent,
  WebviewRect,
  PickedElement,
} from "@silo-code/sdk";
import { EventEmitter } from "./event-emitter";

// The implementation behind `ctx.webview` (see
// docs/proposals/0011-iframe-navigation-events.md). Talks to the shim
// injected into every frame by the Rust-side `webview_bridge` plugin
// (apps/desktop/src-tauri/src/webview_bridge.js). One global `message`
// listener multiplexes every attached frame, matching `event.source` against
// each attached frame's *current* `iframe.contentWindow` (see `findState`) —
// that WindowProxy is not guaranteed stable across navigations in this
// WebView, so nothing caches it as a lookup key.
//
// `attachWebviewBridge` is the raw, unscoped entry point; `getScopedWebviewService`
// (bottom of this file) is what `createContext` actually hands out on
// `ctx.webview` — it gates `attach()` behind the `"webview"` permission for
// third-party extensions. Trusted (bundled) extensions bypass the check, same
// as `ctx.files`/`ctx.process`'s trust model.

const HANDSHAKE_TIMEOUT_MS = 5_000;
const RPC_TIMEOUT_MS = 8_000;
const BLOCKED_RECHECK_DELAY_MS = 400;

interface OutMessage {
  __silo_wv: true;
  cmd?: string;
  id?: string;
  nonce?: string | null;
  [key: string]: unknown;
}

interface PendingRpc {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout> | null;
}

interface FrameState {
  iframe: HTMLIFrameElement;
  nonce: string | null;
  ready: boolean;
  url: string | null;
  navEmitter: EventEmitter<WebviewNavigateEvent>;
  blockedEmitter: EventEmitter<void>;
  pending: Map<string, PendingRpc>;
  queued: (() => void)[];
  handshakeTimer: ReturnType<typeof setTimeout> | null;
  blockedRecheckTimer: ReturnType<typeof setTimeout> | null;
  nextId: number;
  disposed: boolean;
  /**
   * Set by the shim's "announce" (a fresh JS realm = a fresh document),
   * consumed by the next nav event fired to consumers — that event carries
   * `newDocument: true`, everything after it from the same document `false`.
   */
  pendingNewDocument: boolean;
}

// Every currently-attached frame. NOT keyed by `iframe.contentWindow` — that
// WindowProxy is not actually stable across navigations in this WebView
// (contrary to the DOM spec's usual guarantee for same-origin same-process
// frames): after a real navigation, `iframe.contentWindow` can start
// returning a *different* object than the one captured at attach time. A Map
// keyed by the old reference would silently stop matching `event.source` on
// every message after that point — nav events, title fetches, and RPCs all
// queue forever with no error, since nothing ever looks broken from the
// caller's side (the promises just never resolve). Comparing
// `state.iframe.contentWindow` fresh, per message, is immune to that.
const registry = new Set<FrameState>();
let listenerInstalled = false;

function findState(source: Window): FrameState | undefined {
  for (const state of registry) {
    if (state.iframe.contentWindow === source) return state;
  }
  return undefined;
}

function installListener() {
  if (listenerInstalled) return;
  listenerInstalled = true;
  // Inbound replies legitimately come from the embedded page's own origin
  // (that's the whole point of the bridge), so origin can't gate them the
  // way the shim gates *its* inbound commands. The real boundary here is
  // `event.source` matching a frame we actually attached to, combined with
  // the per-handshake nonce below — both are unforgeable by page content.
  window.addEventListener("message", (event: MessageEvent) => {
    const state = findState(event.source as Window);
    if (!state || state.disposed) return;
    const data = event.data as Record<string, unknown> | null;
    if (!data || data.__silo_wv !== true) return;

    // Self-announcement, sent unconditionally (no nonce yet) the instant the
    // shim is (re)injected — the sole, reliable "this frame has a fresh JS
    // realm" signal, and the only trigger for (re)handshaking (see the
    // registration comment in attachWebviewBridge for why the outer iframe
    // element's own DOM "load" event isn't used for this).
    if (data.type === "announce") {
      state.pendingNewDocument = true;
      handshake(state);
      return;
    }

    if (typeof data.nonce !== "string" || data.nonce !== state.nonce) return;

    if (data.type === "ready") {
      state.ready = true;
      if (state.handshakeTimer !== null) {
        clearTimeout(state.handshakeTimer);
        state.handshakeTimer = null;
      }
      const queued = state.queued;
      state.queued = [];
      for (const send of queued) send();
      return;
    }

    if (data.type === "nav") {
      // The bridge's own handshake targets the iframe before any real URL is
      // set, so a spurious "load" for about:blank fires on every attach —
      // implementation noise, never a page the consumer actually navigated
      // to. Suppress it here so no consumer has to special-case it (and so
      // it can't false-positive the frame-blocked emptiness probe below,
      // which would otherwise see about:blank's trivially-empty document and
      // report every fresh, empty frame as "blocked").
      if (data.url === "about:blank") return;

      state.url = data.url as string;
      const newDocument = state.pendingNewDocument;
      state.pendingNewDocument = false;
      state.navEmitter.fire({
        type: data.navType as WebviewNavType,
        url: data.url as string,
        newDocument,
      });
      // A full-page load (not an SPA route change) is the point to check for
      // frame-blocking: sites sending X-Frame-Options/frame-ancestors don't
      // error — WebKit just commits an empty document at the target URL
      // (readyState "complete", empty title/body) and our all-frames shim
      // dutifully reports that commit as a normal "load". There's no error
      // event to catch, so an emptiness probe is the only available signal.
      if (data.navType === "load") void checkIfBlocked(state);
      return;
    }

    if (data.type === "resp") {
      const id = data.id as string;
      const pending = state.pending.get(id);
      if (!pending) return;
      state.pending.delete(id);
      if (pending.timer !== null) clearTimeout(pending.timer);
      if (data.ok) pending.resolve(data.result);
      else pending.reject(new Error(String(data.error)));
    }
  });
}

function handshake(state: FrameState) {
  // A new handshake means the previous document — and everything in flight
  // to it — is gone. Reject stale pending RPCs and drop anything still
  // queued (not yet dispatched) rather than letting them hang until their
  // own timeout (or forever, for calls like pickElement() that have none),
  // or silently fire against the *new* document once it becomes ready.
  state.queued = [];
  for (const [id, pending] of state.pending) {
    if (pending.timer !== null) clearTimeout(pending.timer);
    pending.reject(
      new Error(
        "webview bridge: frame navigated before this request completed",
      ),
    );
    state.pending.delete(id);
  }
  if (state.blockedRecheckTimer !== null) {
    clearTimeout(state.blockedRecheckTimer);
    state.blockedRecheckTimer = null;
  }

  const nonce =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `wv-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  state.nonce = nonce;
  state.ready = false;
  if (state.handshakeTimer !== null) clearTimeout(state.handshakeTimer);
  state.handshakeTimer = setTimeout(() => {
    if (state.ready || state.disposed) return;
    // Queued sends never fired (we never became ready); reject the RPCs they
    // belong to directly rather than trying to invoke the closures.
    state.queued = [];
    for (const [id, pending] of state.pending) {
      pending.reject(
        new Error(
          "webview bridge: handshake timed out (page may block embedding or postMessage)",
        ),
      );
      state.pending.delete(id);
    }
  }, HANDSHAKE_TIMEOUT_MS);

  try {
    state.iframe.contentWindow?.postMessage(
      { __silo_wv: true, cmd: "hello", nonce } satisfies OutMessage,
      "*",
    );
  } catch {
    /* iframe not ready yet; the load listener will retry */
  }
}

const EMPTINESS_PROBE =
  "!document.title && (!document.body || document.body.children.length === 0)";

/** Probe an emptiness signature after a full-page load — see the call site's comment. */
async function checkIfBlocked(state: FrameState): Promise<void> {
  if (state.blockedRecheckTimer !== null) {
    clearTimeout(state.blockedRecheckTimer);
    state.blockedRecheckTimer = null;
  }
  try {
    const isEmpty = await sendCommand<boolean>(state, "exec", {
      code: EMPTINESS_PROBE,
    });
    if (!isEmpty) return;
    // A single empty-document reading can be a transient interstitial (a
    // meta-refresh or JS redirector, common for short-link/OAuth pages)
    // rather than genuine frame-blocking — a truly blocked page stays empty
    // indefinitely, a redirector doesn't. Re-probe once before firing
    // onBlocked instead of trusting the first reading.
    state.blockedRecheckTimer = setTimeout(() => {
      state.blockedRecheckTimer = null;
      void recheckBlocked(state);
    }, BLOCKED_RECHECK_DELAY_MS);
  } catch {
    /* an exec failure here isn't itself a blocked signal (e.g. a stale/torn-down frame) */
  }
}

async function recheckBlocked(state: FrameState): Promise<void> {
  if (state.disposed) return;
  try {
    const isEmpty = await sendCommand<boolean>(state, "exec", {
      code: EMPTINESS_PROBE,
    });
    if (isEmpty) state.blockedEmitter.fire();
  } catch {
    /* frame torn down or navigated mid-recheck; not itself a blocked signal */
  }
}

function sendCommand<T>(
  state: FrameState,
  cmd: string,
  args: Record<string, unknown>,
  timeoutMs: number | null = RPC_TIMEOUT_MS,
): Promise<T> {
  return new Promise((resolve, reject) => {
    if (state.disposed) {
      reject(new Error("webview bridge: frame handle disposed"));
      return;
    }
    const id = String(++state.nextId);
    const timer =
      timeoutMs === null
        ? null
        : setTimeout(() => {
            state.pending.delete(id);
            reject(
              new Error(
                `webview bridge: "${cmd}" timed out after ${timeoutMs}ms`,
              ),
            );
          }, timeoutMs);
    state.pending.set(id, {
      resolve: resolve as (value: unknown) => void,
      reject,
      timer,
    });

    const send = () => {
      try {
        state.iframe.contentWindow?.postMessage(
          {
            __silo_wv: true,
            cmd,
            id,
            nonce: state.nonce,
            ...args,
          } satisfies OutMessage,
          "*",
        );
      } catch (err) {
        state.pending.delete(id);
        if (timer !== null) clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };

    if (state.ready) send();
    else state.queued.push(send);
  });
}

/**
 * Fire-and-forget send, for commands whose response (if any) isn't routed
 * back to their own id — `pick_cancel`'s ack rides on the `pick_start` it
 * cancels (see `endPick` in webview_bridge.js), so tracking it in
 * `state.pending` like a normal RPC would just leak a pending entry that
 * times out unanswered 8 seconds later.
 */
function postCommand(
  state: FrameState,
  cmd: string,
  args: Record<string, unknown>,
): void {
  const send = () => {
    try {
      state.iframe.contentWindow?.postMessage(
        {
          __silo_wv: true,
          cmd,
          nonce: state.nonce,
          ...args,
        } satisfies OutMessage,
        "*",
      );
    } catch {
      /* frame gone; nothing pending to clean up for a fire-and-forget send */
    }
  };
  if (state.ready) send();
  else state.queued.push(send);
}

async function captureViaBackend(rect: WebviewRect): Promise<Blob> {
  const buf = await invoke<ArrayBuffer>("webview_snapshot", {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  });
  return new Blob([buf], { type: "image/png" });
}

// A full-page capture stitches together bands captured at different scroll
// positions — any `position: fixed`/`sticky` element (a sticky nav header,
// a floating "back to top" button, etc.) stays visually pinned across every
// one of those scroll positions, so it ends up baked into the stitched
// image once per band instead of once. The call site only applies this
// starting with the *second* band: the first is captured at the top of the
// page before anything is hidden, so a top-pinned element still lands in
// the stitched image — once, in its natural spot — same as in a normal
// screenshot; hiding it only for the bands where it would otherwise repeat.
// `visibility: hidden` rather than `display: none` so it can't shift layout
// (a `position: sticky` element still occupies its normal-flow box) —
// `metrics.docHeight`/the band math must stay valid throughout. State lives
// on a page-global rather than coming back over the RPC channel: DOM
// elements aren't structured-cloneable across postMessage.
const HIDE_FIXED_STICKY_CODE = `(function(){
  var hidden = [];
  var all = document.querySelectorAll("*");
  for (var i = 0; i < all.length; i++) {
    var el = all[i];
    var cs = getComputedStyle(el);
    if (cs.position === "fixed" || cs.position === "sticky") {
      hidden.push({ el: el, prevVisibility: el.style.visibility, prevPriority: el.style.getPropertyPriority("visibility") });
      el.style.setProperty("visibility", "hidden", "important");
    }
  }
  window.__siloCaptureHiddenEls = hidden;
  return hidden.length;
})()`;

const RESTORE_FIXED_STICKY_CODE = `(function(){
  var hidden = window.__siloCaptureHiddenEls || [];
  for (var i = 0; i < hidden.length; i++) {
    var entry = hidden[i];
    if (entry.prevVisibility) entry.el.style.setProperty("visibility", entry.prevVisibility, entry.prevPriority || "");
    else entry.el.style.removeProperty("visibility");
  }
  window.__siloCaptureHiddenEls = null;
  return hidden.length;
})()`;

/** Attach the bridge to an iframe. Call `dispose()` on the returned handle when the panel unmounts. */
export function attachWebviewBridge(iframe: HTMLIFrameElement): WebFrame {
  installListener();

  const state: FrameState = {
    iframe,
    nonce: null,
    ready: false,
    url: null,
    navEmitter: new EventEmitter<WebviewNavigateEvent>(),
    blockedEmitter: new EventEmitter<void>(),
    pending: new Map(),
    queued: [],
    handshakeTimer: null,
    blockedRecheckTimer: null,
    nextId: 0,
    disposed: false,
    pendingNewDocument: false,
  };

  // Registering once here (rather than re-registering `iframe.contentWindow`
  // on every "load") is sufficient — `findState` looks up by comparing
  // `state.iframe.contentWindow` fresh on every message rather than relying
  // on a cached identity, so it doesn't matter that the WindowProxy behind
  // `iframe.contentWindow` can change across navigations. Actual
  // (re)handshaking is triggered by the shim's own "announce" self-report in
  // installListener's message handler, not from here: the outer iframe
  // element's DOM "load" event used to drive it, but that event doesn't
  // reliably fire for navigations initiated *inside* the frame (a link
  // click, `location.href =`), and — worse — calling handshake() a second
  // time from a stale "load" after "announce" already handshook correctly
  // would silently invalidate the nonce out from under a message already in
  // flight with the (correct) earlier one.
  registry.add(state);

  function frameRectInWindow(): WebviewRect {
    const r = iframe.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  }

  const handle: WebFrame = {
    get url() {
      return state.url;
    },
    onNavigate(listener) {
      return state.navEmitter.event(listener);
    },
    onBlocked(listener) {
      return state.blockedEmitter.event(listener);
    },
    // These three are `void`-returning by design (see WebFrame's TSDoc) — the
    // caller has no handle to observe a failure, so a rejection (disposal,
    // timeout, a navigation racing this very command) must be swallowed here
    // rather than left as an unhandled rejection with nowhere to go.
    back() {
      sendCommand(state, "history", { dir: "back" }).catch(() => {});
    },
    forward() {
      sendCommand(state, "history", { dir: "forward" }).catch(() => {});
    },
    reload() {
      sendCommand(state, "reload", {}).catch(() => {});
    },
    exec<T>(code: string) {
      return sendCommand<T>(state, "exec", { code });
    },
    pickElement() {
      return sendCommand<PickedElement | null>(state, "pick_start", {}, null);
    },
    cancelPick() {
      postCommand(state, "pick_cancel", {});
    },
    capture() {
      return captureViaBackend(frameRectInWindow());
    },
    captureRect(rect: WebviewRect) {
      const frameRect = frameRectInWindow();
      return captureViaBackend({
        x: frameRect.x + rect.x,
        y: frameRect.y + rect.y,
        width: rect.width,
        height: rect.height,
      });
    },
    async captureFullPage() {
      const metrics = await sendCommand<{
        scrollX: number;
        scrollY: number;
        docWidth: number;
        docHeight: number;
        vw: number;
        vh: number;
      }>(state, "get_metrics", {});

      if (metrics.vh <= 0) {
        throw new Error(
          "webview bridge: captureFullPage() failed — frame has zero viewport height (is the panel visible and laid out?)",
        );
      }

      const frameRect = frameRectInWindow();
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(metrics.docWidth);
      canvas.height = Math.ceil(metrics.docHeight);
      const ctx = canvas.getContext("2d");
      if (!ctx)
        throw new Error("webview bridge: 2D canvas context unavailable");

      // The very first band is captured at the top of the page (y=0) with
      // fixed/sticky elements NOT yet hidden — so a top-pinned header lands
      // in the stitched image once, in its natural position, exactly like a
      // normal screenshot. Only bands after that hide them (right before
      // scrolling away from the top), since those are the ones that would
      // otherwise re-bake the same pinned content in on top of new page
      // content underneath it.
      let hidFixedSticky = false;
      try {
        for (let y = 0; y < metrics.docHeight; y += metrics.vh) {
          if (y > 0 && !hidFixedSticky) {
            hidFixedSticky = true;
            await sendCommand(state, "exec", {
              code: HIDE_FIXED_STICKY_CODE,
            }).catch(() => {});
          }
          await sendCommand(state, "scroll_to", { x: 0, y });
          const bandHeight = Math.min(metrics.vh, metrics.docHeight - y);
          const blob = await captureViaBackend({
            x: frameRect.x,
            y: frameRect.y,
            width: Math.min(metrics.vw, frameRect.width),
            height: bandHeight,
          });
          const bitmap = await createImageBitmap(blob);
          ctx.drawImage(bitmap, 0, y);
          bitmap.close();
        }
      } finally {
        if (hidFixedSticky) {
          await sendCommand(state, "exec", {
            code: RESTORE_FIXED_STICKY_CODE,
          }).catch(() => {});
        }
        await sendCommand(state, "scroll_to", {
          x: metrics.scrollX,
          y: metrics.scrollY,
        }).catch(() => {});
      }

      return await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else
            reject(
              new Error(
                "webview bridge: full-page stitch failed to encode PNG",
              ),
            );
        }, "image/png");
      });
    },
    dispose() {
      if (state.disposed) return;
      state.disposed = true;
      if (state.handshakeTimer !== null) clearTimeout(state.handshakeTimer);
      if (state.blockedRecheckTimer !== null)
        clearTimeout(state.blockedRecheckTimer);
      registry.delete(state);
      for (const [id, pending] of state.pending) {
        if (pending.timer !== null) clearTimeout(pending.timer);
        pending.reject(new Error("webview bridge: frame handle disposed"));
        state.pending.delete(id);
      }
      state.navEmitter.dispose();
      state.blockedEmitter.dispose();
    },
  };

  return handle;
}

/** What `getScopedWebviewService` needs to decide whether `attach()` is allowed. */
export interface WebviewScope {
  /** First-party (bundled) extensions bypass the permission check. */
  readonly trusted: boolean;
  readonly permissions: ReadonlySet<Permission>;
}

function assertWebviewPermission(scope: WebviewScope): void {
  if (!scope.trusted && !scope.permissions.has("webview")) {
    throw new Error(
      'ctx.webview requires the "webview" permission — declare it in the extension manifest.',
    );
  }
}

/**
 * Wrap a raw {@link WebFrame} so every method re-checks the `"webview"`
 * permission against `scope`, not just the initial `attach()` call — mirrors
 * `scopeProcessService`'s per-call `guardCwd` in process-service.ts, rather
 * than gating the capability once and handing out an unscoped handle.
 * `dispose()` and the read-only `url`/event members are exempt: tearing down
 * or observing an already-attached frame isn't a new grant of access.
 */
function scopeWebFrame(frame: WebFrame, scope: WebviewScope): WebFrame {
  return {
    get url() {
      return frame.url;
    },
    onNavigate: (listener) => frame.onNavigate(listener),
    onBlocked: (listener) => frame.onBlocked(listener),
    back() {
      assertWebviewPermission(scope);
      frame.back();
    },
    forward() {
      assertWebviewPermission(scope);
      frame.forward();
    },
    reload() {
      assertWebviewPermission(scope);
      frame.reload();
    },
    exec<T = unknown>(code: string) {
      assertWebviewPermission(scope);
      return frame.exec<T>(code);
    },
    pickElement() {
      assertWebviewPermission(scope);
      return frame.pickElement();
    },
    cancelPick() {
      assertWebviewPermission(scope);
      frame.cancelPick();
    },
    capture() {
      assertWebviewPermission(scope);
      return frame.capture();
    },
    captureRect(rect) {
      assertWebviewPermission(scope);
      return frame.captureRect(rect);
    },
    captureFullPage() {
      assertWebviewPermission(scope);
      return frame.captureFullPage();
    },
    dispose() {
      frame.dispose();
    },
  };
}

/**
 * `ctx.webview` as handed to an extension by `createContext` — gates every
 * capability behind the `"webview"` permission for third-party extensions
 * (trusted/bundled extensions are unscoped, same trust model as
 * `ctx.files`/`ctx.process`). `attach()` throws synchronously when denied;
 * a subsequent revocation instead surfaces as each individual method
 * throwing/rejecting, since a WebFrame can outlive the scope it was
 * attached under (e.g. a dock panel that isn't torn down promptly when its
 * owning extension reloads).
 */
export function getScopedWebviewService(scope: WebviewScope): WebviewService {
  return {
    attach(frame: HTMLIFrameElement): WebFrame {
      assertWebviewPermission(scope);
      return scopeWebFrame(attachWebviewBridge(frame), scope);
    },
  };
}
