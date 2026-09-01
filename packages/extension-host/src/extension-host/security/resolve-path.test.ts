import { describe, it, expect } from "vitest";
import { PathDeniedError } from "@silo-code/sdk";
import type { Permission } from "@silo-code/sdk";
import {
  isAbsolutePath,
  normalizePath,
  toAbsolute,
  withinRoots,
  resolvePath,
  type PathScope,
} from "./resolve-path";

function scope(over: Partial<PathScope> = {}): PathScope {
  return {
    roots: ["/work/project"],
    ownDirs: [],
    trusted: false,
    permissions: new Set<Permission>(),
    ...over,
  };
}

describe("normalizePath", () => {
  it("collapses slashes and drops '.'", () => {
    expect(normalizePath("/work//project/./src")).toBe("/work/project/src");
  });
  it("resolves '..' segments", () => {
    expect(normalizePath("/work/project/src/../lib")).toBe("/work/project/lib");
  });
  it("does not ascend above the root for absolute paths", () => {
    expect(normalizePath("/work/../../etc")).toBe("/etc");
    expect(normalizePath("/..")).toBe("/");
  });
  it("keeps leading '..' for relative paths", () => {
    expect(normalizePath("../sibling/file")).toBe("../sibling/file");
  });
  it("returns '' for an empty relative path", () => {
    expect(normalizePath("")).toBe("");
  });

  // Windows: drive-letter and UNC anchors.
  it("converts '\\' to '/'", () => {
    expect(normalizePath("C:\\Users\\dave\\notes.txt")).toBe(
      "C:/Users/dave/notes.txt",
    );
  });
  it("upper-cases the drive letter", () => {
    expect(normalizePath("c:/work/project")).toBe("C:/work/project");
  });
  it("treats a drive as an anchor '..' cannot escape", () => {
    expect(normalizePath("C:/work/../../etc")).toBe("C:/etc");
    expect(normalizePath("C:/..")).toBe("C:/");
  });
  it("resolves '..' within a drive path", () => {
    expect(normalizePath("C:/work/project/src/../lib")).toBe(
      "C:/work/project/lib",
    );
  });
  it("preserves a UNC prefix as an anchor", () => {
    expect(normalizePath("\\\\server\\share\\dir\\file")).toBe(
      "//server/share/dir/file",
    );
    expect(normalizePath("//server/share/a/../b")).toBe("//server/share/b");
  });
});

describe("isAbsolutePath", () => {
  it("accepts POSIX, drive, and UNC forms", () => {
    expect(isAbsolutePath("/etc/hosts")).toBe(true);
    expect(isAbsolutePath("C:/Users/dave")).toBe(true);
    expect(isAbsolutePath("c:\\Users\\dave")).toBe(true);
    expect(isAbsolutePath("\\\\server\\share")).toBe(true);
    expect(isAbsolutePath("//server/share")).toBe(true);
  });
  it("rejects relative paths and drive-relative 'C:foo'", () => {
    expect(isAbsolutePath("src/index.ts")).toBe(false);
    expect(isAbsolutePath("./notes.md")).toBe(false);
    expect(isAbsolutePath("../up")).toBe(false);
    expect(isAbsolutePath("C:foo")).toBe(false);
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
  it("keeps a Windows drive-absolute path absolute, not workspace-relative", () => {
    // The RFC 0032 bug: a drive-absolute own-dir path was treated as relative
    // and spliced onto roots[0].
    expect(
      toAbsolute(
        ["C:/dev/silo"],
        "C:/Users/dave/.config/silo/extension-storage/silo.tasks/tasks.jsonl",
      ),
    ).toBe(
      "C:/Users/dave/.config/silo/extension-storage/silo.tasks/tasks.jsonl",
    );
  });
  it("resolves a relative path against a Windows root", () => {
    expect(toAbsolute(["C:\\dev\\silo"], "src/index.ts")).toBe(
      "C:/dev/silo/src/index.ts",
    );
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
  it("matches a Windows path regardless of drive-letter case", () => {
    expect(withinRoots(["C:/work/project"], "c:/work/project/src/a.ts")).toBe(
      true,
    );
    expect(withinRoots(["c:\\work\\project"], "C:/work/project")).toBe(true);
  });
  it("rejects a same-path on a different drive", () => {
    expect(withinRoots(["C:/work/project"], "D:/work/project/a.ts")).toBe(
      false,
    );
  });
  it("handles a root with a trailing separator", () => {
    expect(withinRoots(["/work/project/"], "/work/project/a.ts")).toBe(true);
    expect(withinRoots(["C:/work/project/"], "C:/work/project/a.ts")).toBe(
      true,
    );
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

// RFC 0032 — an extension's own storage directories are inside its sandbox,
// read and write, with no fs:* permission declared.
describe("resolvePath — own storage directories", () => {
  const OWN = "/cfg/extension-storage/acme.hello";
  const owned = (over: Partial<PathScope> = {}) =>
    scope({
      ownDirs: [`${OWN}/global`, `${OWN}/workspaces/ws_1`],
      ...over,
    });

  it("allows reads and writes inside the global dir with no permissions", () => {
    const s = owned();
    expect(resolvePath(s, `${OWN}/global/tasks.jsonl`, "write")).toBe(
      `${OWN}/global/tasks.jsonl`,
    );
    expect(resolvePath(s, `${OWN}/global/deep/nested/x`, "read")).toBe(
      `${OWN}/global/deep/nested/x`,
    );
  });

  it("allows the directory itself, not just its contents", () => {
    expect(resolvePath(owned(), `${OWN}/global`, "write")).toBe(
      `${OWN}/global`,
    );
  });

  it("allows the active workspace's own dir", () => {
    expect(
      resolvePath(owned(), `${OWN}/workspaces/ws_1/notes.md`, "write"),
    ).toBe(`${OWN}/workspaces/ws_1/notes.md`);
  });

  it("works with no workspace open — the global dir doesn't need one", () => {
    const s = owned({ roots: [] });
    expect(resolvePath(s, `${OWN}/global/tasks.jsonl`, "write")).toBe(
      `${OWN}/global/tasks.jsonl`,
    );
  });

  it("denies a sibling that merely shares the prefix", () => {
    expect(() => resolvePath(owned(), `${OWN}/global-evil/x`, "write")).toThrow(
      PathDeniedError,
    );
  });

  it("denies an escape via '..' out of the own dir", () => {
    expect(() =>
      resolvePath(owned(), `${OWN}/global/../../other.ext/global/x`, "read"),
    ).toThrow(PathDeniedError);
  });

  it("denies another workspace's dir under the same extension", () => {
    expect(() =>
      resolvePath(owned(), `${OWN}/workspaces/ws_2/notes.md`, "read"),
    ).toThrow(PathDeniedError);
  });

  it("denies another extension's storage directory", () => {
    expect(() =>
      resolvePath(
        owned(),
        "/cfg/extension-storage/other.tool/global/x",
        "read",
      ),
    ).toThrow(PathDeniedError);
  });

  it("does not resolve relative paths against an own dir", () => {
    // Relative paths still resolve against the workspace — the one surprising
    // part of the rule, and the reason `globalDir()` hands back an absolute path.
    expect(resolvePath(owned(), "tasks.jsonl", "write")).toBe(
      "/work/project/tasks.jsonl",
    );
  });

  it("leaves every other path's behaviour unchanged", () => {
    const s = owned({ permissions: new Set<Permission>(["fs:read"]) });
    expect(resolvePath(s, "/etc/hosts", "read")).toBe("/etc/hosts");
    expect(() => resolvePath(s, "/etc/hosts", "write")).toThrow(
      PathDeniedError,
    );
    expect(resolvePath(s, "src/app.tsx", "read")).toBe(
      "/work/project/src/app.tsx",
    );
  });
});

// RFC 0032 on Windows — a zero-permission extension writing into its own
// drive-absolute storage directory. Regression cases for the bug where the
// drive-absolute path was treated as relative and spliced onto roots[0].
describe("resolvePath — own storage directories on Windows", () => {
  const OWN = "C:/Users/dave/.config/silo/extension-storage/silo.tasks";
  const win = (over: Partial<PathScope> = {}) =>
    scope({
      roots: ["C:/dev/silo"],
      ownDirs: [`${OWN}/global`, `${OWN}/workspaces/ws_1`],
      ...over,
    });

  it("allows a write into the workspace storage dir with no permissions", () => {
    expect(
      resolvePath(win(), `${OWN}/workspaces/ws_1/tasks.jsonl`, "write"),
    ).toBe(`${OWN}/workspaces/ws_1/tasks.jsonl`);
  });

  it("allows a write into the global storage dir with no workspace open", () => {
    expect(
      resolvePath(win({ roots: [] }), `${OWN}/global/notes.log`, "write"),
    ).toBe(`${OWN}/global/notes.log`);
  });

  it("accepts a backslash-separated own-dir path", () => {
    const backslashed = `${OWN}/global/cache/probe.txt`.replace(/\//g, "\\");
    expect(resolvePath(win(), backslashed, "write")).toBe(
      `${OWN}/global/cache/probe.txt`,
    );
  });

  it("still denies a prefix-sibling of the storage dir", () => {
    expect(() => resolvePath(win(), `${OWN}/global-evil/x`, "write")).toThrow(
      PathDeniedError,
    );
  });

  it("still denies an out-of-workspace path without fs:write", () => {
    expect(() =>
      resolvePath(win(), "C:/Windows/System32/drivers/etc/hosts", "write"),
    ).toThrow(PathDeniedError);
  });

  it("still resolves a relative path against the Windows workspace root", () => {
    expect(resolvePath(win(), "src/app.tsx", "read")).toBe(
      "C:/dev/silo/src/app.tsx",
    );
  });
});
