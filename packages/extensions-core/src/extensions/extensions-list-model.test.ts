import { describe, it, expect } from "vitest";
import type { InstalledExtension } from "@silo-code/extension-host/internal";
import {
  filterExtensions,
  hasBuiltins,
  showsReloadHint,
} from "./extensions-list-model";

function ext(over: Partial<InstalledExtension>): InstalledExtension {
  return {
    id: "acme.x",
    name: "Acme",
    version: "1.0.0",
    publisher: "acme",
    enabled: true,
    loaded: true,
    builtin: false,
    permissions: [],
    ...over,
  };
}

const list: InstalledExtension[] = [
  ext({ id: "silo.git", name: "Git", publisher: "Silo", builtin: true }),
  ext({
    id: "acme.hello",
    name: "Hello World",
    publisher: "acme",
    description: "Greets you",
  }),
];

describe("filterExtensions", () => {
  it("returns everything when query is empty and built-ins are shown", () => {
    expect(
      filterExtensions(list, { query: "", showBuiltins: true }),
    ).toHaveLength(2);
  });

  it("hides built-ins when the toggle is off", () => {
    const out = filterExtensions(list, { query: "", showBuiltins: false });
    expect(out.map((e) => e.id)).toEqual(["acme.hello"]);
  });

  it("matches on name, id, publisher, and description", () => {
    const byName = filterExtensions(list, { query: "git", showBuiltins: true });
    expect(byName.map((e) => e.id)).toEqual(["silo.git"]);

    const byPublisher = filterExtensions(list, {
      query: "silo",
      showBuiltins: true,
    });
    expect(byPublisher.map((e) => e.id)).toEqual(["silo.git"]);

    const byDescription = filterExtensions(list, {
      query: "greets",
      showBuiltins: true,
    });
    expect(byDescription.map((e) => e.id)).toEqual(["acme.hello"]);
  });

  it("respects the built-in toggle together with the query", () => {
    // "Git" matches a built-in, but built-ins are hidden → no results.
    expect(
      filterExtensions(list, { query: "git", showBuiltins: false }),
    ).toHaveLength(0);
  });
});

describe("hasBuiltins", () => {
  it("is true when any row is a built-in", () => {
    expect(hasBuiltins(list)).toBe(true);
  });
  it("is false for a third-party-only list", () => {
    expect(hasBuiltins([ext({ id: "acme.hello" })])).toBe(false);
  });
});

describe("showsReloadHint", () => {
  it("shows only when disabled and a reload is required", () => {
    expect(showsReloadHint(ext({ enabled: false, reloadRequired: true }))).toBe(
      true,
    );
    // Enabled, or no dock-kind contribution → no hint.
    expect(showsReloadHint(ext({ enabled: true, reloadRequired: true }))).toBe(
      false,
    );
    expect(showsReloadHint(ext({ enabled: false }))).toBe(false);
  });
});
