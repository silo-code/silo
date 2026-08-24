import { describe, expect, it } from "vitest";
import type { SettingsPage } from "@silo-code/sdk";
import { EXTENSIONS_SETTINGS_GROUP } from "./settings-pages";
import {
  PLACEHOLDER_ICON,
  railIconFor,
  railSections,
  resolveActivePage,
  sortSettingsPages,
} from "./settings-rail";

function page(over: Partial<SettingsPage> & { id: string }): SettingsPage {
  return {
    title: over.id,
    component: () => null,
    ...over,
  };
}

const editor = page({
  id: "editor",
  title: "Editor",
  group: "1_general",
  order: 1,
});
const terminal = page({
  id: "terminal",
  title: "Terminal",
  group: "1_general",
  order: 2,
});
const layout = page({
  id: "layout",
  title: "Layout",
  group: "1_general",
  order: 3,
});
const agents = page({ id: "agents", title: "Agents", group: "8_agents" });
const about = page({ id: "about", title: "About Silo", group: "9_about" });
const manager = page({
  id: "extensions",
  title: "Extensions",
  group: EXTENSIONS_SETTINGS_GROUP,
  order: -1,
});
const contributed = page({
  id: "acme.linter",
  title: "Acme Linter",
  group: EXTENSIONS_SETTINGS_GROUP,
});

describe("sortSettingsPages", () => {
  it("orders by group, then explicit order, then title", () => {
    const sorted = sortSettingsPages([about, terminal, editor]);
    expect(sorted.map((p) => p.id)).toEqual(["editor", "terminal", "about"]);
  });

  it("breaks an order tie alphabetically by title", () => {
    const b = page({ id: "b", title: "Beta", group: "1_general" });
    const a = page({ id: "a", title: "Alpha", group: "1_general" });
    expect(sortSettingsPages([b, a]).map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("leaves the caller's array alone", () => {
    const input = [about, editor];
    sortSettingsPages(input);
    expect(input.map((p) => p.id)).toEqual(["about", "editor"]);
  });
});

describe("railSections", () => {
  it("puts everything Silo ships in Application, in rail order", () => {
    const [app] = railSections([about, terminal, editor]);
    expect(app.key).toBe("application");
    expect(app.label).toBe("Application");
    expect(app.pages.map((p) => p.id)).toEqual(["editor", "terminal", "about"]);
  });

  it("heads Application with the lead pages, in their own order", () => {
    // Extensions / Layout / Agents lead regardless of the group+order they
    // register with — `agents` sorts last of the three by group, and `layout`
    // sorts after `editor` and `terminal` within 1_general.
    const [app] = railSections([
      about,
      terminal,
      editor,
      manager,
      layout,
      agents,
    ]);
    expect(app.pages.map((p) => p.id)).toEqual([
      "extensions",
      "layout",
      "agents",
      "editor",
      "terminal",
      "about",
    ]);
  });

  it("skips a lead page this build doesn't register", () => {
    const [app] = railSections([editor, manager, agents]);
    expect(app.pages.map((p) => p.id)).toEqual([
      "extensions",
      "agents",
      "editor",
    ]);
  });

  it("leaves only genuinely contributed pages under Extensions", () => {
    const sections = railSections([contributed, editor, manager]);
    expect(sections.map((s) => s.key)).toEqual(["application", "extensions"]);
    expect(sections[1].pages.map((p) => p.id)).toEqual(["acme.linter"]);
  });

  it("omits a section with nothing in it rather than heading an empty list", () => {
    expect(railSections([editor]).map((s) => s.key)).toEqual(["application"]);
    // The manager alone is an Application section, not an Extensions one.
    expect(railSections([manager]).map((s) => s.key)).toEqual(["application"]);
    expect(railSections([contributed]).map((s) => s.key)).toEqual([
      "extensions",
    ]);
  });

  it("is empty when nothing is registered", () => {
    expect(railSections([])).toEqual([]);
  });
});

describe("railIconFor", () => {
  it("gives a known page its own glyph", () => {
    expect(railIconFor(editor)).toBe("Code");
    expect(railIconFor(manager)).toBe("PuzzlePiece");
  });

  it("falls back to the placeholder for a contributed page", () => {
    expect(railIconFor(contributed)).toBe(PLACEHOLDER_ICON);
  });
});

describe("resolveActivePage", () => {
  const sections = railSections([about, editor, manager]);

  it("honors the selected page", () => {
    expect(resolveActivePage(sections, "about")?.id).toBe("about");
  });

  it("falls back to the first page when nothing is selected", () => {
    // Which is now the Extensions manager, at the head of Application.
    expect(resolveActivePage(sections, null)?.id).toBe("extensions");
  });

  it("falls back when the selected page is no longer registered", () => {
    // e.g. the extension contributing it was just disabled.
    expect(resolveActivePage(sections, "acme.linter")?.id).toBe("extensions");
  });

  it("is null when there are no pages at all", () => {
    expect(resolveActivePage([], "editor")).toBeNull();
  });
});
