import { describe, it, expect } from "vitest";
import {
  buildCopilotHookFile,
  hasCopilotHookInstalled,
} from "./copilot-hook-installer";

const MARKER = "silo-managed-agent-hook";
const spec = {
  hookEvent: "sessionStart",
  marker: MARKER,
  buildCommand: () => `python3 -c "print(1)" # ${MARKER}`,
};

describe("buildCopilotHookFile", () => {
  it("writes a versioned dedicated file with a command entry", () => {
    const file = buildCopilotHookFile(spec);
    expect(file.version).toBe(1);
    expect(file.hooks!.sessionStart).toHaveLength(1);
    expect(file.hooks!.sessionStart![0]).toEqual({
      type: "command",
      command: spec.buildCommand(),
    });
  });
});

describe("hasCopilotHookInstalled", () => {
  it("is false for null / empty", () => {
    expect(hasCopilotHookInstalled(null, spec)).toBe(false);
    expect(hasCopilotHookInstalled({}, spec)).toBe(false);
  });

  it("is true for a file built by buildCopilotHookFile", () => {
    expect(hasCopilotHookInstalled(buildCopilotHookFile(spec), spec)).toBe(
      true,
    );
  });

  it("also recognizes a bash-field command carrying the marker", () => {
    expect(
      hasCopilotHookInstalled(
        {
          version: 1,
          hooks: {
            sessionStart: [{ type: "command", bash: `echo hi # ${MARKER}` }],
          },
        },
        spec,
      ),
    ).toBe(true);
  });
});
