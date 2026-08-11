import { describe, expect, it } from "vitest";
import { allWorkspaces } from "./workspace-loader-all";
import { baseWorkspaces } from "./workspace-loader";

describe("workspace catalogs", () => {
  it("keeps the homepage catalog free of recorder-only workspaces", () => {
    const ids = baseWorkspaces.map((w) => w.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "website",
        "docs",
        "api",
        "build-server",
        "mobile",
      ]),
    );
    expect(ids).not.toContain("extension-demo");
    expect(ids).not.toContain("terminals-demo");
  });

  it("includes recorder-only workspaces in the full catalog", () => {
    const ids = allWorkspaces.map((w) => w.id);
    expect(ids).toContain("extension-demo");
    expect(ids).toContain("terminals-demo");
    expect(ids).toEqual(
      expect.arrayContaining(baseWorkspaces.map((w) => w.id)),
    );
  });
});
