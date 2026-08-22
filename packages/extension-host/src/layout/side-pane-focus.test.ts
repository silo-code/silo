import { afterEach, describe, expect, it } from "vitest";
import { focusActivePaneContent } from "./side-pane-focus";

// Builds: host > [active pane with a roving item + its tabindex=-1 close button]
// + [inactive pane].
function buildHost() {
  const host = document.createElement("div");
  host.className = "side-tab-host";

  const active = document.createElement("div");
  active.className = "tab-pane";
  active.dataset.active = "true";
  const item = document.createElement("li");
  item.className = "ws-item";
  item.tabIndex = 0; // roving "current" item
  const close = document.createElement("button");
  close.tabIndex = -1; // out of tab order
  item.appendChild(close);
  active.appendChild(item);

  const inactive = document.createElement("div");
  inactive.className = "tab-pane";
  inactive.dataset.active = "false";

  host.append(active, inactive);
  document.body.appendChild(host);
  return { host, item };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("focusActivePaneContent", () => {
  it("focuses the active pane's first tabbable (region-cycle / click entry)", () => {
    const { host, item } = buildHost();
    expect(focusActivePaneContent(host)).toBe(true);
    expect(document.activeElement).toBe(item);
  });

  it("ignores the inactive pane's focusables", () => {
    const { host } = buildHost();
    // Put a focusable in the inactive pane; it must not be chosen.
    const inactive = host.querySelector<HTMLElement>(
      '.tab-pane[data-active="false"]',
    )!;
    const stray = document.createElement("button");
    inactive.appendChild(stray);
    focusActivePaneContent(host);
    expect(document.activeElement).not.toBe(stray);
  });

  it("returns false when there is no active pane", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    expect(focusActivePaneContent(host)).toBe(false);
  });

  it("skips earlier tabindex=-1 controls and lands on the roving item", () => {
    // Mirrors the workspaces list: an inactive row (tabindex -1) whose close
    // button (also tabindex -1) precedes the active row (tabindex 0) in the DOM.
    // The entry point must be the active row, not the earlier close button.
    const host = document.createElement("div");
    const pane = document.createElement("div");
    pane.className = "tab-pane";
    pane.dataset.active = "true";
    const ul = document.createElement("ul");

    const row0 = document.createElement("li");
    row0.tabIndex = -1;
    const close0 = document.createElement("button");
    close0.tabIndex = -1;
    row0.appendChild(close0);

    const row1 = document.createElement("li"); // the roving "current" row
    row1.tabIndex = 0;

    ul.append(row0, row1);
    pane.appendChild(ul);
    host.appendChild(pane);
    document.body.appendChild(host);

    expect(focusActivePaneContent(host)).toBe(true);
    expect(document.activeElement).toBe(row1);
  });

  it("skips a header's own chrome and lands on the content behind it", () => {
    // Mirrors the Navigator: a header toolbar button (an ordinary, naturally
    // tabbable <button>, no tabindex needed) sits before the active view's
    // content in the DOM. Marked `data-focus-chrome`, so region entry must
    // skip past it to the content's roving item, not stop on the button.
    const host = document.createElement("div");
    const pane = document.createElement("div");
    pane.className = "tab-pane";
    pane.dataset.active = "true";

    const header = document.createElement("div");
    header.dataset.focusChrome = "";
    const addButton = document.createElement("button");
    header.appendChild(addButton);

    const list = document.createElement("ul");
    const row = document.createElement("li");
    row.tabIndex = 0;
    list.appendChild(row);

    pane.append(header, list);
    host.appendChild(pane);
    document.body.appendChild(host);

    expect(focusActivePaneContent(host)).toBe(true);
    expect(document.activeElement).toBe(row);
  });
});
