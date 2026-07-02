import { describe, it, expect, beforeEach, vi } from "vitest";
import { contextKeys, setContextKey, onContextChange } from "./context-keys";

// The store is module-level shared state — reset the keys between tests.
beforeEach(() => {
  setContextKey("activeEditorId", null);
  setContextKey("activeEditorViewId", null);
});

describe("setContextKey", () => {
  it("mirrors activeEditorViewId into the deprecated activeViewerId alias", () => {
    setContextKey("activeEditorViewId", "core.text-editor");
    expect(contextKeys.activeEditorViewId).toBe("core.text-editor");
    expect(contextKeys.activeViewerId).toBe("core.text-editor");

    setContextKey("activeEditorViewId", null);
    expect(contextKeys.activeViewerId).toBeNull();
  });

  it("does not mirror other keys into the alias", () => {
    setContextKey("activeEditorViewId", "core.text-editor");
    setContextKey("activeEditorId", "ed_1");
    expect(contextKeys.activeViewerId).toBe("core.text-editor"); // untouched
  });

  it("notifies listeners once per change, and not for unchanged values", () => {
    const fn = vi.fn();
    const sub = onContextChange(fn);

    setContextKey("activeEditorId", null); // unchanged → no notify
    expect(fn).not.toHaveBeenCalled();

    setContextKey("activeEditorId", "ed_1");
    expect(fn).toHaveBeenCalledTimes(1);

    setContextKey("activeEditorViewId", "core.text-editor"); // alias mirrors in the same notify
    expect(fn).toHaveBeenCalledTimes(2);

    sub.dispose();
    setContextKey("activeEditorId", "ed_2");
    expect(fn).toHaveBeenCalledTimes(2); // disposed → no further notifies
  });
});
