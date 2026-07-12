import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Permission, WebviewNavigateEvent } from "@silo-code/sdk";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import {
  attachWebviewBridge,
  getScopedWebviewService,
  type WebviewScope,
} from "./webview-service";

// Simulates the shim (webview_bridge.js) posting a message from inside the
// iframe up to the parent — the real transport is cross-realm postMessage,
// which jsdom doesn't wire up between a same-origin iframe and its parent, so
// tests dispatch the "message" event directly with `source` set to the
// iframe's contentWindow (what the listener keys its registry on).
function shimSend(iframe: HTMLIFrameElement, data: Record<string, unknown>) {
  window.dispatchEvent(
    new MessageEvent("message", {
      data: { __silo_wv: true, ...data },
      source: iframe.contentWindow,
    }),
  );
}

function makeIframe(): HTMLIFrameElement {
  const iframe = document.createElement("iframe");
  document.body.appendChild(iframe);
  return iframe;
}

function lastHelloNonce(postMessage: ReturnType<typeof vi.fn>): string {
  const call = postMessage.mock.calls.at(-1);
  return (call?.[0] as { nonce: string }).nonce;
}

/** Handshake an iframe end to end and return its nonce. */
function handshaken(
  iframe: HTMLIFrameElement,
  postMessage: ReturnType<typeof vi.fn>,
): string {
  shimSend(iframe, { type: "announce" });
  const nonce = lastHelloNonce(postMessage);
  shimSend(iframe, { type: "ready", nonce });
  return nonce;
}

/** Find the most recent outbound message with the given `cmd`. */
function findCommand(
  postMessage: ReturnType<typeof vi.fn>,
  cmd: string,
): { id: string; nonce: string; [k: string]: unknown } {
  const call = [...postMessage.mock.calls]
    .reverse()
    .find((c) => (c[0] as { cmd?: string }).cmd === cmd);
  if (!call) throw new Error(`no "${cmd}" command was sent`);
  return call[0] as { id: string; nonce: string };
}

function respondOk(
  iframe: HTMLIFrameElement,
  id: string,
  nonce: string,
  result: unknown,
) {
  shimSend(iframe, { type: "resp", id, ok: true, result, nonce });
}

describe("webview-service: announce / newDocument handshake", () => {
  let iframe: HTMLIFrameElement;
  let postMessage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    iframe = makeIframe();
    postMessage = vi.fn();
    // contentWindow.postMessage is what handshake()/sendCommand() call to
    // talk to the shim; spy on it so tests can read the nonce it generates.
    vi.spyOn(iframe.contentWindow!, "postMessage").mockImplementation(
      postMessage,
    );
  });

  it("re-handshakes on announce, independent of any DOM load event", () => {
    attachWebviewBridge(iframe);
    shimSend(iframe, { type: "announce" });
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ cmd: "hello", nonce: expect.any(String) }),
      "*",
    );
  });

  it("tags only the first nav event after announce as newDocument, not the ones that follow", () => {
    const frame = attachWebviewBridge(iframe);
    const events: WebviewNavigateEvent[] = [];
    frame.onNavigate((e) => events.push(e));

    shimSend(iframe, { type: "announce" });
    const nonce = lastHelloNonce(postMessage);
    shimSend(iframe, { type: "ready", nonce });

    // A single full-page load commonly reports a boot-time `replace` before
    // the `load` fires (VitePress and friends) — both belong to the same
    // fresh document.
    shimSend(iframe, {
      type: "nav",
      navType: "replace",
      url: "https://example.com/",
      nonce,
    });
    shimSend(iframe, {
      type: "nav",
      navType: "load",
      url: "https://example.com/",
      nonce,
    });
    // A subsequent in-page SPA navigation, still the same document.
    shimSend(iframe, {
      type: "nav",
      navType: "push",
      url: "https://example.com/guide/",
      nonce,
    });

    expect(
      events.map((e) => ({ type: e.type, newDocument: e.newDocument })),
    ).toEqual([
      { type: "replace", newDocument: true },
      { type: "load", newDocument: false },
      { type: "push", newDocument: false },
    ]);
  });

  it("marks the first event of a second document newDocument again after a fresh announce", () => {
    const frame = attachWebviewBridge(iframe);
    const events: WebviewNavigateEvent[] = [];
    frame.onNavigate((e) => events.push(e));

    shimSend(iframe, { type: "announce" });
    const firstNonce = lastHelloNonce(postMessage);
    shimSend(iframe, { type: "ready", nonce: firstNonce });
    shimSend(iframe, {
      type: "nav",
      navType: "load",
      url: "https://example.com/",
      nonce: firstNonce,
    });

    // A brand new full-page navigation: the shim re-injects and re-announces.
    shimSend(iframe, { type: "announce" });
    const secondNonce = lastHelloNonce(postMessage);
    shimSend(iframe, { type: "ready", nonce: secondNonce });
    shimSend(iframe, {
      type: "nav",
      navType: "load",
      url: "https://example.org/",
      nonce: secondNonce,
    });

    expect(events.map((e) => e.newDocument)).toEqual([true, true]);
  });

  it("suppresses the handshake's own about:blank load", () => {
    const frame = attachWebviewBridge(iframe);
    const events: WebviewNavigateEvent[] = [];
    frame.onNavigate((e) => events.push(e));

    shimSend(iframe, { type: "announce" });
    const nonce = lastHelloNonce(postMessage);
    shimSend(iframe, { type: "ready", nonce });
    shimSend(iframe, {
      type: "nav",
      navType: "load",
      url: "about:blank",
      nonce,
    });

    expect(events).toEqual([]);
  });

  it("ignores nav messages carrying a stale nonce", () => {
    const frame = attachWebviewBridge(iframe);
    const events: WebviewNavigateEvent[] = [];
    frame.onNavigate((e) => events.push(e));

    shimSend(iframe, { type: "announce" });
    shimSend(iframe, {
      type: "nav",
      navType: "load",
      url: "https://example.com/",
      nonce: "not-the-real-nonce",
    });

    expect(events).toEqual([]);
  });

  it("keeps matching the frame after contentWindow's identity changes across a navigation", () => {
    // Some WebViews (this app's, in practice) don't guarantee the DOM-spec
    // expectation that `iframe.contentWindow` returns the same WindowProxy
    // for the whole lifetime of the element — a real navigation can make it
    // start returning a different object. A lookup keyed by a *cached*
    // window reference would silently stop matching every message from that
    // point on (nav events, title fetches, and RPCs all queue forever with
    // no error). The frame lookup must re-read `iframe.contentWindow` fresh
    // on every message instead of trusting a snapshot taken at attach time.
    const frame = attachWebviewBridge(iframe);
    const events: WebviewNavigateEvent[] = [];
    frame.onNavigate((e) => events.push(e));

    shimSend(iframe, { type: "announce" });
    const firstNonce = lastHelloNonce(postMessage);
    shimSend(iframe, { type: "ready", nonce: firstNonce });
    shimSend(iframe, {
      type: "nav",
      navType: "load",
      url: "https://example.com/",
      nonce: firstNonce,
    });

    // Simulate the WebView swapping in a new WindowProxy for the same
    // iframe element after a navigation. Reuses the same `postMessage` spy
    // so `lastHelloNonce` keeps working against the new "window".
    const newContentWindow = { postMessage } as unknown as Window;
    Object.defineProperty(iframe, "contentWindow", {
      value: newContentWindow,
      configurable: true,
    });

    window.dispatchEvent(
      new MessageEvent("message", {
        data: { __silo_wv: true, type: "announce" },
        source: newContentWindow,
      }),
    );
    expect(postMessage.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({ cmd: "hello", nonce: expect.any(String) }),
    );
    const secondNonce = lastHelloNonce(postMessage);
    expect(secondNonce).not.toBe(firstNonce);

    window.dispatchEvent(
      new MessageEvent("message", {
        data: { __silo_wv: true, type: "ready", nonce: secondNonce },
        source: newContentWindow,
      }),
    );
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          __silo_wv: true,
          type: "nav",
          navType: "load",
          url: "https://example.org/",
          nonce: secondNonce,
        },
        source: newContentWindow,
      }),
    );

    expect(
      events.map((e) => ({ url: e.url, newDocument: e.newDocument })),
    ).toEqual([
      { url: "https://example.com/", newDocument: true },
      { url: "https://example.org/", newDocument: true },
    ]);
  });

  it("stops delivering events once disposed", () => {
    const frame = attachWebviewBridge(iframe);
    const events: WebviewNavigateEvent[] = [];
    frame.onNavigate((e) => events.push(e));

    shimSend(iframe, { type: "announce" });
    const nonce = lastHelloNonce(postMessage);
    shimSend(iframe, { type: "ready", nonce });
    frame.dispose();

    // dispose() removes the registry entry keyed by contentWindow, so a
    // message that arrives afterwards (e.g. an in-flight nav from a frame
    // the panel already tore down) finds no state and is silently dropped.
    shimSend(iframe, {
      type: "nav",
      navType: "load",
      url: "https://example.com/",
      nonce,
    });

    expect(events).toEqual([]);
  });
});

describe("webview-service: pending-RPC rejection on re-handshake", () => {
  let iframe: HTMLIFrameElement;
  let postMessage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    invokeMock.mockReset();
    iframe = makeIframe();
    postMessage = vi.fn();
    vi.spyOn(iframe.contentWindow!, "postMessage").mockImplementation(
      postMessage,
    );
  });

  it("rejects a pending pickElement() when the frame re-handshakes before it resolves", async () => {
    const frame = attachWebviewBridge(iframe);
    handshaken(iframe, postMessage);

    const pick = frame.pickElement();
    findCommand(postMessage, "pick_start"); // sent, never answered

    // A fresh announce is what a renavigation looks like from the host's
    // side — the shim re-injects into whatever document is there now, which
    // isn't the one pick_start was sent to.
    shimSend(iframe, { type: "announce" });

    await expect(pick).rejects.toThrow(/navigated/);
    frame.dispose();
  });

  it("cancelPick() sends pick_cancel without waiting for its own response", () => {
    const frame = attachWebviewBridge(iframe);
    handshaken(iframe, postMessage);

    expect(() => frame.cancelPick()).not.toThrow();
    expect(findCommand(postMessage, "pick_cancel")).toBeDefined();
    frame.dispose();
  });

  it("captureFullPage() rejects instead of hanging when the frame reports zero viewport height", async () => {
    const frame = attachWebviewBridge(iframe);
    const nonce = handshaken(iframe, postMessage);

    const p = frame.captureFullPage();
    const cmd = findCommand(postMessage, "get_metrics");
    respondOk(iframe, cmd.id, nonce, {
      scrollX: 0,
      scrollY: 0,
      docWidth: 800,
      docHeight: 4000,
      vw: 800,
      vh: 0,
    });

    await expect(p).rejects.toThrow(/zero viewport height/);
    expect(invokeMock).not.toHaveBeenCalledWith(
      "webview_snapshot",
      expect.anything(),
    );
    frame.dispose();
  });

  it("dispose() clears a pending RPC's timeout timer instead of leaking it", async () => {
    vi.useFakeTimers();
    try {
      const frame = attachWebviewBridge(iframe);
      handshaken(iframe, postMessage);

      const p = frame.exec("1 + 1");
      findCommand(postMessage, "exec");
      expect(vi.getTimerCount()).toBe(1); // the RPC timeout

      frame.dispose();
      await expect(p).rejects.toThrow(/disposed/);

      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("back()/forward()/reload() don't produce an unhandled rejection when the underlying RPC fails", async () => {
    const frame = attachWebviewBridge(iframe);
    handshaken(iframe, postMessage);

    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      frame.back();
      const cmd = findCommand(postMessage, "history");
      shimSend(iframe, {
        type: "resp",
        id: cmd.id,
        ok: false,
        error: "boom",
        nonce: cmd.nonce,
      });
      await Promise.resolve();
      await Promise.resolve();
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
      frame.dispose();
    }
  });
});

describe("webview-service: onBlocked debounce", () => {
  let iframe: HTMLIFrameElement;
  let postMessage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    invokeMock.mockReset();
    iframe = makeIframe();
    postMessage = vi.fn();
    vi.spyOn(iframe.contentWindow!, "postMessage").mockImplementation(
      postMessage,
    );
  });

  it("does not fire onBlocked if the re-probe finds real content (transient interstitial)", async () => {
    vi.useFakeTimers();
    try {
      const frame = attachWebviewBridge(iframe);
      const nonce = handshaken(iframe, postMessage);
      const onBlocked = vi.fn();
      frame.onBlocked(onBlocked);

      shimSend(iframe, {
        type: "nav",
        navType: "load",
        url: "https://example.com/",
        nonce,
      });
      const probe1 = findCommand(postMessage, "exec");
      respondOk(iframe, probe1.id, nonce, true); // looks empty on first read

      await vi.advanceTimersByTimeAsync(500); // past the re-probe delay

      const probe2 = findCommand(postMessage, "exec");
      expect(probe2.id).not.toBe(probe1.id);
      respondOk(iframe, probe2.id, nonce, false); // real content landed since
      await vi.advanceTimersByTimeAsync(0);

      expect(onBlocked).not.toHaveBeenCalled();
      frame.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("fires onBlocked once the re-probe confirms the page is still empty", async () => {
    vi.useFakeTimers();
    try {
      const frame = attachWebviewBridge(iframe);
      const nonce = handshaken(iframe, postMessage);
      const onBlocked = vi.fn();
      frame.onBlocked(onBlocked);

      shimSend(iframe, {
        type: "nav",
        navType: "load",
        url: "https://blocked.example/",
        nonce,
      });
      const probe1 = findCommand(postMessage, "exec");
      respondOk(iframe, probe1.id, nonce, true);

      await vi.advanceTimersByTimeAsync(500);

      const probe2 = findCommand(postMessage, "exec");
      respondOk(iframe, probe2.id, nonce, true); // still empty
      await vi.advanceTimersByTimeAsync(0);

      expect(onBlocked).toHaveBeenCalledTimes(1);
      frame.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("getScopedWebviewService", () => {
  function scope(opts: {
    trusted?: boolean;
    permissions?: Permission[];
  }): WebviewScope {
    return {
      trusted: opts.trusted ?? false,
      permissions: new Set(opts.permissions ?? []),
    };
  }

  it("throws synchronously on attach() when untrusted and missing the webview permission", () => {
    const iframe = makeIframe();
    const svc = getScopedWebviewService(scope({}));
    expect(() => svc.attach(iframe)).toThrow(/"webview" permission/);
  });

  it("allows attach() when trusted, even without the permission declared", () => {
    const iframe = makeIframe();
    const svc = getScopedWebviewService(scope({ trusted: true }));
    const frame = svc.attach(iframe);
    expect(frame).toBeDefined();
    frame.dispose();
  });

  it("allows attach() when the webview permission is granted", () => {
    const iframe = makeIframe();
    const svc = getScopedWebviewService(scope({ permissions: ["webview"] }));
    const frame = svc.attach(iframe);
    expect(frame).toBeDefined();
    frame.dispose();
  });

  it("re-checks the permission on every capability, not just attach()", () => {
    const iframe = makeIframe();
    const permissions = new Set<Permission>(["webview"]);
    const svc = getScopedWebviewService({ trusted: false, permissions });
    const frame = svc.attach(iframe);

    expect(() => frame.back()).not.toThrow();

    // Revoked after attach (e.g. the extension is reactivated with a
    // narrower manifest) — every capability on the already-minted handle
    // should stop working too, not just future attach() calls.
    permissions.delete("webview");
    expect(() => frame.back()).toThrow(/"webview" permission/);
    expect(() => frame.exec("1")).toThrow(/"webview" permission/);
    expect(() => frame.pickElement()).toThrow(/"webview" permission/);
    expect(() => frame.captureFullPage()).toThrow(/"webview" permission/);

    frame.dispose();
  });

  it("exempts dispose() and the read-only url/onNavigate/onBlocked members from the permission check", () => {
    const iframe = makeIframe();
    const permissions = new Set<Permission>(["webview"]);
    const svc = getScopedWebviewService({ trusted: false, permissions });
    const frame = svc.attach(iframe);
    permissions.delete("webview");

    expect(() => frame.url).not.toThrow();
    expect(() => frame.onNavigate(() => {})).not.toThrow();
    expect(() => frame.onBlocked(() => {})).not.toThrow();
    expect(() => frame.dispose()).not.toThrow();
  });
});
