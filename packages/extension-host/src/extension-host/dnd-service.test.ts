import { describe, it, expect, vi, beforeEach } from "vitest";

// The affordance + modifier tracker touch the real DOM / Tauri; mock them so we
// can unit-test the pure dispatch logic (MIME round-trip + mode resolution).
vi.mock("./file-drag-ghost", () => ({ startFileDragGhost: vi.fn() }));
vi.mock("./alt-tracker", () => ({ isPasteModifierActive: vi.fn(() => false) }));

import { getDndService } from "./dnd-service";
import { DND_MIME, type DropContext } from "@silo-code/sdk";
import { startFileDragGhost } from "./file-drag-ghost";
import { isPasteModifierActive } from "./alt-tracker";

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
