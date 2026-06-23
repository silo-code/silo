import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The affordance + modifier tracker touch the real DOM / Tauri; mock them so we
// can unit-test the pure dispatch logic (MIME round-trip + mode resolution).
vi.mock("./file-drag-ghost", () => ({ startFileDragGhost: vi.fn() }));
vi.mock("./alt-tracker", () => ({ isPasteModifierActive: vi.fn(() => false) }));
// Dynamic import used by prefetchFinderPaths().
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue([]),
}));

import { getDndService } from "./dnd-service";
import { DND_MIME, type DropContext } from "@silo-code/sdk";
import { startFileDragGhost } from "./file-drag-ghost";
import { isPasteModifierActive } from "./alt-tracker";
import { invoke } from "@tauri-apps/api/core";

function fakeDataTransfer(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    get types() {
      return [...store.keys()];
    },
    setData: vi.fn((m: string, v: string) => void store.set(m, v)),
    getData: (m: string) => store.get(m) ?? "",
    setDragImage: vi.fn(),
    effectAllowed: "none" as string,
    dropEffect: "none" as string,
  };
}

function dropEvent(dt: ReturnType<typeof fakeDataTransfer>) {
  const evt = new Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(evt, "dataTransfer", { value: dt });
  Object.defineProperty(evt, "clientX", { value: 5 });
  Object.defineProperty(evt, "clientY", { value: 7 });
  return evt;
}

describe("dnd-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (isPasteModifierActive as ReturnType<typeof vi.fn>).mockReturnValue(false);
  });

  it("beginDrag writes typed items + effect, and starts the ghost", () => {
    const dt = fakeDataTransfer();
    getDndService().beginDrag({ dataTransfer: dt } as unknown as DragEvent, {
      items: [{ mime: DND_MIME.filePath, value: "/a/b.txt" }],
      label: "b.txt",
      effect: "move",
    });
    expect(dt.setData).toHaveBeenCalledWith(DND_MIME.filePath, "/a/b.txt");
    expect(dt.effectAllowed).toBe("move");
    expect(startFileDragGhost).toHaveBeenCalledWith("b.txt", expect.anything());
  });

  it("beginDrag sets text/uri-list for Finder interop (spaces encoded)", () => {
    const dt = fakeDataTransfer();
    getDndService().beginDrag({ dataTransfer: dt } as unknown as DragEvent, {
      items: [{ mime: DND_MIME.filePath, value: "/a/my file.txt" }],
      label: "my file.txt",
    });
    expect(dt.setData).toHaveBeenCalledWith(
      "text/uri-list",
      "file:///a/my%20file.txt",
    );
  });

  it("beginDrag joins multiple file paths with CRLF in text/uri-list", () => {
    const dt = fakeDataTransfer();
    getDndService().beginDrag({ dataTransfer: dt } as unknown as DragEvent, {
      items: [
        { mime: DND_MIME.filePath, value: "/a/b.txt" },
        { mime: DND_MIME.filePath, value: "/c/d.png" },
      ],
      label: "2 files",
    });
    expect(dt.setData).toHaveBeenCalledWith(
      "text/uri-list",
      "file:///a/b.txt\r\nfile:///c/d.png",
    );
  });

  it("registerDropTarget reads items, resolves copy mode, and handles", () => {
    const el = document.createElement("div");
    const onDrop = vi.fn((_ctx: DropContext) => true);
    const reg = getDndService().registerDropTarget(el, {
      accepts: [DND_MIME.filePath],
      onDrop,
    });

    const evt = dropEvent(fakeDataTransfer({ [DND_MIME.filePath]: "/x.txt" }));
    const prevented = vi.spyOn(evt, "preventDefault");
    el.dispatchEvent(evt);

    expect(onDrop).toHaveBeenCalledTimes(1);
    const ctx = onDrop.mock.calls[0][0];
    expect(ctx.items).toEqual([{ mime: DND_MIME.filePath, value: "/x.txt" }]);
    expect(ctx.mode).toBe("copy");
    expect(prevented).toHaveBeenCalled(); // onDrop returned true ⇒ host prevents
    reg.dispose();
  });

  it("ignores drops without an accepted MIME", () => {
    const el = document.createElement("div");
    const onDrop = vi.fn((_ctx: DropContext) => true);
    getDndService().registerDropTarget(el, {
      accepts: [DND_MIME.filePath],
      onDrop,
    });
    el.dispatchEvent(dropEvent(fakeDataTransfer({ "text/other": "z" })));
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("resolves paste mode when the modifier is active", () => {
    (isPasteModifierActive as ReturnType<typeof vi.fn>).mockReturnValue(true);
    const el = document.createElement("div");
    const onDrop = vi.fn((_ctx: DropContext) => true);
    getDndService().registerDropTarget(el, {
      accepts: [DND_MIME.filePath],
      onDrop,
    });
    el.dispatchEvent(
      dropEvent(fakeDataTransfer({ [DND_MIME.filePath]: "/p" })),
    );
    expect(onDrop.mock.calls[0][0].mode).toBe("paste");
  });

  it("dispose removes the listener", () => {
    const el = document.createElement("div");
    const onDrop = vi.fn((_ctx: DropContext) => true);
    const reg = getDndService().registerDropTarget(el, {
      accepts: [DND_MIME.filePath],
      onDrop,
    });
    reg.dispose();
    el.dispatchEvent(
      dropEvent(fakeDataTransfer({ [DND_MIME.filePath]: "/p" })),
    );
    expect(onDrop).not.toHaveBeenCalled();
  });
});

// ── native Finder drop tests ─────────────────────────────────────────────────

// Flush the microtask + macrotask queues — needed to let the dynamic import
// chain inside prefetchFinderPaths() resolve fully.
const flushPromises = () => new Promise<void>((r) => setTimeout(r, 0));

/** Build a DataTransfer-like object whose .types mimics an OS file drag. */
function finderDt(extraTypes: Record<string, string> = {}) {
  return fakeDataTransfer({ Files: "", ...extraTypes });
}

function fireWindowEvent(
  type: "dragover" | "dragleave" | "drop",
  dt: ReturnType<typeof fakeDataTransfer>,
  opts: { x?: number; y?: number; relatedTarget?: Element | null } = {},
): Event {
  const evt = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(evt, "dataTransfer", { value: dt });
  Object.defineProperty(evt, "clientX", { value: opts.x ?? 10 });
  Object.defineProperty(evt, "clientY", { value: opts.y ?? 10 });
  if (type === "dragleave") {
    Object.defineProperty(evt, "relatedTarget", {
      value:
        opts.relatedTarget !== undefined
          ? opts.relatedTarget
          : document.createElement("div"),
    });
  }
  window.dispatchEvent(evt);
  return evt;
}

describe("native Finder file drop (swizzle path)", () => {
  const mockInvoke = vi.mocked(invoke);

  // jsdom doesn't implement elementFromPoint; define it directly.
  function stubEFP(el: Element | null) {
    Object.defineProperty(document, "elementFromPoint", {
      value: () => el,
      writable: true,
      configurable: true,
    });
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue([]);
    // Ensure elementFromPoint exists (returns null by default between tests).
    stubEFP(null);
    // Reset native drag state: simulating a window-exit dragleave calls
    // clearFinderDragCache() which nulls the cache and increments the session.
    fireWindowEvent("dragleave", finderDt(), { relatedTarget: null });
    await flushPromises();
  });

  it("registerDropTarget adds to registry; dispose removes it", async () => {
    const el = document.createElement("div");
    const onDrop = vi.fn(() => undefined);
    const reg = getDndService().registerDropTarget(el, {
      accepts: [DND_MIME.filePath],
      onDrop,
    });
    mockInvoke.mockResolvedValue(["/x.txt"]);
    stubEFP(el);

    fireWindowEvent("dragover", finderDt());
    await flushPromises();
    fireWindowEvent("drop", finderDt());
    expect(onDrop).toHaveBeenCalledTimes(1);

    reg.dispose();
    // Fire another drag — element is gone from registry, onDrop must not fire.
    fireWindowEvent("dragleave", finderDt(), { relatedTarget: null }); // clear cache
    await flushPromises();
    mockInvoke.mockResolvedValue(["/x.txt"]);
    stubEFP(el);
    fireWindowEvent("dragover", finderDt());
    await flushPromises();
    fireWindowEvent("drop", finderDt());
    expect(onDrop).toHaveBeenCalledTimes(1); // still 1 — dispose worked
  });

  it("prefetch is triggered once on first dragover and not repeated", async () => {
    const el = document.createElement("div");
    const reg = getDndService().registerDropTarget(el, {
      accepts: [DND_MIME.filePath],
      onDrop: vi.fn(() => undefined),
    });
    stubEFP(el);

    fireWindowEvent("dragover", finderDt());
    fireWindowEvent("dragover", finderDt()); // second over — no new fetch
    await flushPromises();

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith("dnd_get_finder_paths");
    reg.dispose();
  });

  it("drop delivers prefetched paths as DND items with mode='paste'", async () => {
    mockInvoke.mockResolvedValue(["/a/b.txt", "/c/d.png"]);

    const el = document.createElement("div");
    const onDrop = vi.fn(() => undefined);
    const reg = getDndService().registerDropTarget(el, {
      accepts: [DND_MIME.filePath],
      onDrop,
    });
    stubEFP(el);

    fireWindowEvent("dragover", finderDt());
    await flushPromises(); // finderDragPaths = ["/a/b.txt", "/c/d.png"]
    fireWindowEvent("drop", finderDt()); // no uri-list → uses cache

    expect(onDrop).toHaveBeenCalledTimes(1);
    const ctx = onDrop.mock.calls[0][0] as DropContext;
    expect(ctx.items).toEqual([
      { mime: DND_MIME.filePath, value: "/a/b.txt" },
      { mime: DND_MIME.filePath, value: "/c/d.png" },
    ]);
    expect(ctx.mode).toBe("paste");
    reg.dispose();
  });

  it("window-exit dragleave clears the cache; subsequent drop fires nothing", async () => {
    mockInvoke.mockResolvedValue(["/a/b.txt"]);

    const el = document.createElement("div");
    const onDrop = vi.fn(() => undefined);
    const reg = getDndService().registerDropTarget(el, {
      accepts: [DND_MIME.filePath],
      onDrop,
    });
    stubEFP(el);

    fireWindowEvent("dragover", finderDt());
    await flushPromises();
    fireWindowEvent("dragleave", finderDt(), { relatedTarget: null }); // leaves window
    fireWindowEvent("drop", finderDt()); // cache gone → no paths → nothing fired

    expect(onDrop).not.toHaveBeenCalled();
    reg.dispose();
  });

  it("intra-DOM dragleave (relatedTarget != null) does NOT clear the cache", async () => {
    mockInvoke.mockResolvedValue(["/a/b.txt"]);

    const el = document.createElement("div");
    const onDrop = vi.fn(() => undefined);
    const reg = getDndService().registerDropTarget(el, {
      accepts: [DND_MIME.filePath],
      onDrop,
    });
    stubEFP(el);

    fireWindowEvent("dragover", finderDt());
    await flushPromises();
    // Cursor moved to a sibling element — relatedTarget is a DOM node, not null.
    fireWindowEvent("dragleave", finderDt(), {
      relatedTarget: document.createElement("span"),
    });
    fireWindowEvent("drop", finderDt()); // cache intact → paths delivered

    expect(onDrop).toHaveBeenCalledTimes(1);
    reg.dispose();
  });

  it("drop on unregistered element does not crash", () => {
    const el = document.createElement("div"); // NOT registered
    stubEFP(el);

    expect(() => {
      fireWindowEvent("dragover", finderDt());
      fireWindowEvent("drop", finderDt());
    }).not.toThrow();
  });

  it("internal Silo drag (carries DND_MIME.filePath) is not treated as a Finder drag", async () => {
    const el = document.createElement("div");
    const onDrop = vi.fn(() => true);
    const reg = getDndService().registerDropTarget(el, {
      accepts: [DND_MIME.filePath],
      onDrop,
    });
    stubEFP(el);

    // Has "Files" but also our internal MIME → isExternalFileDrag returns false.
    const internalDt = fakeDataTransfer({
      Files: "",
      [DND_MIME.filePath]: "/x.txt",
    });
    fireWindowEvent("dragover", internalDt);
    await flushPromises();

    // invoke must NOT have been called (no prefetch for internal drag)
    expect(mockInvoke).not.toHaveBeenCalled();
    reg.dispose();
  });
});
