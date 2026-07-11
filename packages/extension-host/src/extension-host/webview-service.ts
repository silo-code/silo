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
// listener multiplexes every attached frame, keyed by `event.source` (the
// iframe's stable `contentWindow` WindowProxy — it survives cross-origin
// navigations, only the document behind it changes).
//
// `attachWebviewBridge` is the raw, unscoped entry point; `getScopedWebviewService`
// (bottom of this file) is what `createContext` actually hands out on
// `ctx.webview` — it gates `attach()` behind the `"webview"` permission for
// third-party extensions. Trusted (bundled) extensions bypass the check, same
// as `ctx.files`/`ctx.process`'s trust model.

const HANDSHAKE_TIMEOUT_MS = 5_000;
const RPC_TIMEOUT_MS = 8_000;

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

/** Probe an emptiness signature after a full-page load — see the call site's comment. */
async function checkIfBlocked(state: FrameState): Promise<void> {
  try {
    const isEmpty = await sendCommand<boolean>(state, "exec", {
      code: "!document.title && (!document.body || document.body.children.length === 0)",
    });
    if (isEmpty) state.blockedEmitter.fire();
  } catch {
    /* an exec failure here isn't itself a blocked signal (e.g. a stale/torn-down frame) */
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

async function captureViaBackend(rect: WebviewRect): Promise<Blob> {
  const buf = await invoke<ArrayBuffer>("webview_snapshot", {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  });
  return new Blob([buf], { type: "image/png" });
}

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
    back() {
      void sendCommand(state, "history", { dir: "back" });
    },
    forward() {
      void sendCommand(state, "history", { dir: "forward" });
    },
    reload() {
      void sendCommand(state, "reload", {});
    },
    exec<T>(code: string) {
      return sendCommand<T>(state, "exec", { code });
    },
    pickElement() {
      return sendCommand<PickedElement | null>(state, "pick_start", {}, null);
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

      const frameRect = frameRectInWindow();
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(metrics.docWidth);
      canvas.height = Math.ceil(metrics.docHeight);
      const ctx = canvas.getContext("2d");
      if (!ctx)
        throw new Error("webview bridge: 2D canvas context unavailable");

      try {
        for (let y = 0; y < metrics.docHeight; y += metrics.vh) {
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
      registry.delete(state);
      for (const [id, pending] of state.pending) {
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

/**
 * `ctx.webview` as handed to an extension by `createContext` — gates
 * `attach()` behind the `"webview"` permission for third-party extensions
 * (trusted/bundled extensions are unscoped, same trust model as
 * `ctx.files`/`ctx.process`). Denied calls throw synchronously rather than
 * returning a handle whose methods all reject — there's no partial-access
 * story for this capability the way there is for path-scoped fs/process.
 */
export function getScopedWebviewService(scope: WebviewScope): WebviewService {
  return {
    attach(frame: HTMLIFrameElement): WebFrame {
      if (!scope.trusted && !scope.permissions.has("webview")) {
        throw new Error(
          'ctx.webview.attach() requires the "webview" permission — declare it in the extension manifest.',
        );
      }
      return attachWebviewBridge(frame);
    },
  };
}
