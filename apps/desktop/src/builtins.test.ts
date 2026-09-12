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

// RFC 0039: the Chat panel moved to `examples/extensions/acp-chat`, so there is
// no longer a bundled extension that has to be conditionally activated — and
// the `chatAgents` gate and its boot-order dance went with it.
describe("activateBuiltins", () => {
  it("activates the built-in set with nothing force-disabled", () => {
    activateBuiltins();
    const [builtins, disabled] = activateExtensions.mock.calls[0]!;
    expect(builtins.length).toBeGreaterThan(0);
    expect(disabled).toBeUndefined();
  });

  it("does not bundle a Chat panel", () => {
    activateBuiltins();
    const ids: string[] = activateExtensions.mock.calls[0]![0].map(
      (e: { id: string }) => e.id,
    );
    expect(ids).not.toContain("core.acp-chat");
  });
});
