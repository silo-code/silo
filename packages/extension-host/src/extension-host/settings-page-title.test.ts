import { describe, expect, it } from "vitest";
import type { SettingsPage } from "@silo-code/sdk";
import { eatDuplicateSettingsTitle, paneTitleFor } from "./settings-page-title";

function page(over: Partial<SettingsPage> & { title: string }): SettingsPage {
  return {
    id: over.id ?? "x",
    component: () => null,
    ...over,
  };
}

describe("paneTitleFor", () => {
  it("returns the registered title for the active page", () => {
    expect(paneTitleFor(page({ title: "System Monitor" }))).toBe(
      "System Monitor",
    );
  });

  it("returns null when no page is active", () => {
    expect(paneTitleFor(undefined)).toBeNull();
    expect(paneTitleFor(null)).toBeNull();
  });
});

describe("eatDuplicateSettingsTitle", () => {
  function mount(html: string): HTMLElement {
    const root = document.createElement("div");
    root.innerHTML = html;
    document.body.appendChild(root);
    return root;
  }

  it("hides a leading h2 whose text matches the host title", () => {
    const root = mount(
      `<div class="sms-settings-page"><h2 class="sms-settings-title">System Monitor</h2><div class="body">x</div></div>`,
    );
    const eaten = eatDuplicateSettingsTitle(root, "System Monitor");
    expect(eaten?.hidden).toBe(true);
    expect(eaten?.textContent).toBe("System Monitor");
  });

  it("hides an h2 nested in a header wrapper at the top of the page", () => {
    const root = mount(
      `<div class="es-page"><div class="es-header"><h2>Editor</h2></div><input /></div>`,
    );
    expect(eatDuplicateSettingsTitle(root, "Editor")?.hidden).toBe(true);
  });

  it("is a no-op when the page already omitted its title", () => {
    const root = mount(
      `<div class="es-page"><input placeholder="Search" /><div class="silo-section">rows</div></div>`,
    );
    expect(eatDuplicateSettingsTitle(root, "Editor")).toBeNull();
  });

  it("does not hide a matching h2 that sits below other content", () => {
    const root = mount(
      `<div class="page"><button type="button">Browse</button><h2>Extensions</h2></div>`,
    );
    expect(eatDuplicateSettingsTitle(root, "Extensions")).toBeNull();
    expect(root.querySelector("h2")?.hidden).toBe(false);
  });

  it("does not hide a leading h2 with different text", () => {
    const root = mount(`<div><h2>Authentication</h2></div>`);
    expect(eatDuplicateSettingsTitle(root, "GitHub Actions")).toBeNull();
    expect(root.querySelector("h2")?.hidden).toBe(false);
  });
});
