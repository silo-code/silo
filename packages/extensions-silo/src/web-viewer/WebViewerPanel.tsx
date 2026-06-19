import { useEffect, useRef, useState } from "react";
import type { DockPanelProps, ExtensionContext } from "@silo-code/sdk";
import {
  ArrowLeft,
  ArrowRight,
  ArrowClockwise,
  ArrowSquareOut,
  ProhibitInset,
} from "@phosphor-icons/react";
import { normalizeUrl, pushHistory } from "./web-viewer-model";
import "./WebViewerPanel.css";

interface WebViewerParams {
  url?: string;
  title?: string;
}

interface Props extends DockPanelProps<WebViewerParams> {
  ctx: ExtensionContext;
}

// How long to wait before declaring a navigation blocked.
// X-Frame-Options is determined from response headers (arrives fast), so
// 1.5 s is enough time for the blocked case while not triggering on legit
// slow-loading pages.
const BLOCK_DETECT_MS = 1500;

export function WebViewerPanel({ api, params, ctx }: Props) {
  const initialUrl = params?.url ?? "";
  const [url, setUrl] = useState(initialUrl);
  const [addressBar, setAddressBar] = useState(initialUrl);
  const [history, setHistory] = useState<string[]>(
    initialUrl ? [initialUrl] : [],
  );
  const [historyIndex, setHistoryIndex] = useState(initialUrl ? 0 : -1);
  const [blocked, setBlocked] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const blockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear the pending block-detection timer whenever the component unmounts.
  useEffect(() => () => clearBlockTimer(), []);

  function clearBlockTimer() {
    if (blockTimerRef.current !== null) {
      clearTimeout(blockTimerRef.current);
      blockTimerRef.current = null;
    }
  }

  // Start the timeout that declares a navigation blocked.
  // WebKit does not fire 'load' when X-Frame-Options rejects a frame, so we
  // poll after a short delay instead of relying solely on the load event.
  function startBlockTimer() {
    clearBlockTimer();
    blockTimerRef.current = setTimeout(() => {
      const frame = iframeRef.current;
      if (!frame) return;
      try {
        const href = frame.contentWindow?.location?.href;
        // Still on about:blank after 1.5 s → navigation was blocked.
        if (!href || href === "about:blank") setBlocked(true);
      } catch {
        // SecurityError: cross-origin content loaded — we're fine.
      }
    }, BLOCK_DETECT_MS);
  }

  function navigate(raw: string) {
    const normalized = normalizeUrl(raw);
    if (!normalized) return;
    const next = pushHistory(history, historyIndex, normalized);
    setHistory(next.history);
    setHistoryIndex(next.index);
    setUrl(normalized);
    setAddressBar(normalized);
    setBlocked(false);
    api.updateParameters({ url: normalized });
    startBlockTimer();
  }

  function goBack() {
    if (historyIndex <= 0) return;
    const prev = history[historyIndex - 1];
    setHistoryIndex(historyIndex - 1);
    setUrl(prev);
    setAddressBar(prev);
    setBlocked(false);
    api.updateParameters({ url: prev });
    startBlockTimer();
  }

  function goForward() {
    if (historyIndex >= history.length - 1) return;
    const next = history[historyIndex + 1];
    setHistoryIndex(historyIndex + 1);
    setUrl(next);
    setAddressBar(next);
    setBlocked(false);
    api.updateParameters({ url: next });
    startBlockTimer();
  }

  function refresh() {
    const frame = iframeRef.current;
    if (!frame || !url) return;
    setBlocked(false);
    frame.src = url;
    startBlockTimer();
  }

  function handleLoad() {
    // Load fired — cancel the timeout because we have a concrete result now.
    clearBlockTimer();
    const frame = iframeRef.current;
    if (!frame) return;
    try {
      const href = frame.contentWindow?.location?.href;
      if (!href || href === "about:blank") {
        // Same-origin access to about:blank means the frame was rejected by
        // X-Frame-Options / CSP (WebKit replaces the content with about:blank).
        setBlocked(true);
      } else if (href !== url) {
        // Same-origin redirect; keep address bar in sync.
        setAddressBar(href);
        setUrl(href);
        api.updateParameters({ url: href });
      }
      // href === url → same-origin page loaded correctly.
    } catch {
      // SecurityError: cross-origin content loaded successfully.
    }
  }

  function handleError() {
    clearBlockTimer();
    setBlocked(true);
  }

  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex < history.length - 1;

  return (
    <div className="web-viewer">
      <div className="web-viewer-bar">
        <button
          className="web-viewer-nav-btn"
          onClick={goBack}
          disabled={!canGoBack}
          title="Back"
        >
          <ArrowLeft weight="bold" size={13} />
        </button>
        <button
          className="web-viewer-nav-btn"
          onClick={goForward}
          disabled={!canGoForward}
          title="Forward"
        >
          <ArrowRight weight="bold" size={13} />
        </button>
        <button
          className="web-viewer-nav-btn"
          onClick={refresh}
          disabled={!url}
          title="Refresh"
        >
          <ArrowClockwise weight="bold" size={13} />
        </button>
        <input
          className="web-viewer-url-input"
          type="text"
          value={addressBar}
          onChange={(e) => setAddressBar(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") navigate(addressBar);
            if (e.key === "Escape") setAddressBar(url);
          }}
          onFocus={(e) => e.target.select()}
          placeholder="Enter URL and press Enter"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
        />
        {url && (
          <button
            className="web-viewer-nav-btn"
            onClick={() => void ctx.ui.openExternal(url)}
            title="Open in browser"
          >
            <ArrowSquareOut weight="bold" size={13} />
          </button>
        )}
      </div>
      <div className="web-viewer-content">
        {!url ? (
          <div className="web-viewer-empty">
            <span>Enter a URL above to browse.</span>
          </div>
        ) : (
          <>
            <iframe
              ref={iframeRef}
              className="web-viewer-frame"
              src={url}
              onLoad={handleLoad}
              onError={handleError}
              title="Web Viewer"
            />
            {blocked && (
              <div className="web-viewer-blocked">
                <ProhibitInset size={32} weight="duotone" />
                <p>This page doesn't allow embedding.</p>
                <button
                  className="web-viewer-open-external"
                  onClick={() => void ctx.ui.openExternal(url)}
                >
                  <ArrowSquareOut size={13} weight="bold" />
                  Open in Browser
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
