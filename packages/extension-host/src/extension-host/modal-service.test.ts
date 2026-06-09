import { describe, it, expect, afterEach } from "vitest";
import {
  dialogStore,
  getCustomModal,
  prompt,
  resolveDialog,
  showModal,
} from "./modal-service";

// The custom-modal channel behind `ctx.ui.showModal`: it shares the one
// `dialogStore` queue (kind `"custom"`) with confirm/prompt, holding its
// non-serializable render/options off-proxy. Here we cover that store/promise
// logic; the React rendering half lives in ModalHost.

const customIds = () =>
  dialogStore.entries.filter((e) => e.kind === "custom").map((e) => e.id);

const promptEntries = () =>
  dialogStore.entries.filter((e) => e.kind === "prompt");

afterEach(() => {
  // Drain anything a failing assertion might have left open.
  for (const e of [...dialogStore.entries]) resolveDialog(e.id, undefined);
});

describe("custom modals", () => {
  it("showModal enqueues a custom entry and stores render/options off-proxy", () => {
    const render = () => null;
    void showModal(render, { title: "Hi", size: "lg" });

    const ids = customIds();
    expect(ids).toHaveLength(1);
    const entry = getCustomModal(ids[0]);
    expect(entry?.render).toBe(render);
    expect(entry?.options).toEqual({ title: "Hi", size: "lg" });
  });

  it("resolveDialog resolves with the result and clears the entry", async () => {
    const promise = showModal(() => null);
    const id = customIds()[0];

    resolveDialog(id, "saved");

    await expect(promise).resolves.toBe("saved");
    expect(customIds()).not.toContain(id);
    expect(getCustomModal(id)).toBeUndefined();
  });

  it("a bare resolve (or close()) resolves undefined", async () => {
    const promise = showModal(() => null);
    resolveDialog(customIds()[0], undefined);
    await expect(promise).resolves.toBeUndefined();
  });

  it("a second resolve is a no-op (double-close is safe)", async () => {
    const promise = showModal(() => null);
    const id = customIds()[0];

    resolveDialog(id, "first");
    // Must not throw and must not change the already-settled value.
    expect(() => resolveDialog(id, "second")).not.toThrow();

    await expect(promise).resolves.toBe("first");
  });

  it("stacks independently — settling one leaves the other open", () => {
    void showModal(() => null);
    void showModal(() => null);
    const [first, second] = customIds();

    resolveDialog(first, undefined);

    expect(customIds()).toEqual([second]);
    expect(getCustomModal(second)).toBeDefined();
  });
});

// The imperative prompt behind `ctx.ui.prompt` (and the host's terminal-rename
// flow). Here we cover the store/promise logic; the input + buttons live in
// ModalHost. The host-only `resetLabel` adds a third button whose chosen value
// is the empty string — the "clear the value" signal callers act on.
describe("prompt", () => {
  it("enqueues a prompt entry carrying its opts (no resetLabel by default)", () => {
    void prompt({ title: "Rename", label: "Name" });

    const entries = promptEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].opts).toMatchObject({ title: "Rename", label: "Name" });
    expect(entries[0].opts.resetLabel).toBeUndefined();
  });

  it("carries resetLabel through to the entry when provided", () => {
    void prompt({ title: "Rename", resetLabel: "Reset" });
    expect(promptEntries()[0].opts.resetLabel).toBe("Reset");
  });

  it("resolves with the entered value and clears the entry", async () => {
    const promise = prompt({ title: "Rename" });
    const id = promptEntries()[0].id;

    resolveDialog(id, "my-name");

    await expect(promise).resolves.toBe("my-name");
    expect(promptEntries()).toHaveLength(0);
  });

  it('reset resolves with "" — the clear signal', async () => {
    const promise = prompt({ title: "Rename", resetLabel: "Reset" });

    // What the Reset button does: resolveDialog(id, "").
    resolveDialog(promptEntries()[0].id, "");

    await expect(promise).resolves.toBe("");
  });

  it("cancel/dismiss resolves null", async () => {
    const promise = prompt({ title: "Rename" });
    resolveDialog(promptEntries()[0].id, null);
    await expect(promise).resolves.toBeNull();
  });
});
