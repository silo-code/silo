import { describe, it, expect, vi } from "vitest";

// `builtins.ts` imports every bundled extension, so this file pulls in the
// whole workbench. `activateExtensions` is stubbed so importing it registers
// nothing; the rest is real.
const activateExtensions = vi.hoisted(() => vi.fn());
vi.mock("@silo-code/extension-host", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@silo-code/extension-host")>()),
  activateExtensions,
}));

const { activateBuiltins, CHAT_PANEL_EXTENSION_ID } =
  await import("./builtins");

// RFC 0038: the Chat panel must be *registered* (its panel kind has to exist
// for layout deserialization and for `chatProfileHost` resolution) but must
// not *activate* until the `chatAgents` gate is known — which is only after
// hydrate, well past this synchronous call.
describe("activateBuiltins — the Chat panel starts registered but inactive", () => {
  it("hands the Chat panel to activateExtensions as an initially-disabled id", () => {
    activateBuiltins();
    const [builtins, disabled] = activateExtensions.mock.calls[0]!;
    expect(builtins.map((e: { id: string }) => e.id)).toContain(
      CHAT_PANEL_EXTENSION_ID,
    );
    expect(disabled).toEqual(new Set([CHAT_PANEL_EXTENSION_ID]));
  });

  it("names the bundled Chat panel", () => {
    expect(CHAT_PANEL_EXTENSION_ID).toBe("core.acp-chat");
  });

  it("registers it right after core.terminal, so its + menu entry sits beside New Terminal", () => {
    activateBuiltins();
    const ids = activateExtensions.mock.calls[0]![0].map(
      (e: { id: string }) => e.id,
    );
    expect(ids[ids.indexOf("core.terminal") + 1]).toBe(CHAT_PANEL_EXTENSION_ID);
  });

  it("disables nothing else", () => {
    activateBuiltins();
    expect(activateExtensions.mock.calls[0]![1].size).toBe(1);
  });
});
