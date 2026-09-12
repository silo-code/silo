import { describe, expect, it } from "vitest";
import {
  panelToReactivateOnClose,
  recordedPanelParamsToRestore,
  resolveActivationTarget,
  sameParams,
  shouldShowMaximizeButton,
} from "./dock-helpers";

// The single decision point for "which tab shows when this workspace becomes
// active" — the fix for ctx.terminals.focus() losing a race with the dock's own
// restore (issue #320). An explicit request outranks the remembered tab, and a
// request whose panel hasn't mounted yet waits instead of letting the
// remembered tab activate first (which is exactly the visible flip-flop).
describe("resolveActivationTarget", () => {
  const mounted =
    (...ids: string[]) =>
    (id: string) =>
      ids.includes(id);

  it("restores the last-visited panel when nothing was requested", () => {
    expect(
      resolveActivationTarget(null, "terminal:t1", mounted("terminal:t1")),
    ).toEqual({ targetId: "terminal:t1", pending: false });
  });

  it("leaves dockview's pick alone when nothing was requested or remembered", () => {
    // First-ever activation of a workspace: no saved state to restore.
    expect(resolveActivationTarget(null, null, mounted("terminal:t1"))).toEqual(
      {
        targetId: null,
        pending: false,
      },
    );
  });

  it("ignores a remembered panel that no longer exists", () => {
    // The remembered tab was closed while the workspace was in the background.
    expect(
      resolveActivationTarget(null, "terminal:gone", mounted("terminal:t1")),
    ).toEqual({ targetId: null, pending: false });
  });

  it("prefers an explicit request over the remembered panel", () => {
    // The whole point: ctx.terminals.focus() asked for t2, the workspace
    // remembers t1. The request wins — and only once, since the caller clears
    // it after applying.
    expect(
      resolveActivationTarget(
        "terminal:t2",
        "terminal:t1",
        mounted("terminal:t1", "terminal:t2"),
      ),
    ).toEqual({ targetId: "terminal:t2", pending: false });
  });

  it("waits — rather than restoring the remembered panel — while the requested panel is unmounted", () => {
    // A first-visit dock restores its layout and reconciles panels in later
    // commits, so the request lands before the panel exists. Activating the
    // remembered tab now would switch twice and show the flip the user reported.
    expect(
      resolveActivationTarget(
        "terminal:t2",
        "terminal:t1",
        mounted("terminal:t1"),
      ),
    ).toEqual({ targetId: null, pending: true });
  });

  it("waits on an unmounted request even with nothing remembered", () => {
    expect(resolveActivationTarget("terminal:t2", null, mounted())).toEqual({
      targetId: null,
      pending: true,
    });
  });
});

describe("panelToReactivateOnClose", () => {
  it("returns null when the closed tab WAS the active one (let dockview's within-group MRU pick)", () => {
    // Closing the tab you're focused in: keep dockview's within-group MRU.
    expect(panelToReactivateOnClose("editor:a", "editor:a")).toBeNull();
  });

  it("re-asserts the active tab when a DIFFERENT tab is closed (cross-group focus theft)", () => {
    // You're on editor:a (group A); you close terminal:x (group B). Stay on a.
    expect(panelToReactivateOnClose("terminal:x", "editor:a")).toBe("editor:a");
  });

  it("works across kinds — closing an editor while a terminal is active keeps the terminal", () => {
    expect(panelToReactivateOnClose("editor:b", "terminal:t")).toBe(
      "terminal:t",
    );
  });

  it("returns null when nothing was active before the close", () => {
    expect(panelToReactivateOnClose("editor:a", null)).toBeNull();
    expect(panelToReactivateOnClose("editor:a", undefined)).toBeNull();
  });
});

describe("shouldShowMaximizeButton", () => {
  it("hides when there's zero or one group", () => {
    expect(shouldShowMaximizeButton(0)).toBe(false);
    expect(shouldShowMaximizeButton(1)).toBe(false);
  });

  it("shows once there's a split (2+ groups)", () => {
    expect(shouldShowMaximizeButton(2)).toBe(true);
    expect(shouldShowMaximizeButton(3)).toBe(true);
  });
});

// A recorded panel restored by `fromJSON` carries the params the *layout*
// snapshot happened to hold, which can lag its record. Left alone, the panel's
// next partial `updateParameters` merges onto the stale copy and that result
// replaces the record — which is how a Chat panel's persisted `title`
// disappeared across a restart (RFC 0042, 2026-09-10).
describe("recordedPanelParamsToRestore", () => {
  it("re-seeds from the record when the layout's params are missing a key", () => {
    expect(
      recordedPanelParamsToRestore(
        { sessionId: "s1", profileId: "claude", title: "Plum" },
        { sessionId: "s1", profileId: "claude" },
      ),
    ).toEqual({ sessionId: "s1", profileId: "claude", title: "Plum" });
  });

  it("re-seeds when a value differs, record winning", () => {
    expect(
      recordedPanelParamsToRestore(
        { title: "Plum" },
        { title: "Claude Agent" },
      ),
    ).toEqual({ title: "Plum" });
  });

  it("leaves a panel alone when the two already agree — no write, no event", () => {
    expect(
      recordedPanelParamsToRestore(
        { sessionId: "s1", title: "Plum" },
        { sessionId: "s1", title: "Plum" },
      ),
    ).toBeNull();
  });

  it("re-seeds when the layout carries an extra key the record dropped", () => {
    expect(
      recordedPanelParamsToRestore(
        { sessionId: "s1" },
        { sessionId: "s1", stale: 1 },
      ),
    ).toEqual({ sessionId: "s1" });
  });

  it("handles an empty record state", () => {
    expect(recordedPanelParamsToRestore({}, {})).toBeNull();
    expect(recordedPanelParamsToRestore({}, { title: "x" })).toEqual({});
  });
});

describe("sameParams", () => {
  it("is order-independent and value-sensitive", () => {
    expect(sameParams({ a: 1, b: "x" }, { b: "x", a: 1 })).toBe(true);
    expect(sameParams({ a: 1 }, { a: 2 })).toBe(false);
  });

  it("counts a key present-but-undefined as a difference in size", () => {
    expect(sameParams({ a: 1 }, { a: 1, b: undefined })).toBe(false);
  });
});
