import { describe, it, expect } from "vitest";
import { PathDeniedError } from "@silo-code/sdk";
import type { Permission } from "@silo-code/sdk";
import {
  normalizePosix,
  toAbsolute,
  withinRoots,
  resolvePath,
  type PathScope,
} from "./resolve-path";

function scope(over: Partial<PathScope> = {}): PathScope {
  return {
    roots: ["/work/project"],
    trusted: false,
    permissions: new Set<Permission>(),
    ...over,
  };
}

describe("normalizePosix", () => {
  it("collapses slashes and drops '.'", () => {
    expect(normalizePosix("/work//project/./src")).toBe("/work/project/src");
  });
  it("resolves '..' segments", () => {
    expect(normalizePosix("/work/project/src/../lib")).toBe(
      "/work/project/lib",
    );
  });
  it("does not ascend above the root for absolute paths", () => {
    expect(normalizePosix("/work/../../etc")).toBe("/etc");
    expect(normalizePosix("/..")).toBe("/");
  });
  it("keeps leading '..' for relative paths", () => {
    expect(normalizePosix("../sibling/file")).toBe("../sibling/file");
  });
});

describe("toAbsolute", () => {
  it("normalizes an absolute path as-is", () => {
    expect(toAbsolute(["/work/project"], "/etc/hosts")).toBe("/etc/hosts");
  });
  it("resolves a relative path against the primary root", () => {
    expect(toAbsolute(["/work/project", "/other"], "src/index.ts")).toBe(
      "/work/project/src/index.ts",
    );
    expect(toAbsolute(["/work/project"], "./notes.md")).toBe(
      "/work/project/notes.md",
    );
  });
  it("returns null for a relative path with no roots", () => {
    expect(toAbsolute([], "src/index.ts")).toBeNull();
  });
});

describe("withinRoots", () => {
  const roots = ["/work/project", "/work/extra"];
  it("accepts a root itself and nested paths", () => {
    expect(withinRoots(roots, "/work/project")).toBe(true);
    expect(withinRoots(roots, "/work/project/src/a.ts")).toBe(true);
    expect(withinRoots(roots, "/work/extra/b.ts")).toBe(true);
  });
  it("rejects siblings and prefix look-alikes", () => {
    expect(withinRoots(roots, "/work/project-evil/x")).toBe(false);
    expect(withinRoots(roots, "/work")).toBe(false);
    expect(withinRoots(roots, "/etc/hosts")).toBe(false);
  });
});

describe("resolvePath", () => {
  it("passes trusted paths through untouched", () => {
    expect(resolvePath(scope({ trusted: true }), "/etc/hosts", "read")).toBe(
      "/etc/hosts",
    );
  });

  it("resolves a workspace-relative path to absolute", () => {
    expect(resolvePath(scope(), "src/app.tsx", "read")).toBe(
      "/work/project/src/app.tsx",
    );
  });

  it("allows an absolute path inside the workspace", () => {
    expect(resolvePath(scope(), "/work/project/out/log", "write")).toBe(
      "/work/project/out/log",
    );
  });

  it("allows a path in any of multiple roots", () => {
    const s = scope({ roots: ["/work/project", "/work/extra"] });
    expect(resolvePath(s, "/work/extra/file", "read")).toBe("/work/extra/file");
  });

  it("denies a path outside the workspace by default", () => {
    expect(() => resolvePath(scope(), "/etc/hosts", "read")).toThrow(
      PathDeniedError,
    );
  });

  it("denies an escape via '..' that leaves every root", () => {
    expect(() => resolvePath(scope(), "../../etc/hosts", "read")).toThrow(
      PathDeniedError,
    );
  });

  it("lifts an outside read with fs:read but not fs:write", () => {
    const reader = scope({ permissions: new Set<Permission>(["fs:read"]) });
    expect(resolvePath(reader, "/etc/hosts", "read")).toBe("/etc/hosts");
    expect(() => resolvePath(reader, "/etc/hosts", "write")).toThrow(
      PathDeniedError,
    );
  });

  it("lifts an outside write with fs:write", () => {
    const writer = scope({ permissions: new Set<Permission>(["fs:write"]) });
    expect(resolvePath(writer, "/tmp/out", "write")).toBe("/tmp/out");
  });

  it("denies a relative path when no workspace is open", () => {
    expect(() => resolvePath(scope({ roots: [] }), "a.txt", "read")).toThrow(
      PathDeniedError,
    );
  });

  it("carries the offending path on the error", () => {
    try {
      resolvePath(scope(), "/etc/hosts", "read");
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(PathDeniedError);
      expect((err as PathDeniedError).path).toBe("/etc/hosts");
    }
  });
});
