// Silo webview bridge shim — injected into EVERY frame (main + all subframes)
// via Tauri's js_init_script_on_all_frames. Inert everywhere except the direct
// child iframe of a panel that completes the handshake below; nested iframes
// inside a loaded page receive this same script but never get a "hello" (the
// panel only postMessages its own direct iframe.contentWindow), so they never
// acquire a nonce and stay silent — no RPC surface leaks into third-party
// nested content.
//
// Phase 1 (internal / hidden test extension only): this file has no public
// contract yet. Message shapes here are free to change until the SDK surface
// (ctx.webview) ships in Phase 2.
(function () {
  "use strict";

  // Never run in the main Silo window itself.
  if (window === window.top) return;

  // Origins Silo's own webview can run under. Dev server (tauri.conf.json
  // devUrl) plus the two prod custom-protocol origins (macOS/Linux vs
  // Windows). Keep in sync with tauri.conf.json if either changes.
  var TRUSTED_ORIGINS = [
    "http://localhost:1420",
    "tauri://localhost",
    "https://tauri.localhost",
  ];

  var nonce = null; // set only after a validated handshake; gates all outbound posts
  var pickActive = false;
  var pickHighlighted = null;
  var pickPrevOutline = "";
  var pickReqId = null;

  // Nav events (esp. the inner window's own "load") can fire before the
  // panel's handshake round-trip completes — the panel only starts
  // handshaking in reaction to the *outer* iframe's load event, which races
  // this frame's *own* load event. Buffer anything sent before we have a
  // nonce and flush it once "hello" arrives, instead of silently dropping it.
  // Capped: this script runs in every frame, including nested iframes that
  // never get a "hello" — an SPA widget inside one of those would otherwise
  // push nav events into this array forever.
  var pendingOutbox = [];
  var MAX_PENDING_OUTBOX = 50;

  function post(msg) {
    if (!nonce) {
      pendingOutbox.push(msg);
      if (pendingOutbox.length > MAX_PENDING_OUTBOX) pendingOutbox.shift();
      return;
    }
    try {
      msg.__silo_wv = true;
      msg.nonce = nonce;
      window.parent.postMessage(msg, "*");
    } catch (_) {
      /* ignore postMessage failures (e.g. unclonable payload handled by caller) */
    }
  }

  function flushOutbox() {
    var queued = pendingOutbox;
    pendingOutbox = [];
    for (var i = 0; i < queued.length; i++) post(queued[i]);
  }

  // Announce our own (re)injection immediately, unconditionally (no nonce
  // needed — this is what lets the host acquire one). The host previously
  // only re-handshook in reaction to the *outer* iframe element's DOM "load"
  // event, but that event does not reliably fire for navigations initiated
  // *inside* the frame (a same-frame link click, `location.href =`, etc.) —
  // only for the host's own iframe.src reassignments. Since this script runs
  // fresh at document_start on every navigation regardless of what caused
  // it, self-announcing here is the reliable trigger; the host treats it as
  // "this frame has a brand new JS realm, re-handshake."
  try {
    window.parent.postMessage({ __silo_wv: true, type: "announce" }, "*");
  } catch (_) {
    /* ignore */
  }

  function safePost(msg) {
    try {
      post(msg);
    } catch (_) {
      /* structured-clone failure or similar; nothing more we can do */
    }
  }

  // ── navigation reporting ────────────────────────────────────────────────
  function notifyNav(navType) {
    safePost({ type: "nav", navType: navType, url: location.href });
  }

  var _pushState = history.pushState;
  history.pushState = function () {
    var ret = _pushState.apply(this, arguments);
    notifyNav("push");
    return ret;
  };
  var _replaceState = history.replaceState;
  history.replaceState = function () {
    var ret = _replaceState.apply(this, arguments);
    notifyNav("replace");
    return ret;
  };
  window.addEventListener("popstate", function () {
    notifyNav("pop");
  });
  window.addEventListener("hashchange", function () {
    notifyNav("hash");
  });
  window.addEventListener("load", function () {
    notifyNav("load");
  });

  // ── element picking ─────────────────────────────────────────────────────
  function selectorFor(el) {
    var parts = [];
    var cur = el;
    while (cur && cur.tagName) {
      var tag = cur.tagName.toLowerCase();
      var cls = cur.classList
        ? Array.prototype.slice.call(cur.classList, 0, 2).join(".")
        : "";
      parts.unshift(cls ? tag + "." + cls : tag);
      cur = cur.parentElement;
    }
    return parts.join(" > ");
  }

  function onPickMove(e) {
    var el = e.target;
    if (el === pickHighlighted) return;
    if (pickHighlighted) pickHighlighted.style.outline = pickPrevOutline;
    pickHighlighted = el;
    pickPrevOutline = el.style.outline;
    el.style.outline = "2px solid #4f8ef7";
  }

  function endPick(result) {
    if (!pickActive) return;
    pickActive = false;
    document.removeEventListener("mousemove", onPickMove, true);
    document.removeEventListener("click", onPickClick, true);
    document.removeEventListener("keydown", onPickKey, true);
    if (pickHighlighted) {
      pickHighlighted.style.outline = pickPrevOutline;
      pickHighlighted = null;
    }
    try {
      document.body.style.cursor = "";
    } catch (_) {}
    var id = pickReqId;
    pickReqId = null;
    safePost({ type: "resp", id: id, ok: true, result: result });
  }

  function onPickClick(e) {
    e.preventDefault();
    e.stopPropagation();
    var el = e.target;
    var rect = el.getBoundingClientRect();
    endPick({
      selector: selectorFor(el),
      text: (el.textContent || "").trim().slice(0, 200),
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    });
  }

  function onPickKey(e) {
    if (e.key === "Escape") endPick(null);
  }

  function startPick(id) {
    if (pickActive) endPick(null); // cancel any prior pick first
    pickActive = true;
    pickReqId = id;
    try {
      document.body.style.cursor = "crosshair";
    } catch (_) {}
    document.addEventListener("mousemove", onPickMove, true);
    document.addEventListener("click", onPickClick, true);
    document.addEventListener("keydown", onPickKey, true);
  }

  // ── RPC command dispatch ────────────────────────────────────────────────
  function handleCommand(msg) {
    var id = msg.id;
    function ok(result) {
      safePost({ type: "resp", id: id, ok: true, result: result });
    }
    function fail(error) {
      safePost({ type: "resp", id: id, ok: false, error: String(error) });
    }

    switch (msg.cmd) {
      case "exec": {
        try {
          // Prefer returning the value of a single expression (the common
          // case — "document.title", "location.href", etc.), matching how a
          // devtools console evaluates. `new Function(code)` alone runs code
          // as statements with no implicit return, which would silently
          // resolve every expression-only call to null. Multi-statement code
          // (which "return (...)" can't wrap) falls back to plain execution.
          var fn;
          try {
            fn = new Function("return (" + msg.code + ")");
          } catch (_) {
            fn = new Function(msg.code);
          }
          var result = fn();
          ok(result === undefined ? null : result);
        } catch (err) {
          fail(err && err.message ? err.message : String(err));
        }
        break;
      }
      case "pick_start": {
        startPick(id);
        break; // response sent later, from endPick
      }
      case "pick_cancel": {
        endPick(null);
        break;
      }
      case "history": {
        try {
          if (msg.dir === "back") history.back();
          else if (msg.dir === "forward") history.forward();
          ok(null);
        } catch (err) {
          fail(err);
        }
        break;
      }
      case "reload": {
        ok(null);
        location.reload();
        break;
      }
      case "get_metrics": {
        ok({
          scrollX: window.scrollX,
          scrollY: window.scrollY,
          docWidth: document.documentElement.scrollWidth,
          docHeight: document.documentElement.scrollHeight,
          vw: window.innerWidth,
          vh: window.innerHeight,
        });
        break;
      }
      case "scroll_to": {
        window.scrollTo(msg.x || 0, msg.y || 0);
        // Give layout/paint a moment before the host snapshots.
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            ok(null);
          });
        });
        break;
      }
      default: {
        fail("unknown cmd: " + msg.cmd);
      }
    }
  }

  // ── inbound message handling (handshake + commands) ─────────────────────
  window.addEventListener("message", function (event) {
    if (event.source !== window.parent) return;
    if (TRUSTED_ORIGINS.indexOf(event.origin) === -1) return;
    var data = event.data;
    if (!data || data.__silo_wv !== true) return;

    if (data.cmd === "hello") {
      // Handshake: bind to whatever nonce the panel supplies. A fresh hello
      // (e.g. after the panel remounts) simply rebinds — no prior state to
      // protect since nothing is trusted until this point.
      nonce = data.nonce;
      post({ type: "ready" });
      flushOutbox(); // replay any nav events that raced the handshake (e.g. window.load)
      return;
    }

    // Every other inbound command must carry the nonce we handed out.
    if (!nonce || data.nonce !== nonce) return;
    handleCommand(data);
  });
})();
