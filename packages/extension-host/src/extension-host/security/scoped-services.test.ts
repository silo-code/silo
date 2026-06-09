import { describe, it, expect, vi } from "vitest";
import { PathDeniedError } from "@silo-code/sdk";
import type { Permission, FileService, ProcessService } from "@silo-code/sdk";
import { scopeFileService } from "../file-service";
import { scopeProcessService } from "../process-service";
import type { PathScope } from "./resolve-path";

function scope(over: Partial<PathScope> = {}): PathScope {
  return {
    roots: ["/work/project"],
    trusted: false,
    permissions: new Set<Permission>(),
    ...over,
  };
}

function fakeFiles() {
  return {
    readText: vi.fn(async () => "x"),
    readBytes: vi.fn(async () => new ArrayBuffer(0)),
    readDir: vi.fn(async () => []),
    pathExists: vi.fn(async () => true),
    writeText: vi.fn(async () => {}),
    createDir: vi.fn(async () => {}),
    rename: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
    reveal: vi.fn(async () => {}),
    watch: vi.fn(() => ({ dispose() {} })),
  } satisfies FileService;
}

describe("scopeFileService", () => {
  it("returns the base unchanged when trusted", () => {
    const base = fakeFiles();
    expect(scopeFileService(base, scope({ trusted: true }))).toBe(base);
  });

  it("resolves a relative read to an absolute workspace path", async () => {
    const base = fakeFiles();
    const fs = scopeFileService(base, scope());
    await fs.readText("src/a.ts");
    expect(base.readText).toHaveBeenCalledWith("/work/project/src/a.ts");
  });

  it("resolves both ends of a rename as writes", async () => {
    const base = fakeFiles();
    const fs = scopeFileService(base, scope());
    await fs.rename("a", "b");
    expect(base.rename).toHaveBeenCalledWith(
      "/work/project/a",
      "/work/project/b",
    );
  });

  it("rejects an out-of-workspace read without fs:read", async () => {
    const base = fakeFiles();
    const fs = scopeFileService(base, scope());
    await expect(fs.readText("/etc/hosts")).rejects.toBeInstanceOf(
      PathDeniedError,
    );
    expect(base.readText).not.toHaveBeenCalled();
  });

  it("allows an out-of-workspace read with fs:read but still blocks writes", async () => {
    const base = fakeFiles();
    const fs = scopeFileService(
      base,
      scope({ permissions: new Set<Permission>(["fs:read"]) }),
    );
    await fs.readText("/etc/hosts");
    expect(base.readText).toHaveBeenCalledWith("/etc/hosts");
    await expect(fs.writeText("/etc/hosts", "x")).rejects.toBeInstanceOf(
      PathDeniedError,
    );
  });

  it("treats reveal as a read", async () => {
    const base = fakeFiles();
    const fs = scopeFileService(base, scope());
    await expect(fs.reveal("/elsewhere")).rejects.toBeInstanceOf(
      PathDeniedError,
    );
  });
});

function fakeProcess() {
  const session = { id: "s1" } as never;
  return {
    spawn: vi.fn(async () => session),
    attach: vi.fn(async () => session),
    exec: vi.fn(async () => ({ stdout: "", stderr: "", code: 0 })),
  } satisfies ProcessService;
}

describe("scopeProcessService", () => {
  it("returns the base unchanged when trusted", () => {
    const base = fakeProcess();
    expect(scopeProcessService(base, scope({ trusted: true }))).toBe(base);
  });

  it("defaults exec cwd to the primary workspace root", async () => {
    const base = fakeProcess();
    const proc = scopeProcessService(base, scope());
    await proc.exec("git", ["status"]);
    expect(base.exec).toHaveBeenCalledWith("git", ["status"], {
      cwd: "/work/project",
    });
  });

  it("allows an in-workspace cwd", async () => {
    const base = fakeProcess();
    const proc = scopeProcessService(base, scope());
    await proc.exec("ls", [], { cwd: "/work/project/src" });
    expect(base.exec).toHaveBeenCalledWith("ls", [], {
      cwd: "/work/project/src",
    });
  });

  it("rejects an out-of-workspace cwd without the process permission", async () => {
    const base = fakeProcess();
    const proc = scopeProcessService(base, scope());
    await expect(proc.exec("ls", [], { cwd: "/" })).rejects.toBeInstanceOf(
      PathDeniedError,
    );
    expect(base.exec).not.toHaveBeenCalled();
  });

  it("allows any cwd with the process permission", async () => {
    const base = fakeProcess();
    const proc = scopeProcessService(
      base,
      scope({ permissions: new Set<Permission>(["process"]) }),
    );
    await proc.exec("ls", [], { cwd: "/" });
    expect(base.exec).toHaveBeenCalledWith("ls", [], { cwd: "/" });
  });

  it("scopes spawn cwd too", async () => {
    const base = fakeProcess();
    const proc = scopeProcessService(base, scope());
    await expect(proc.spawn({ cwd: "/outside" })).rejects.toBeInstanceOf(
      PathDeniedError,
    );
  });

  it("passes attach through untouched", async () => {
    const base = fakeProcess();
    const proc = scopeProcessService(base, scope());
    await proc.attach("s1", { cols: 80 });
    expect(base.attach).toHaveBeenCalledWith("s1", { cols: 80 });
  });
});
