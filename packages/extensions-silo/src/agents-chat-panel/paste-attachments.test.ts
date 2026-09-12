import { describe, it, expect } from "vitest";
import {
  classifyClipboardPaste,
  filePathFromLine,
  filePathsFromClipboardGetData,
  filePathsFromClipboardText,
  pastedFileName,
  pastedFilePath,
} from "./paste-attachments";

describe("filePathFromLine", () => {
  it("decodes a file:// URI, including encoded spaces", () => {
    expect(filePathFromLine("file:///Users/d/my%20notes/a.md")).toBe(
      "/Users/d/my notes/a.md",
    );
  });

  it("strips the extra slash on a Windows file:// URI", () => {
    expect(filePathFromLine("file:///C:/work/main.rs")).toBe("C:/work/main.rs");
  });

  it("accepts a bare absolute path", () => {
    expect(filePathFromLine("/Users/d/notes/todo.md")).toBe(
      "/Users/d/notes/todo.md",
    );
    expect(filePathFromLine("C:\\work\\main.rs")).toBe("C:\\work\\main.rs");
  });

  it("skips blanks, comments, and prose", () => {
    expect(filePathFromLine("")).toBeUndefined();
    expect(filePathFromLine("# comment")).toBeUndefined();
    expect(filePathFromLine("look at /Users/d/x")).toBeUndefined();
    expect(filePathFromLine("https://example.com/a.png")).toBeUndefined();
  });
});

describe("filePathsFromClipboardText", () => {
  it("returns every line when they are all paths", () => {
    expect(
      filePathsFromClipboardText(
        "file:///Users/a.ts\n# skip\nfile:///Users/b.ts\n",
      ),
    ).toEqual(["/Users/a.ts", "/Users/b.ts"]);
  });

  it("returns nothing when any line is not a path", () => {
    expect(
      filePathsFromClipboardText("/Users/a.ts\nplease also read this"),
    ).toEqual([]);
  });

  it("rejects a bare path that looks like a command, or has no extension", () => {
    expect(
      filePathsFromClipboardText("/usr/bin/env python3 script.py", {
        barePathNeedsExtension: true,
      }),
    ).toEqual([]);
    expect(
      filePathsFromClipboardText("/usr/bin/env", {
        barePathNeedsExtension: true,
      }),
    ).toEqual([]);
    expect(
      filePathsFromClipboardText("/Users/d/notes/todo.md", {
        barePathNeedsExtension: true,
      }),
    ).toEqual(["/Users/d/notes/todo.md"]);
  });
});

describe("filePathsFromClipboardGetData", () => {
  it("prefers text/uri-list over text/plain", () => {
    expect(
      filePathsFromClipboardGetData((type) =>
        type === "text/uri-list"
          ? "file:///Users/from-list.ts"
          : "file:///Users/from-plain.ts",
      ),
    ).toEqual(["/Users/from-list.ts"]);
  });

  it("falls back to a path-only text/plain paste", () => {
    expect(
      filePathsFromClipboardGetData((type) =>
        type === "text/plain" ? "/Users/d/notes/todo.md" : "",
      ),
    ).toEqual(["/Users/d/notes/todo.md"]);
  });

  it("does not steal a shell command from text/plain", () => {
    expect(
      filePathsFromClipboardGetData((type) =>
        type === "text/plain" ? "/usr/bin/env python3 script.py" : "",
      ),
    ).toEqual([]);
  });
});

describe("classifyClipboardPaste", () => {
  const empty = () => "";

  it("takes paths when the clipboard carries a uri-list", () => {
    expect(
      classifyClipboardPaste({
        getData: (type) =>
          type === "text/uri-list" ? "file:///Users/a.ts" : "",
        fileCount: 1,
      }),
    ).toEqual({ kind: "paths", paths: ["/Users/a.ts"] });
  });

  it("takes files when there is a FileList and no paths", () => {
    expect(classifyClipboardPaste({ getData: empty, fileCount: 2 })).toEqual({
      kind: "files",
    });
  });

  it("leaves ordinary text alone", () => {
    expect(
      classifyClipboardPaste({
        getData: (type) => (type === "text/plain" ? "hello there" : ""),
        fileCount: 0,
      }),
    ).toEqual({ kind: "none" });
  });
});

describe("pastedFileName", () => {
  it("keeps the File's own name and strips path separators", () => {
    expect(pastedFileName("shot.png", "image/png")).toBe("shot.png");
    expect(pastedFileName("a/b/c.png", "image/png")).toBe("c.png");
  });

  it("derives a name from the MIME type when the File is unnamed", () => {
    expect(pastedFileName("", "image/png")).toBe("paste.png");
    expect(pastedFileName("  ", "image/jpeg")).toBe("paste.jpg");
    expect(pastedFileName("", "application/octet-stream")).toBe("paste");
  });
});

describe("pastedFilePath", () => {
  it("nests under pasted/ with a stamp so two pastes do not collide", () => {
    expect(pastedFilePath("/tmp/store/", "shot.png", 1700000000000)).toBe(
      "/tmp/store/pasted/1700000000000-shot.png",
    );
  });
});
