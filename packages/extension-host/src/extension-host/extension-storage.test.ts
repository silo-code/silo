import { describe, it, expect, beforeEach } from "vitest";
import { store } from "../state/store";
import {
  getGlobalExtensionStorage,
  getWorkspaceExtensionStorage,
} from "./extension-storage";

// Valtio notifies subscribers on a microtask; flush before asserting.
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

beforeEach(() => {
  store.extensionState = {};
  store.globalExtensionState = {};
  store.hydrated = false;
});

describe("extension storage scopes", () => {
  it("global storage reads/writes globalExtensionState; workspace reads/writes extensionState", () => {
    const g = getGlobalExtensionStorage("ext.a");
    const w = getWorkspaceExtensionStorage("ext.a");

    g.set("k", 1);
    w.set("k", 2);

    expect(store.globalExtensionState["ext.a"]).toEqual({ k: 1 });
    expect(store.extensionState["ext.a"]).toEqual({ k: 2 });
    expect(g.get("k")).toBe(1);
    expect(w.get("k")).toBe(2);
  });

  it("get returns the fallback when missing; set(undefined) deletes; keys lists set keys", () => {
    const g = getGlobalExtensionStorage("ext.keys");
    expect(g.get("missing", "fb")).toBe("fb");
    expect(g.keys()).toEqual([]);

    g.set("a", 1);
    g.set("b", 2);
    expect(g.keys().sort()).toEqual(["a", "b"]);

    g.set("a", undefined);
    expect(g.get("a")).toBeUndefined();
    expect(g.keys()).toEqual(["b"]);
  });

  it("the same namespace returns a cached instance per scope", () => {
    expect(getGlobalExtensionStorage("ext.x")).toBe(
      getGlobalExtensionStorage("ext.x"),
    );
    // Same id, different scope → different bag.
    expect(getGlobalExtensionStorage("ext.x")).not.toBe(
      getWorkspaceExtensionStorage("ext.x"),
    );
  });

  it("subscribe fires on a change within the namespace, not on unrelated mutations", async () => {
    const g = getGlobalExtensionStorage("ext.sub");
    let calls = 0;
    const sub = g.subscribe(() => calls++);

    // Unrelated change (another namespace) → no notify.
    getGlobalExtensionStorage("ext.other").set("k", 1);
    await flush();
    expect(calls).toBe(0);

    // In-namespace change → notify.
    g.set("k", 1);
    await flush();
    expect(calls).toBe(1);

    sub.dispose();
    g.set("k", 2);
    await flush();
    expect(calls).toBe(1);
  });

  it("subscribe fires when app state finishes hydrating", async () => {
    const g = getGlobalExtensionStorage("ext.hyd");
    let calls = 0;
    g.subscribe(() => calls++);

    store.hydrated = true;
    await flush();
    expect(calls).toBe(1);
  });

  it("workspace storage reflects the bag being swapped on workspace switch", async () => {
    const w = getWorkspaceExtensionStorage("ext.ws");
    let calls = 0;
    w.subscribe(() => calls++);

    // Simulate loadPanelStateFromWorkspace replacing the whole map.
    store.extensionState = { "ext.ws": { k: "from-ws-b" } };
    await flush();

    expect(w.get("k")).toBe("from-ws-b");
    expect(calls).toBe(1);
  });
});
