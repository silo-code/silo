// Browse-view rules: search/category filtering, removed entries hidden,
// installed/update state, and installability.

import { describe, it, expect } from "vitest";
import type {
  InstalledExtension,
  RegistryExtension,
  RegistryUpdate,
} from "@silo-code/extension-host/internal";
import {
  browseInstallState,
  filterRegistry,
  isInstallable,
  registryCategories,
} from "./browse-model";

const entry = (
  id: string,
  over: Partial<RegistryExtension> = {},
): RegistryExtension => ({
  id,
  description: `${id} description`,
  categories: ["monitoring"],
  repo: `acme/${id}`,
  status: "active",
  latest: {
    version: "1.0.0",
    tarballUrl: "https://example.com/x.tgz",
    mirrorUrl: null,
    sha256: "abc",
    size: 1,
    engine: null,
    permissions: [],
    provenance: "none",
    publishedAt: "",
  },
  totalDownloads: 0,
  readme: `/readme/${id}.md`,
  detail: `/ext/${id}.json`,
  ...over,
});

const installedRow = (id: string): InstalledExtension => ({
  id,
  name: id,
  version: "1.0.0",
  publisher: "acme",
  enabled: true,
  loaded: true,
  builtin: false,
  permissions: [],
  hostVersion: "1.0.0",
  engineCompatible: true,
  source: { kind: "registry", value: id },
});

describe("filterRegistry", () => {
  const entries = [
    entry("acme.weather", { categories: ["status-bar"] }),
    entry("acme.clock", { description: "A clock panel" }),
    entry("acme.gone", { status: "removed" }),
  ];

  it("matches id, description, and category; hides removed", () => {
    expect(
      filterRegistry(entries, { query: "", category: "" }).map((e) => e.id),
    ).toEqual(["acme.weather", "acme.clock"]);
    expect(
      filterRegistry(entries, { query: "clock panel", category: "" }),
    ).toHaveLength(1);
    expect(
      filterRegistry(entries, { query: "status-b", category: "" })[0].id,
    ).toBe("acme.weather");
    expect(
      filterRegistry(entries, { query: "", category: "status-bar" }),
    ).toHaveLength(1);
    expect(
      filterRegistry(entries, { query: "weather", category: "monitoring" }),
    ).toHaveLength(0);
  });
});

describe("registryCategories", () => {
  it("is the sorted unique set", () => {
    expect(
      registryCategories([
        entry("a.a", { categories: ["z", "monitoring"] }),
        entry("a.b", { categories: ["monitoring"] }),
      ]),
    ).toEqual(["monitoring", "z"]);
  });
});

describe("browseInstallState", () => {
  const updates: RegistryUpdate[] = [
    {
      id: "acme.weather",
      name: "acme.weather",
      installedVersion: "1.0.0",
      latestVersion: "1.1.0",
      widensPermissions: false,
    },
  ];

  it("prefers update-available over installed, else not-installed", () => {
    const installed = [
      installedRow("acme.weather"),
      installedRow("acme.clock"),
    ];
    expect(browseInstallState(entry("acme.weather"), installed, updates)).toBe(
      "update-available",
    );
    expect(browseInstallState(entry("acme.clock"), installed, updates)).toBe(
      "installed",
    );
    expect(browseInstallState(entry("acme.new"), installed, updates)).toBe(
      "not-installed",
    );
  });
});

describe("isInstallable", () => {
  it("requires a published release", () => {
    expect(isInstallable(entry("a.a"))).toBe(true);
    expect(isInstallable(entry("a.a", { latest: null }))).toBe(false);
  });
});
