import { describe, it, expect } from "vitest";
import {
  validateWorkspaceName,
  visiblePropertyPages,
} from "./workspace-properties-model";
import type { WorkspacePropertyPage } from "@silo-code/sdk";
import type { Workspace } from "./workspace-helpers";

describe("validateWorkspaceName", () => {
  it("accepts a normal name unchanged", () => {
    expect(validateWorkspaceName("My Workspace")).toEqual({
      ok: true,
      value: "My Workspace",
    });
  });

  it("trims surrounding whitespace", () => {
    expect(validateWorkspaceName("  spaced  ")).toEqual({
      ok: true,
      value: "spaced",
    });
  });

  it("rejects an empty string", () => {
    const result = validateWorkspaceName("");
    expect(result.ok).toBe(false);
  });

  it("rejects a whitespace-only string", () => {
    const result = validateWorkspaceName("   ");
    expect(result.ok).toBe(false);
  });

  it("returns a human-readable error message when invalid", () => {
    const result = validateWorkspaceName("");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0);
  });
});

function page(
  id: string,
  visible?: (ws: Workspace) => boolean,
): WorkspacePropertyPage {
  return { id, title: id, component: () => null, visible };
}

const ws = { id: "ws_1", name: "One" } as Workspace;

describe("visiblePropertyPages", () => {
  it("includes a page with no visible predicate", () => {
    const pages = [page("a")];
    expect(visiblePropertyPages(pages, ws)).toEqual(pages);
  });

  it("includes a page whose visible predicate returns true", () => {
    const pages = [page("a", () => true)];
    expect(visiblePropertyPages(pages, ws)).toEqual(pages);
  });

  it("excludes a page whose visible predicate returns false", () => {
    const pages = [page("a", () => false)];
    expect(visiblePropertyPages(pages, ws)).toEqual([]);
  });

  it("passes the workspace through to the predicate", () => {
    let received: Workspace | undefined;
    visiblePropertyPages([page("a", (w) => ((received = w), true))], ws);
    expect(received).toBe(ws);
  });

  it("preserves input order and filters independently per page", () => {
    const pages = [
      page("hide", () => false),
      page("show1"),
      page("show2", () => true),
    ];
    expect(visiblePropertyPages(pages, ws).map((p) => p.id)).toEqual([
      "show1",
      "show2",
    ]);
  });
});
