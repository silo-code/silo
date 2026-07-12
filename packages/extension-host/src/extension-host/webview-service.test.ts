import { describe, it, expect, vi, beforeEach } from "vitest";
import type { WebviewNavigateEvent } from "@silo-code/sdk";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { attachWebviewBridge } from "./webview-service";

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
