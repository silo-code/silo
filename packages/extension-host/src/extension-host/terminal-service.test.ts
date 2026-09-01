import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock the Tauri terminal client and the process service (force-spawn path).
const { sendInput, deleteTerminal, spawn, spawnTerminalSession, onOutput } =
  vi.hoisted(() => ({
    sendInput: vi.fn(),
    deleteTerminal: vi.fn(() => Promise.resolve()),
    spawn: vi.fn(),
    spawnTerminalSession: vi.fn(),
    onOutput: vi.fn(() => () => {}),
  }));
vi.mock("../services/tauri-terminal-client", () => ({
  tauriTerminalClient: { sendInput, deleteTerminal, onOutput },
}));
vi.mock("./process-service", () => ({
  getProcessService: () => ({ spawn }),
  spawnTerminalSession,
}));

// Mock dockview's own registry so `focus()`'s call sequence/timing is
// observable without a real dockview instance.
const {
  setActive,
  getPanel,
  getActiveDockApi,
  getActiveDockWorkspaceId,
  focusPanelContent,
} = vi.hoisted(() => ({
  setActive: vi.fn(),
  getPanel: vi.fn(),
  getActiveDockApi: vi.fn(),
  getActiveDockWorkspaceId: vi.fn(),
  focusPanelContent: vi.fn(),
}));
vi.mock("../docked/dock-api-registry", () => ({
  getActiveDockApi,
  getActiveDockWorkspaceId,
  focusPanelContent,
}));

// A marker object standing in for a panel's real `view.content.element` —
// opaque here since focusPanelContent is mocked out; its identity is what
// lets a test confirm focus() passed *this specific panel's* element through,
// not some other panel's or a generic group-wide host.
const PANEL_CONTENT_ELEMENT = {} as HTMLElement;

import { store } from "../state/store";
import type { WorkspaceInternal } from "../state/types";
import {
  peekPanelActivation,
  clearPanelActivation,
} from "../docked/panel-activation-requests";
import { getTerminalService } from "./terminal-service";

const svc = getTerminalService();
const flush = () => new Promise((r) => setTimeout(r, 0));

// Controllable requestAnimationFrame — `focus()`'s fix defers the focus grab
// by one frame, so tests need to control exactly when that frame "fires"
// rather than trust jsdom's real (uncontrollable-in-tests) rAF timing.
let rafCallbacks: FrameRequestCallback[] = [];
function flushRaf() {
  const pending = rafCallbacks;
  rafCallbacks = [];
  for (const cb of pending) cb(0);
}

function makeWorkspace(id: string): WorkspaceInternal {
  return {
    id,
    name: id,
    folder: `/ws/${id}`,
    createdAt: "",
    lastOpenedAt: "",
    terminals: [],
    editors: [],
    dockLayout: null,
    previewEditorId: null,
  };
}

beforeEach(() => {
  sendInput.mockReset();
  deleteTerminal.mockReset().mockResolvedValue(undefined);
  spawn.mockReset();
  spawnTerminalSession.mockReset();
  onOutput.mockReset().mockReturnValue(() => {});
  setActive.mockReset();
  getPanel.mockReset().mockReturnValue({
    api: { setActive },
    view: { content: { element: PANEL_CONTENT_ELEMENT } },
  });
  getActiveDockApi.mockReset().mockReturnValue({ getPanel });
  // Default: the live dock is workspace "w" — matches store.activeWorkspaceId
  // below for the common "same workspace, dock already up" case. Tests that
  // exercise the cross-workspace path don't need to touch this — "w" simply
  // isn't the target workspace id they focus into.
  getActiveDockWorkspaceId.mockReset().mockReturnValue("w");
  focusPanelContent.mockReset();
  rafCallbacks = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback): number => {
    rafCallbacks.push(cb);
    return rafCallbacks.length;
  });
  const ws = makeWorkspace("w");
  ws.terminals = [
    { id: "t1", sessionId: "sess-1", kind: "shell", title: "Terminal" },
    {
      id: "t2",
      sessionId: "",
      kind: "shell",
      title: "Terminal",
      cwd: "/ws/w/sub",
    },
  ];
  store.workspaces = { w: ws };
  store.workspaceOrder = ["w"];
  store.activeWorkspaceId = "w";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  // Cross-workspace focus() leaves a pending request behind for the
  // destination dock to consume — don't leak it into the next test.
  clearPanelActivation("other");
});

describe("TerminalService.sendText (B7)", () => {
  it("writes to an existing session with a carriage return by default", async () => {
    svc.sendText("t1", "npm run build");
    await flush();
    expect(sendInput).toHaveBeenCalledWith("sess-1", "npm run build\r");
  });

  it("stages text without executing when addNewline is false", async () => {
    svc.sendText("t1", "partial", false);
    await flush();
    expect(sendInput).toHaveBeenCalledWith("sess-1", "partial");
  });

  it("force-spawns a PTY for an unmounted terminal via the privileged path (RFC 0028/0033), then writes", async () => {
    spawnTerminalSession.mockResolvedValue({ id: "sess-2", kill: vi.fn() });
    svc.sendText("t2", "ls");
    await flush();
    // Privileged spawn (stamps SILO_TERMINAL_ID) with the terminal id and the
    // record's cwd — never the public `spawn`. Wrote once spawned, recorded id.
    expect(spawnTerminalSession).toHaveBeenCalledWith({
      terminalId: "t2",
      cwd: "/ws/w/sub",
    });
    expect(spawn).not.toHaveBeenCalled();
    expect(sendInput).toHaveBeenCalledWith("sess-2", "ls\r");
    expect(store.workspaces.w.terminals[1].sessionId).toBe("sess-2");
  });

  it("shares one spawn across concurrent sends to the same terminal", async () => {
    spawnTerminalSession.mockResolvedValue({ id: "sess-2", kill: vi.fn() });
    svc.sendText("t2", "one");
    svc.sendText("t2", "two");
    await flush();
    expect(spawnTerminalSession).toHaveBeenCalledTimes(1);
    expect(sendInput).toHaveBeenCalledTimes(2);
  });

  it("is a no-op for an unknown terminal id", async () => {
    svc.sendText("nope", "x");
    await flush();
    expect(sendInput).not.toHaveBeenCalled();
    expect(spawnTerminalSession).not.toHaveBeenCalled();
  });
});

describe("TerminalService.close (B7)", () => {
  it("removes the record and kills its PTY", () => {
    svc.close("t1");
    expect(
      store.workspaces.w.terminals.find((t) => t.id === "t1"),
    ).toBeUndefined();
    expect(deleteTerminal).toHaveBeenCalledWith("sess-1");
  });

  it("removes an unspawned terminal without a kill call", () => {
    svc.close("t2");
    expect(
      store.workspaces.w.terminals.find((t) => t.id === "t2"),
    ).toBeUndefined();
    expect(deleteTerminal).not.toHaveBeenCalled();
  });

  it("is a no-op for an unknown id", () => {
    svc.close("nope");
    expect(store.workspaces.w.terminals).toHaveLength(2);
    expect(deleteTerminal).not.toHaveBeenCalled();
  });
});

describe("TerminalService.closeWorkspace", () => {
  it("kills every live session and clears the workspace's terminal list", () => {
    svc.closeWorkspace("w");
    expect(store.workspaces.w.terminals).toEqual([]);
    expect(deleteTerminal).toHaveBeenCalledWith("sess-1");
    expect(deleteTerminal).toHaveBeenCalledTimes(1);
  });

  it("is a no-op for an unknown workspace id", () => {
    svc.closeWorkspace("nope");
    expect(store.workspaces.w.terminals).toHaveLength(2);
    expect(deleteTerminal).not.toHaveBeenCalled();
  });
});

describe("TerminalService.rename (B7)", () => {
  it("sets a custom name and mirrors it into the title", () => {
    svc.rename("t1", "  deploy  ");
    const rec = store.workspaces.w.terminals[0];
    expect(rec.customName).toBe("deploy");
    expect(rec.title).toBe("deploy");
  });

  it("clears the custom name on an empty string", () => {
    svc.rename("t1", "deploy");
    svc.rename("t1", "");
    expect(store.workspaces.w.terminals[0].customName).toBeUndefined();
  });
});

describe("TerminalService.focus", () => {
  it("activates the panel synchronously but defers the actual focus grab a frame", () => {
    // Regression test: the deferred focus grab bails out immediately (before
    // ever reaching its own retry loop) if the target tab's content isn't in
    // the DOM yet, and dockview's re-render mounting the newly-active tab
    // happens asynchronously, not synchronously with setActive(). Calling
    // it in the same tick as setActive() reliably switched the visible tab
    // but never actually focused it — confirmed live (no blinking cursor,
    // keystrokes did nothing) when driven from a side panel's click handler.
    svc.focus("t1");

    // setActive() happens right away — the tab switch itself isn't delayed.
    expect(setActive).toHaveBeenCalledTimes(1);
    // The focus grab must NOT have run yet in this same tick.
    expect(focusPanelContent).not.toHaveBeenCalled();

    flushRaf();
    // Regression test: scoped to *this panel's own* content element, not
    // focusCenterDock()'s "whatever's visible in the active group" — with
    // two-plus terminal tabs in the same group, that generic search could
    // win the race against dockview's own visibility toggle and land on the
    // previous tab's still-visible content instead (confirmed live: clicking
    // between two terminal rows in agent-inspector sometimes focused the
    // wrong one).
    expect(focusPanelContent).toHaveBeenCalledTimes(1);
    expect(focusPanelContent).toHaveBeenCalledWith(PANEL_CONTENT_ELEMENT);
  });

  it("is a no-op for an unknown terminal id", () => {
    svc.focus("nope");
    expect(setActive).not.toHaveBeenCalled();
    flushRaf();
    expect(focusPanelContent).not.toHaveBeenCalled();
  });

  it("does not defer a focus grab when the panel lookup itself comes back empty", () => {
    getPanel.mockReturnValue(undefined);
    svc.focus("t1");
    flushRaf();
    expect(focusPanelContent).not.toHaveBeenCalled();
  });

  it("hands a cross-workspace focus to the destination dock as a request, touching no dock itself", () => {
    // Regression test for the flip-flop (issue #320): this path used to call
    // setActive() itself behind a flat setTimeout(80) — a guess at how long the
    // destination dock takes to mount — while that dock's own mount effect was
    // independently restoring the panel the workspace was last on. Whichever
    // setActive() landed last won, so the requested tab flashed active and then
    // switched away. Now focus() only records the intent and switches the
    // workspace; WorkspaceDock (the single authority over its active panel)
    // applies it deterministically once its dock is up.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const other = makeWorkspace("other");
    other.terminals = [
      { id: "t3", sessionId: "sess-3", kind: "shell", title: "Terminal" },
    ];
    store.workspaces.other = other;
    store.workspaceOrder.push("other");

    svc.focus("t3");
    expect(store.activeWorkspaceId).toBe("other");
    expect(peekPanelActivation("other")).toBe("terminal:t3");

    // No dock work from here — not now, not on any timer, not on any frame.
    expect(getActiveDockApi).not.toHaveBeenCalled();
    expect(setActive).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    flushRaf();
    expect(setActive).not.toHaveBeenCalled();
    expect(focusPanelContent).not.toHaveBeenCalled();
  });

  it("keeps only the newest cross-workspace request when clicked twice in a row", () => {
    const other = makeWorkspace("other");
    other.terminals = [
      { id: "t3", sessionId: "sess-3", kind: "shell", title: "Terminal" },
      { id: "t4", sessionId: "sess-4", kind: "shell", title: "Terminal" },
    ];
    store.workspaces.other = other;
    store.workspaceOrder.push("other");

    svc.focus("t3");
    // Second click lands before the destination dock has applied the first —
    // the last intent is the live one, and only one tab switch happens.
    store.activeWorkspaceId = "w"; // still elsewhere as far as this call knows
    svc.focus("t4");
    expect(peekPanelActivation("other")).toBe("terminal:t4");
  });
});
