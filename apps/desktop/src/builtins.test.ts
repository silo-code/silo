import { describe, it, expect, vi, beforeEach } from "vitest";

// `builtins.ts` imports every bundled extension, so this file pulls in the
// whole workbench. Only the flag getter is stubbed — the real internal barrel
// stays, because the extensions themselves read from it at module scope.
vi.mock("@silo-code/extension-host", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@silo-code/extension-host")>()),
  activateExtensions: vi.fn(),
}));
vi.mock("@silo-code/extension-host/internal", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@silo-code/extension-host/internal")
  >()),
  getBundledChatPanelEnabled: vi.fn(() => false),
}));

const { getBundledChatPanelEnabled } =
  await import("@silo-code/extension-host/internal");
const { builtinList } = await import("./builtins");

const flag = vi.mocked(getBundledChatPanelEnabled);

beforeEach(() => flag.mockReset());

describe("builtinList — the bundledChatPanel gate (RFC 0038 phase 3)", () => {
  it("leaves the Chat panel out while the flag is off", () => {
    flag.mockReturnValue(false);
    expect(builtinList().map((e) => e.id)).not.toContain("core.acp-chat");
  });

  it("includes it when the flag is on", () => {
    flag.mockReturnValue(true);
    expect(builtinList().map((e) => e.id)).toContain("core.acp-chat");
  });

  it("registers it right after core.terminal, so its + menu entry sits beside New Terminal", () => {
    flag.mockReturnValue(true);
    const ids = builtinList().map((e) => e.id);
    expect(ids[ids.indexOf("core.terminal") + 1]).toBe("core.acp-chat");
  });

  it("changes nothing else about the list", () => {
    flag.mockReturnValue(false);
    const off = builtinList().map((e) => e.id);
    flag.mockReturnValue(true);
    const on = builtinList().map((e) => e.id);
    expect(on.filter((id) => id !== "core.acp-chat")).toEqual(off);
  });
});
