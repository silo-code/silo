import { describe, it, expect, vi } from "vitest";
import type { EditorSaveEvent } from "@silo-code/sdk";
import {
  getEditorService,
  registerDocumentProvider,
  emitDidSave,
} from "./editor-service";

// B6 — document access: getText / isDirty / onDidSave. Drives the host service
// directly; a "mounted editor" is simulated by registering a document provider.

const svc = getEditorService();

describe("EditorService.getText / isDirty (B6)", () => {
  it("resolves undefined for an editor with no registered provider", async () => {
    await expect(svc.getText("nope")).resolves.toBeUndefined();
    expect(svc.isDirty("nope")).toBe(false);
  });

  it("reads live text and dirty state from a registered provider", async () => {
    let text = "hello";
    let dirty = false;
    const sub = registerDocumentProvider("e1", {
      getText: () => text,
      isDirty: () => dirty,
    });
    await expect(svc.getText("e1")).resolves.toBe("hello");
    expect(svc.isDirty("e1")).toBe(false);

    text = "hello world";
    dirty = true;
    await expect(svc.getText("e1")).resolves.toBe("hello world");
    expect(svc.isDirty("e1")).toBe(true);

    sub.dispose();
    await expect(svc.getText("e1")).resolves.toBeUndefined();
    expect(svc.isDirty("e1")).toBe(false);
  });

  it("a stale provider's dispose does not clobber a remounted provider", async () => {
    const first = registerDocumentProvider("e2", {
      getText: () => "first",
      isDirty: () => false,
    });
    // Remount: same editorId re-registers before the old effect cleanup runs.
    registerDocumentProvider("e2", {
      getText: () => "second",
      isDirty: () => true,
    });
    first.dispose(); // stale cleanup — must be a no-op
    await expect(svc.getText("e2")).resolves.toBe("second");
    expect(svc.isDirty("e2")).toBe(true);
  });
});

describe("EditorService.onDidSave (B6 / Event<T>)", () => {
  it("fires listeners with the save payload and stops after dispose", () => {
    const seen: EditorSaveEvent[] = [];
    const sub = svc.onDidSave((e) => seen.push(e));

    emitDidSave({ editorId: "e3", filePath: "/ws/a.txt" });
    expect(seen).toEqual([{ editorId: "e3", filePath: "/ws/a.txt" }]);

    sub.dispose();
    emitDidSave({ editorId: "e3", filePath: "/ws/a.txt" });
    expect(seen).toHaveLength(1); // no delivery after dispose
  });

  it("delivers to every current listener", () => {
    const a = vi.fn();
    const b = vi.fn();
    const subA = svc.onDidSave(a);
    const subB = svc.onDidSave(b);
    emitDidSave({ editorId: "e4", filePath: "/ws/b.txt" });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    subA.dispose();
    subB.dispose();
  });
});
