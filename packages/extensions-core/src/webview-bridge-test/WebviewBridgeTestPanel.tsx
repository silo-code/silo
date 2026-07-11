import { useEffect, useRef, useState } from "react";
import type { DockPanelProps, ExtensionContext } from "@silo-code/sdk";
import {
  attachWebviewBridge,
  type WebviewFrameHandle,
  type WebviewRect,
} from "@silo-code/extension-host/internal";
import "./WebviewBridgeTestPanel.css";

interface Props extends DockPanelProps {
  ctx: ExtensionContext;
}

interface LogLine {
  id: number;
  text: string;
}

interface Marquee {
  startX: number;
  startY: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

let logCounter = 0;

// Internal diagnostic panel for Phase 1 of the ctx.webview bridge (see
// docs/proposals/0011-iframe-navigation-events.md). Not registered on any
// "add panel" menu — reachable only via the "Developer: Webview Bridge Test"
// command — so it never shows up for ordinary users. Exists purely to prove
// out shim injection, nav events, exec, element picking, and native snapshot
// capture against real cross-origin iframes before any of this becomes a
// public SDK surface.
export function WebviewBridgeTestPanel({ ctx }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const handleRef = useRef<WebviewFrameHandle | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const [addressBar, setAddressBar] = useState("http://localhost:5173");
  const [log, setLog] = useState<LogLine[]>([]);
  const [execCode, setExecCode] = useState("document.title");
  const [execResult, setExecResult] = useState("");
  const [pickResult, setPickResult] = useState("");
  const [capturedImg, setCapturedImg] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [marqueeMode, setMarqueeMode] = useState(false);
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);

  function appendLog(text: string) {
    setLog((prev) => [...prev.slice(-99), { id: ++logCounter, text }]);
    ctx.log.info(text);
  }

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const handle = attachWebviewBridge(iframe);
    handleRef.current = handle;
    const navSub = handle.onNavigate((e) => {
      appendLog(`nav: ${e.type} → ${e.url}`);
    });
    const blockedSub = handle.onBlocked(() => {
      setBlocked(true);
      appendLog(
        "⚠ page appears frame-blocked (empty document after load) — likely X-Frame-Options/CSP; open in a browser instead",
      );
    });
    appendLog("bridge attached; waiting for handshake…");
    return () => {
      navSub.dispose();
      blockedSub.dispose();
      handle.dispose();
      handleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function load() {
    const iframe = iframeRef.current;
    if (!iframe) return;
    setBlocked(false);
    appendLog(`loading: ${addressBar}`);
    iframe.src = addressBar;
  }

  async function runExec() {
    if (!handleRef.current) return;
    setBusy(true);
    try {
      const result = await handleRef.current.exec(execCode);
      setExecResult(JSON.stringify(result));
      appendLog(`exec ok: ${JSON.stringify(result)}`);
    } catch (err) {
      setExecResult(String(err));
      appendLog(`exec error: ${String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function runPick() {
    if (!handleRef.current) return;
    setPicking(true);
    setPickResult("");
    try {
      const result = await handleRef.current.pickElement();
      if (result) {
        setPickResult(`${result.selector}  —  "${result.text.slice(0, 60)}"`);
        appendLog(`pick: ${result.selector}`);
        const blob = await handleRef.current.captureRect(result.rect);
        setCapturedImg(URL.createObjectURL(blob));
      } else {
        setPickResult("(cancelled)");
        appendLog("pick: cancelled");
      }
    } catch (err) {
      setPickResult(String(err));
      appendLog(`pick error: ${String(err)}`);
    } finally {
      setPicking(false);
    }
  }

  async function capture(mode: "visible" | "full") {
    if (!handleRef.current) return;
    setBusy(true);
    try {
      const blob =
        mode === "visible"
          ? await handleRef.current.capture()
          : await handleRef.current.captureFullPage();
      setCapturedImg(URL.createObjectURL(blob));
      appendLog(`capture ${mode}: ok (${blob.size} bytes)`);
    } catch (err) {
      appendLog(`capture ${mode} error: ${String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  function onMarqueeDown(e: React.MouseEvent<HTMLDivElement>) {
    if (!marqueeMode) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setMarquee({ startX: x, startY: y, x, y, width: 0, height: 0 });
  }

  function onMarqueeMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!marqueeMode || !marquee) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setMarquee((m) =>
      m
        ? {
            ...m,
            x: Math.min(m.startX, x),
            y: Math.min(m.startY, y),
            width: Math.abs(x - m.startX),
            height: Math.abs(y - m.startY),
          }
        : m,
    );
  }

  async function onMarqueeUp() {
    if (!marqueeMode || !marquee || !handleRef.current) return;
    if (marquee.width < 4 || marquee.height < 4) {
      setMarquee(null);
      return;
    }
    const rect: WebviewRect = {
      x: marquee.x,
      y: marquee.y,
      width: marquee.width,
      height: marquee.height,
    };
    setBusy(true);
    try {
      const blob = await handleRef.current.captureRect(rect);
      setCapturedImg(URL.createObjectURL(blob));
      appendLog(`capture region: ok (${blob.size} bytes)`);
    } catch (err) {
      appendLog(`capture region error: ${String(err)}`);
    } finally {
      setBusy(false);
      setMarquee(null);
      setMarqueeMode(false);
    }
  }

  return (
    <div className="wvbt">
      <div className="wvbt-bar">
        <input
          className="wvbt-url"
          value={addressBar}
          onChange={(e) => setAddressBar(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
        />
        <button onClick={load}>Load</button>
        <button onClick={() => handleRef.current?.back()}>◀</button>
        <button onClick={() => handleRef.current?.forward()}>▶</button>
        <button onClick={() => handleRef.current?.reload()}>⟳</button>
      </div>

      {blocked && (
        <div className="wvbt-blocked-banner">
          This page appears to block embedding (X-Frame-Options / CSP
          frame-ancestors) — it loaded an empty document.{" "}
          <button onClick={() => void ctx.ui.openExternal(addressBar)}>
            Open in Browser
          </button>
        </div>
      )}

      <div className="wvbt-frame-wrap">
        <iframe
          ref={iframeRef}
          className="wvbt-frame"
          title="bridge test target"
        />
        <div
          ref={overlayRef}
          className={`wvbt-overlay${marqueeMode ? " wvbt-overlay-active" : ""}`}
          onMouseDown={onMarqueeDown}
          onMouseMove={onMarqueeMove}
          onMouseUp={onMarqueeUp}
        >
          {marquee && (
            <div
              className="wvbt-marquee"
              style={{
                left: marquee.x,
                top: marquee.y,
                width: marquee.width,
                height: marquee.height,
              }}
            />
          )}
        </div>
      </div>

      <div className="wvbt-controls">
        <button disabled={busy} onClick={() => void capture("visible")}>
          Capture visible
        </button>
        <button disabled={busy} onClick={() => void capture("full")}>
          Capture full page
        </button>
        <button
          disabled={busy}
          className={marqueeMode ? "wvbt-active" : ""}
          onClick={() => setMarqueeMode((m) => !m)}
        >
          {marqueeMode ? "Drag a region…" : "Capture region"}
        </button>
        <button disabled={picking} onClick={() => void runPick()}>
          {picking ? "Click an element…" : "Pick element"}
        </button>
      </div>

      {pickResult && <div className="wvbt-pick-result">{pickResult}</div>}

      <div className="wvbt-exec">
        <input
          className="wvbt-exec-input"
          value={execCode}
          onChange={(e) => setExecCode(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void runExec()}
        />
        <button onClick={() => void runExec()}>exec</button>
        <span className="wvbt-exec-result">{execResult}</span>
      </div>

      <div className="wvbt-body">
        <div className="wvbt-log">
          {log.map((l) => (
            <div key={l.id} className="wvbt-log-line">
              {l.text}
            </div>
          ))}
        </div>
        {capturedImg && (
          <div className="wvbt-preview">
            <img src={capturedImg} alt="capture preview" />
          </div>
        )}
      </div>
    </div>
  );
}
