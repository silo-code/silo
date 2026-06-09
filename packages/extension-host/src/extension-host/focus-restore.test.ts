import { afterEach, describe, expect, it } from "vitest";
import { restoreTarget } from "./focus-restore";

// Build a `.side-pane` region with a focusable button inside it.
function regionButton(): HTMLButtonElement {
  const pane = document.createElement("div");
  pane.className = "side-pane";
  const btn = document.createElement("button");
  pane.appendChild(btn);
  document.body.appendChild(pane);
  return btn;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("restoreTarget", () => {
  it("restores the last region element when focus was dropped to the body", () => {
    const last = regionButton();
    expect(restoreTarget(document.body, last)).toBe(last);
  });

  it("leaves focus alone when it already sits on a region element", () => {
    const current = regionButton();
    const last = regionButton();
    expect(restoreTarget(current, last)).toBeNull();
  });

  it("does not restore an element that left the DOM", () => {
    const last = regionButton();
    last.parentElement!.remove(); // workspace/panel closed while away
    expect(restoreTarget(document.body, last)).toBeNull();
  });

  it("does not restore a remembered element outside any region", () => {
    const stray = document.createElement("button");
    document.body.appendChild(stray);
    expect(restoreTarget(document.body, stray)).toBeNull();
  });

  it("returns null when there is nothing to restore", () => {
    expect(restoreTarget(document.body, null)).toBeNull();
  });
});
