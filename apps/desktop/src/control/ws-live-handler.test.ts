import { describe, it, expect, beforeEach } from "vitest";
import { store } from "@silo-code/extension-host";
import type { WorkspaceInternal } from "@silo-code/extension-host/internal";
import { applyWsLive, type WsLiveData } from "./ws-live-handler";
import type { ControlResult } from "./types";

// `ws.live` is the annotation half of `silo ws list` (RFC 0034 R10): the disk
// listing is the answer, and this says what is true *right now*. Everything
// asserted here is a fact the on-disk record lags behind.

function makeWorkspace(
  id: string,
  folder: string,
  closedAt?: string,
): WorkspaceInternal {
  return {
    id,
    name: id,
    folder,
    closedAt,
    createdAt: "",
    lastOpenedAt: "",
    terminals: [],
    editors: [],
    dockLayout: null,
    previewEditorId: null,
  };
}

function live(result: ControlResult): WsLiveData["workspaces"] {
  if (!result.ok) throw new Error(`expected success, got ${result.code}`);
  return (result.data as WsLiveData).workspaces;
}

beforeEach(() => {
  store.workspaces = {};
  store.workspaceOrder = [];
  store.activeWorkspaceId = null;
});

describe("applyWsLive", () => {
  it("reports open, soft-closed, and active, keyed by workspace id", () => {
    store.workspaces = {
      open: makeWorkspace("open", "/o"),
      closed: makeWorkspace("closed", "/c", "2026-09-01T00:00:00Z"),
      active: makeWorkspace("active", "/a"),
    };
    store.activeWorkspaceId = "active";

    expect(live(applyWsLive())).toEqual({
      open: { open: true, active: false },
      closed: { open: false, active: false },
      active: { open: true, active: true },
    });
  });

  it("marks exactly one workspace active", () => {
    store.workspaces = {
      a: makeWorkspace("a", "/a"),
      b: makeWorkspace("b", "/b"),
    };
    store.activeWorkspaceId = "b";

    const entries = live(applyWsLive());
    expect(Object.values(entries).filter((e) => e.active)).toHaveLength(1);
    expect(entries.b.active).toBe(true);
  });

  it("marks none active when nothing is", () => {
    store.workspaces = { a: makeWorkspace("a", "/a") };

    expect(live(applyWsLive()).a).toEqual({ open: true, active: false });
  });

  it("answers an empty map rather than failing when there are no workspaces", () => {
    // An empty overlay still means "an instance answered": the client renders
    // every disk row as not-open, which is true — and distinct from its
    // no-instance case, where it omits the state column entirely.
    const result = applyWsLive();
    expect(result.ok).toBe(true);
    expect(live(result)).toEqual({});
  });
});
