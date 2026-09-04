import { describe, it, expect, vi } from "vitest";
import { createFolderSelection } from "./folder-selection";

describe("createFolderSelection", () => {
  it("starts at the given initial folder", () => {
    expect(createFolderSelection("/repo").get()).toBe("/repo");
  });

  it("updates the current folder and notifies subscribers", () => {
    const selection = createFolderSelection("/repo");
    const onChange = vi.fn();
    selection.subscribe(onChange);
    selection.set("/repo-b");
    expect(selection.get()).toBe("/repo-b");
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("does not notify when set to the already-current folder", () => {
    const selection = createFolderSelection("/repo");
    const onChange = vi.fn();
    selection.subscribe(onChange);
    selection.set("/repo");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("stops notifying an unsubscribed listener", () => {
    const selection = createFolderSelection("/repo");
    const onChange = vi.fn();
    const unsubscribe = selection.subscribe(onChange);
    unsubscribe();
    selection.set("/repo-b");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("notifies every subscriber on a change", () => {
    const selection = createFolderSelection("/repo");
    const a = vi.fn();
    const b = vi.fn();
    selection.subscribe(a);
    selection.subscribe(b);
    selection.set("/repo-b");
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });
});
