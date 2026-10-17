import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock dockview's own registry so the call sequence/timing is observable
// without a real dockview instance.
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
// lets a test confirm the call passed *this specific panel's* element
// through, not some other panel's or a generic group-wide host.
const PANEL_CONTENT_ELEMENT = {} as HTMLElement;

import { store } from "../state/store";
import type { WorkspaceInternal } from "../state/types";
import {
  peekPanelActivation,
  clearPanelActivation,
} from "../docked/panel-activation-requests";
import { focusDockPanel } from "./focus-dock-panel";

// Controllable requestAnimationFrame — the deferred focus grab needs tests to
// control exactly when that frame "fires" rather than trust jsdom's real
// (uncontrollable-in-tests) rAF timing.
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
  } as WorkspaceInternal;
}

beforeEach(() => {
  setActive.mockReset();
  getPanel.mockReset().mockReturnValue({
    api: { setActive },
    view: { content: { element: PANEL_CONTENT_ELEMENT } },
  });
  getActiveDockApi.mockReset().mockReturnValue({ getPanel });
  // Default: the live dock is workspace "w" — the common "same workspace,
  // dock already up" case.
  getActiveDockWorkspaceId.mockReset().mockReturnValue("w");
  focusPanelContent.mockReset();
  rafCallbacks = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback): number => {
    rafCallbacks.push(cb);
    return rafCallbacks.length;
  });
  store.workspaces = { w: makeWorkspace("w") };
  store.workspaceOrder = ["w"];
  store.activeWorkspaceId = "w";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  // Cross-workspace calls leave a pending request behind for the destination
  // dock to consume — don't leak it into the next test.
  clearPanelActivation("other");
  clearPanelActivation("ghost");
});

describe("focusDockPanel", () => {
  it("activates the panel synchronously but defers the actual focus grab a frame", () => {
    // Regression test: the deferred focus grab bails out immediately (before
    // ever reaching its own retry loop) if the target tab's content isn't in
    // the DOM yet, and dockview's re-render mounting the newly-active tab
    // happens asynchronously, not synchronously with setActive(). Calling it
    // in the same tick as setActive() reliably switched the visible tab but
    // never actually focused it.
    focusDockPanel("w", "panel:p1");

    // setActive() happens right away — the tab switch itself isn't delayed.
    expect(setActive).toHaveBeenCalledTimes(1);
    // The focus grab must NOT have run yet in this same tick.
    expect(focusPanelContent).not.toHaveBeenCalled();

    flushRaf();
    // Regression test: scoped to *this panel's own* content element, not a
    // generic "whatever's visible in the active group" search — with
    // two-plus tabs in the same group, that generic search could win the
    // race against dockview's own visibility toggle and land on the previous
    // tab's still-visible content instead.
    expect(focusPanelContent).toHaveBeenCalledTimes(1);
    expect(focusPanelContent).toHaveBeenCalledWith(PANEL_CONTENT_ELEMENT);
  });

  it("does not defer a focus grab when the panel lookup itself comes back empty", () => {
    getPanel.mockReturnValue(undefined);
    focusDockPanel("w", "panel:p1");
    flushRaf();
    expect(focusPanelContent).not.toHaveBeenCalled();
  });

  it("hands a cross-workspace focus to the destination dock as a request, touching no dock itself", () => {
    // Regression test for the flip-flop (issue #320): this path used to call
    // setActive() itself behind a flat setTimeout(80) — a guess at how long
    // the destination dock takes to mount — while that dock's own mount
    // effect was independently restoring the panel the workspace was last
    // on. Whichever setActive() landed last won, so the requested tab
    // flashed active and then switched away. Now the call only records the
    // intent and switches the workspace; WorkspaceDock (the single authority
    // over its active panel) applies it deterministically once its dock is
    // up.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    store.workspaces.other = makeWorkspace("other");
    store.workspaceOrder.push("other");

    focusDockPanel("other", "editor:e1");
    expect(store.activeWorkspaceId).toBe("other");
    expect(peekPanelActivation("other")).toBe("editor:e1");

    // No dock work from here — not now, not on any timer, not on any frame.
    expect(getActiveDockApi).not.toHaveBeenCalled();
    expect(setActive).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    flushRaf();
    expect(setActive).not.toHaveBeenCalled();
    expect(focusPanelContent).not.toHaveBeenCalled();
  });

  it("keeps only the newest cross-workspace request when called twice in a row", () => {
    store.workspaces.other = makeWorkspace("other");
    store.workspaceOrder.push("other");

    focusDockPanel("other", "editor:e1");
    // Second call lands before the destination dock has applied the first —
    // the last intent is the live one, and only one tab switch happens.
    store.activeWorkspaceId = "w"; // still elsewhere as far as this call knows
    focusDockPanel("other", "editor:e2");
    expect(peekPanelActivation("other")).toBe("editor:e2");
  });

  it("records the request even for a workspace id that turns out not to exist", () => {
    // activateWorkspace() itself no-ops for an unknown id — this call still
    // only ever records intent and lets the (never-arriving) dock consume
    // it, rather than branching on whether the id is valid.
    focusDockPanel("ghost", "panel:p1");
    expect(peekPanelActivation("ghost")).toBe("panel:p1");
    expect(store.activeWorkspaceId).toBe("w");
  });
});
