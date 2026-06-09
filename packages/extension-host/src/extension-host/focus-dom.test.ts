import { afterEach, describe, expect, it } from "vitest";
import {
  TABBABLE,
  INTERACTIVE,
  firstTabbable,
  tabbablesIn,
  focusFirstOrContainer,
} from "./focus-dom";

afterEach(() => {
  document.body.innerHTML = "";
});

function mount(html: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
}

describe("TABBABLE selector", () => {
  it("matches natural controls but not disabled ones", () => {
    const root = mount(`
      <a href="#">a</a>
      <button>b</button>
      <button disabled>disabled</button>
      <input />
      <input disabled />
      <p>not focusable</p>
    `);
    const matches = Array.from(root.querySelectorAll(TABBABLE)).map(
      (e) => e.tagName + (e.hasAttribute("disabled") ? "[disabled]" : ""),
    );
    expect(matches).toEqual(["A", "BUTTON", "INPUT"]);
  });

  it("excludes tabindex=-1 on EVERY clause (incl. buttons) and includes [tabindex=0]", () => {
    const root = mount(`
      <button tabindex="-1">untabbable button</button>
      <div tabindex="-1">untabbable div</div>
      <div tabindex="0">roving item</div>
      <span contenteditable="true">editable</span>
    `);
    const matches = Array.from(root.querySelectorAll(TABBABLE));
    expect(matches).toHaveLength(2); // the tabindex=0 div + the contenteditable span
    expect(matches.some((e) => e.getAttribute("tabindex") === "-1")).toBe(
      false,
    );
  });
});

describe("INTERACTIVE selector", () => {
  it("matches controls including tabindex=-1 ones (they focus themselves)", () => {
    const root = mount(`
      <button tabindex="-1">close</button>
      <li tabindex="0">row</li>
      <span class="spacer"></span>
    `);
    expect(root.querySelector("button")!.matches(INTERACTIVE)).toBe(true); // -1 still interactive
    expect(root.querySelector("li")!.matches(INTERACTIVE)).toBe(true);
    expect(root.querySelector(".spacer")!.matches(INTERACTIVE)).toBe(false);
  });
});

describe("firstTabbable / tabbablesIn", () => {
  it("firstTabbable returns the first match, skipping tabindex=-1", () => {
    const root = mount(`
      <button tabindex="-1">skip</button>
      <button id="want">want</button>
      <a href="#">later</a>
    `);
    expect(firstTabbable(root)?.id).toBe("want");
  });

  it("tabbablesIn returns all matches in document order", () => {
    const root = mount(`<button>1</button><a href="#">2</a><input />`);
    expect(tabbablesIn(root).map((e) => e.tagName)).toEqual([
      "BUTTON",
      "A",
      "INPUT",
    ]);
  });

  it("firstTabbable returns null when nothing is tabbable", () => {
    expect(firstTabbable(mount(`<p>x</p><span>y</span>`))).toBeNull();
  });
});

describe("focusFirstOrContainer", () => {
  it("focuses the first tabbable inside the host", () => {
    const host = mount(`<div><button id="b">b</button></div>`)
      .firstElementChild as HTMLElement;
    expect(focusFirstOrContainer(host)).toBe(true);
    expect(document.activeElement).toBe(host.querySelector("#b"));
  });

  it("falls back to the host itself (making it focusable) when empty", () => {
    const host = mount(`<div class="bare"><p>no controls</p></div>`)
      .firstElementChild as HTMLElement;
    expect(host.hasAttribute("tabindex")).toBe(false);
    expect(focusFirstOrContainer(host)).toBe(true);
    expect(host.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(host);
  });
});
