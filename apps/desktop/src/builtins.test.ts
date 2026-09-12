import { describe, it, expect, vi } from "vitest";

// `builtins.ts` imports every bundled extension, so this file pulls in the
// whole workbench. `activateExtensions` is stubbed so importing it registers
// nothing; the rest is real.
const activateExtensions = vi.hoisted(() => vi.fn());
vi.mock("@silo-code/extension-host", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@silo-code/extension-host")>()),
  activateExtensions,
}));

const { activateBuiltins } = await import("./builtins");

// Session 8 (Agent Sessions sprint) moved the Chat panel back in-tree as a
// regular bundled `silo.*` extension — activated unconditionally, like every
// other entry here, with no `chatAgents` gate (RFC 0039 already retired it).
describe("activateBuiltins", () => {
  it("activates the built-in set with nothing force-disabled", () => {
    activateBuiltins();
    const [builtins, disabled] = activateExtensions.mock.calls[0]!;
    expect(builtins.length).toBeGreaterThan(0);
    expect(disabled).toBeUndefined();
  });

  it("bundles the Chat panel unconditionally", () => {
    activateBuiltins();
    const ids: string[] = activateExtensions.mock.calls[0]![0].map(
      (e: { id: string }) => e.id,
    );
    expect(ids).toContain("silo.agents-chat-panel");
    expect(ids).not.toContain("core.acp-chat");
  });
});
