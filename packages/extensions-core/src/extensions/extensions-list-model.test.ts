import { describe, it, expect } from "vitest";
import type { InstalledExtension } from "@silo-code/extension-host/internal";
import {
  describeSource,
  filterExtensions,
  localInstallSource,
  partitionBuiltins,
  showsReloadHint,
  showsUpdateAction,
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
  it("returns everything when the query is empty", () => {
    expect(filterExtensions(list, { query: "" })).toHaveLength(2);
  });

  it("keeps built-ins — they're grouped, not filtered out", () => {
    expect(filterExtensions(list, { query: "" }).map((e) => e.id)).toContain(
      "silo.git",
    );
  });

  it("matches on name, id, publisher, and description", () => {
    const byName = filterExtensions(list, { query: "git" });
    expect(byName.map((e) => e.id)).toEqual(["silo.git"]);

    const byPublisher = filterExtensions(list, { query: "silo" });
    expect(byPublisher.map((e) => e.id)).toEqual(["silo.git"]);

    const byDescription = filterExtensions(list, { query: "greets" });
    expect(byDescription.map((e) => e.id)).toEqual(["acme.hello"]);
  });

  it("ignores surrounding whitespace and case", () => {
    expect(
      filterExtensions(list, { query: "  GIT " }).map((e) => e.id),
    ).toEqual(["silo.git"]);
  });

  it("returns a copy, leaving the caller's list alone", () => {
    const out = filterExtensions(list, { query: "" });
    expect(out).not.toBe(list);
  });
});

describe("partitionBuiltins", () => {
  it("splits the user's own installs from Silo's built-ins", () => {
    const { installed, builtin } = partitionBuiltins(list);
    expect(installed.map((e) => e.id)).toEqual(["acme.hello"]);
    expect(builtin.map((e) => e.id)).toEqual(["silo.git"]);
  });

  it("preserves the incoming order within each group", () => {
    const many = [
      ext({ id: "silo.a", builtin: true }),
      ext({ id: "acme.a" }),
      ext({ id: "silo.b", builtin: true }),
      ext({ id: "acme.b" }),
    ];
    const { installed, builtin } = partitionBuiltins(many);
    expect(installed.map((e) => e.id)).toEqual(["acme.a", "acme.b"]);
    expect(builtin.map((e) => e.id)).toEqual(["silo.a", "silo.b"]);
  });

  it("leaves a group empty rather than absent when nothing qualifies", () => {
    // The page uses emptiness to decide whether to render the heading at all.
    const { installed, builtin } = partitionBuiltins([
      ext({ id: "acme.only" }),
    ]);
    expect(installed).toHaveLength(1);
    expect(builtin).toEqual([]);
  });
});

describe("showsUpdateAction", () => {
  const source = { kind: "folder", value: "/src/ext" } as const;

  it("offers Update for a third-party row with a recorded source", () => {
    expect(showsUpdateAction(ext({ source }))).toBe(true);
    // Visible even while disabled — updating doesn't require it to be running.
    expect(showsUpdateAction(ext({ source, enabled: false }))).toBe(true);
  });

  it("hides Update for built-ins and legacy records without a source", () => {
    expect(showsUpdateAction(ext({ builtin: true, source }))).toBe(false);
    expect(showsUpdateAction(ext({}))).toBe(false);
  });
});

describe("describeSource", () => {
  it("formats each source kind with its label", () => {
    expect(describeSource({ kind: "folder", value: "/src/ext" })).toBe(
      "Folder: /src/ext",
    );
    expect(
      describeSource({ kind: "url", value: "https://example.com/ext.tgz" }),
    ).toBe("URL: https://example.com/ext.tgz");
    expect(describeSource({ kind: "npm", value: "acme-ext@1.2.0" })).toBe(
      "npm: acme-ext@1.2.0",
    );
  });

  it("is undefined when there's no recorded source", () => {
    expect(describeSource(undefined)).toBeUndefined();
  });
});

describe("localInstallSource", () => {
  it("returns the source only for non-registry installs", () => {
    expect(
      localInstallSource(ext({ source: { kind: "folder", value: "/e" } })),
    ).toEqual({ kind: "folder", value: "/e" });
    expect(
      localInstallSource(ext({ source: { kind: "url", value: "https://x" } }))
        ?.kind,
    ).toBe("url");
    expect(
      localInstallSource(ext({ source: { kind: "npm", value: "acme-ext" } }))
        ?.kind,
    ).toBe("npm");
    // Registry is the normal case — nothing to call out.
    expect(
      localInstallSource(ext({ source: { kind: "registry", value: "a.b" } })),
    ).toBeNull();
  });

  it("is null for legacy source-less records and undefined", () => {
    expect(localInstallSource(ext({}))).toBeNull();
    expect(localInstallSource(undefined)).toBeNull();
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
