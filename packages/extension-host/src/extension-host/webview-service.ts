import { invoke } from "@tauri-apps/api/core";
import type { Disposable } from "@silo-code/sdk";
import { EventEmitter } from "./event-emitter";

// Phase 1 of the `ctx.webview` iframe bridge (see
// docs/proposals/0011-iframe-navigation-events.md). Internal only — this
// module has no public SDK contract yet and is consumed directly by the
// hidden `core.webview-bridge-test` panel while the bridge is being proven
// out on all three platforms. The shape here will likely change before it
// becomes `ctx.webview` in Phase 2.
//
// Talks to the shim injected into every frame by the Rust-side
// `webview_bridge` plugin (apps/desktop/src-tauri/src/webview_bridge.js).
// One global `message` listener multiplexes every attached frame, keyed by
// `event.source` (the iframe's stable `contentWindow` WindowProxy — it
// survives cross-origin navigations, only the document behind it changes).

export type WebviewNavType = "push" | "replace" | "pop" | "load" | "hash";

export interface WebviewNavigateEvent {
  type: WebviewNavType;
  url: string;
}

export interface WebviewRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PickedElement {
  selector: string;
  text: string;
  rect: WebviewRect;
}

export interface WebviewFrameHandle extends Disposable {
  readonly url: string | null;
  onNavigate(listener: (e: WebviewNavigateEvent) => void): Disposable;
  /**
   * Fires when a handshake never completes after a navigation — the strongest
   * available signal that the page refused to load in an iframe (e.g.
   * `X-Frame-Options: DENY` / `frame-ancestors 'none'`, as github.com and
   * many other sites send). The network layer blocks these before any script
   * runs, so there's no error event to catch — this is a timeout heuristic,
   * not a definitive diagnosis. Consumers should treat it as "probably
   * frame-blocked; suggest opening in a browser instead."
   */
  onBlocked(listener: () => void): Disposable;
  back(): void;
  forward(): void;
  reload(): void;
  /** Run code inside the frame; resolves with its structured-clone-safe result. */
  exec<T = unknown>(code: string): Promise<T>;
  /** Interactive element pick; resolves null on Escape/cancel. No timeout — inherently user-paced. */
  pickElement(): Promise<PickedElement | null>;
  /** Native PNG snapshot of the frame's current visible rect. */
  capture(): Promise<Blob>;
  /** Native PNG snapshot of a frame-relative sub-rect (e.g. a picked element, or a marquee selection). */
  captureRect(rect: WebviewRect): Promise<Blob>;
  /** Scroll-and-stitch PNG snapshot of the frame's entire scrollable document. */
  captureFullPage(): Promise<Blob>;
}

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
}

const registry = new Map<Window, FrameState>();
let listenerInstalled = false;

function installListener() {
  if (listenerInstalled) return;
  listenerInstalled = true;
  // Inbound replies legitimately come from the embedded page's own origin
  // (that's the whole point of the bridge), so origin can't gate them the
  // way the shim gates *its* inbound commands. The real boundary here is
  // `event.source` matching a frame we actually attached to, combined with
  // the per-handshake nonce below — both are unforgeable by page content.
  window.addEventListener("message", (event: MessageEvent) => {
    const state = registry.get(event.source as Window);
    if (!state || state.disposed) return;
    const data = event.data as Record<string, unknown> | null;
    if (!data || data.__silo_wv !== true) return;
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
      state.url = data.url as string;
      state.navEmitter.fire({
        type: data.navType as WebviewNavType,
        url: data.url as string,
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
export function attachWebviewBridge(
  iframe: HTMLIFrameElement,
): WebviewFrameHandle {
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
  };

  const onLoad = () => {
    if (!iframe.contentWindow) return;
    registry.set(iframe.contentWindow, state);
    handshake(state);
  };
  iframe.addEventListener("load", onLoad);
  // The iframe may already be loaded (e.g. src was set before attach ran).
  if (iframe.contentWindow) {
    registry.set(iframe.contentWindow, state);
    handshake(state);
  }

  function frameRectInWindow(): WebviewRect {
    const r = iframe.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  }

  const handle: WebviewFrameHandle = {
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
      iframe.removeEventListener("load", onLoad);
      if (state.handshakeTimer !== null) clearTimeout(state.handshakeTimer);
      if (iframe.contentWindow) registry.delete(iframe.contentWindow);
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
