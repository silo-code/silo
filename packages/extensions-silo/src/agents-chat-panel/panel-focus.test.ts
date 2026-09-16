import { describe, expect, it } from "vitest";
import { isPanelBackgroundClick } from "./panel-focus";

function el(html: string, selector: string): Element {
  const container = document.createElement("div");
  container.innerHTML = html;
  const found = container.querySelector(selector);
  if (!found) throw new Error(`no match for ${selector}`);
  return found;
}

describe("isPanelBackgroundClick", () => {
  it("is true for plain transcript text", () => {
    const span = el("<div><span>hello</span></div>", "span");
    expect(isPanelBackgroundClick(span, false)).toBe(true);
  });

  it("is true for the message row and scroller gaps", () => {
    const row = el(
      '<div class="acp-chat__message"><span>hi</span></div>',
      ".acp-chat__message",
    );
    expect(isPanelBackgroundClick(row, false)).toBe(true);
  });

  it("is false on a button, even a nested icon inside it", () => {
    const icon = el("<button><svg></svg></button>", "svg");
    expect(isPanelBackgroundClick(icon, false)).toBe(false);
  });

  it("is false on a link", () => {
    const a = el('<a href="x">link</a>', "a");
    expect(isPanelBackgroundClick(a, false)).toBe(false);
  });

  it("is false on a tool head marked role=button", () => {
    const head = el(
      '<div role="button"><span>Edit foo.ts</span></div>',
      "span",
    );
    expect(isPanelBackgroundClick(head, false)).toBe(false);
  });

  it("is false on the textarea itself", () => {
    const textarea = el("<textarea></textarea>", "textarea");
    expect(isPanelBackgroundClick(textarea, false)).toBe(false);
  });

  it("is false while there is an active text selection", () => {
    const span = el("<div><span>hello</span></div>", "span");
    expect(isPanelBackgroundClick(span, true)).toBe(false);
  });

  it("is false for a non-Element target", () => {
    expect(isPanelBackgroundClick(null, false)).toBe(false);
  });
});
