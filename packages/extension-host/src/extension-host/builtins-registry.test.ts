// Covers the built-in lifecycle registry: activation honoring the disabled set,
// hot disable/enable tearing down and rebuilding contributions, the inactive
// (not deleted) registry handle a disabled built-in leaves, and that core.* is
// excluded from the rows shown in the Extensions page. createContext is real
// (so dispose actually runs through ctx.subscriptions); the Tauri fs/watch
// boundary and the menu re-sync are mocked to keep this a fast unit.

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Extension } from "@silo-code/sdk";

vi.mock("../services/tauri-fs", () => ({
  fsReadText: vi.fn(),
  fsReadBytes: vi.fn(),
  fsWriteText: vi.fn(),
  fsWriteBytes: vi.fn(),
  fsCreateDir: vi.fn(),
  fsPathExists: vi.fn(),
  fsStat: vi.fn(),
  fsRename: vi.fn(),
  fsDelete: vi.fn(),
  fsReveal: vi.fn(),
  fsReadDir: vi.fn(),
  fsCopy: vi.fn(),
}));
vi.mock("../services/tauri-watch", () => ({
  startWatch: vi.fn(),
  stopWatch: vi.fn(),
  onFileChange: vi.fn(),
}));
// Keep menuItemRegistry real (createContext uses it); only stub the async
// native menu re-sync that enable/disable fire.
vi.mock("./menu-items", async (orig) => ({
  ...(await orig<typeof import("./menu-items")>()),
  syncMenu: vi.fn(async () => {}),
}));

import {
  registerBuiltins,
  enableBuiltin,
  disableBuiltin,
  isBuiltin,
  builtinRows,
} from "./builtins-registry";
import { getExtensionHandle } from "./extension-registry";

/** A fake built-in that counts activations/disposals via a tracked disposable. */
function makeFake(id: string, manifest?: Extension["manifest"]) {
  const counts = { activate: 0, dispose: 0 };
  const ext: Extension<{ tag: string }> = {
    id,
    manifest,
    activate(ctx) {
      counts.activate++;
      ctx.subscriptions.push({
        dispose: () => {
          counts.dispose++;
        },
      });
      return { tag: id };
    },
  };
  return { ext, counts };
}

beforeEach(() => {
  // Re-register an empty set to clear the registry between tests.
  registerBuiltins([], new Set());
});

describe("registerBuiltins", () => {
  it("activates enabled built-ins and skips disabled ones", () => {
    const a = makeFake("silo.a");
    const b = makeFake("silo.b");
    registerBuiltins([a.ext, b.ext], new Set(["silo.b"]));

    expect(a.counts.activate).toBe(1);
    expect(b.counts.activate).toBe(0);

    const rows = builtinRows();
    expect(rows.find((r) => r.id === "silo.a")?.enabled).toBe(true);
    expect(rows.find((r) => r.id === "silo.b")?.enabled).toBe(false);
  });

  it("records a disabled built-in so getExtension resolves an inactive handle", () => {
    const a = makeFake("silo.disabled-at-start");
    registerBuiltins([a.ext], new Set(["silo.disabled-at-start"]));

    const handle = getExtensionHandle("silo.disabled-at-start");
    expect(handle).toBeDefined();
    expect(handle?.active).toBe(false);
    expect(handle?.api).toBeUndefined();
  });

  it("derives row fields from the manifest with sensible fallbacks", () => {
    const withManifest = makeFake("silo.full", {
      name: "Full",
      description: "A described built-in.",
      version: "2.3.4",
    });
    const bare = makeFake("silo.bare");
    registerBuiltins([withManifest.ext, bare.ext], new Set());

    const full = builtinRows().find((r) => r.id === "silo.full")!;
    expect(full).toMatchObject({
      name: "Full",
      description: "A described built-in.",
      version: "2.3.4",
      publisher: "Silo",
      builtin: true,
    });

    const bareRow = builtinRows().find((r) => r.id === "silo.bare")!;
    expect(bareRow.name).toBe("silo.bare"); // falls back to id
    expect(bareRow.version).toBe("1.0.0"); // default version
    expect(bareRow.publisher).toBe("Silo");
  });

  it("excludes core.* from the rows shown in the Extensions page", () => {
    const core = makeFake("core.shell");
    const silo = makeFake("silo.feature");
    registerBuiltins([core.ext, silo.ext], new Set());

    const ids = builtinRows().map((r) => r.id);
    expect(ids).toContain("silo.feature");
    expect(ids).not.toContain("core.shell");
    // core.* is still a built-in (just not shown).
    expect(isBuiltin("core.shell")).toBe(true);
  });
});

describe("hot disable / enable", () => {
  it("disposes contributions on disable and rebuilds them on enable", () => {
    const a = makeFake("silo.toggle");
    registerBuiltins([a.ext], new Set());
    expect(a.counts.activate).toBe(1);
    expect(a.counts.dispose).toBe(0);

    disableBuiltin("silo.toggle");
    expect(a.counts.dispose).toBe(1);
    expect(builtinRows().find((r) => r.id === "silo.toggle")?.enabled).toBe(
      false,
    );
    // The handle survives (built-ins are never cleared) but is inactive.
    expect(getExtensionHandle("silo.toggle")?.active).toBe(false);

    enableBuiltin("silo.toggle");
    expect(a.counts.activate).toBe(2);
    expect(builtinRows().find((r) => r.id === "silo.toggle")?.enabled).toBe(
      true,
    );
    const handle = getExtensionHandle("silo.toggle");
    expect(handle?.active).toBe(true);
    expect(handle?.api).toEqual({ tag: "silo.toggle" });
  });

  it("is idempotent for repeated disable / enable", () => {
    const a = makeFake("silo.idem");
    registerBuiltins([a.ext], new Set());

    disableBuiltin("silo.idem");
    disableBuiltin("silo.idem"); // no-op
    expect(a.counts.dispose).toBe(1);

    enableBuiltin("silo.idem");
    enableBuiltin("silo.idem"); // no-op
    expect(a.counts.activate).toBe(2);
  });

  it("no-ops for an unknown id", () => {
    expect(isBuiltin("nope.nope")).toBe(false);
    expect(() => disableBuiltin("nope.nope")).not.toThrow();
    expect(() => enableBuiltin("nope.nope")).not.toThrow();
  });
});
