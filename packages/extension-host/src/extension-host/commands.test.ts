import { describe, it, expect } from "vitest";
import { commandRegistry, executeCommandAsync } from "./commands";

// Helper: register a temp command, run the test, dispose it.
function withCmd(
  id: string,
  run: (...args: unknown[]) => unknown | Promise<unknown>,
  fn: () => Promise<void> | void,
) {
  return async () => {
    const d = commandRegistry.register({ id, label: id, run });
    try {
      await fn();
    } finally {
      d.dispose();
    }
  };
}

describe("executeCommandAsync", () => {
  it(
    "resolves with the return value of a sync command",
    withCmd(
      "cmd.sync",
      () => 42,
      async () => {
        expect(await executeCommandAsync("cmd.sync")).toBe(42);
      },
    ),
  );

  it(
    "resolves with the resolved value of an async command",
    withCmd(
      "cmd.async",
      async () => "hello",
      async () => {
        expect(await executeCommandAsync("cmd.async")).toBe("hello");
      },
    ),
  );

  it(
    "passes positional args through to run",
    withCmd(
      "cmd.args",
      (...args) => args,
      async () => {
        const result = await executeCommandAsync("cmd.args", 1, "two", true);
        expect(result).toEqual([1, "two", true]);
      },
    ),
  );

  it("rejects (never throws synchronously) when the id is unknown", async () => {
    await expect(executeCommandAsync("cmd.no.such")).rejects.toThrow(
      "Unknown command: cmd.no.such",
    );
  });

  it(
    "rejects when the command throws synchronously",
    withCmd(
      "cmd.throws",
      () => {
        throw new Error("boom");
      },
      async () => {
        await expect(executeCommandAsync("cmd.throws")).rejects.toThrow("boom");
      },
    ),
  );

  it(
    "rejects when the command returns a rejected promise",
    withCmd(
      "cmd.rejects",
      async () => {
        throw new Error("async boom");
      },
      async () => {
        await expect(executeCommandAsync("cmd.rejects")).rejects.toThrow(
          "async boom",
        );
      },
    ),
  );

  it(
    "zero-arg void commands resolve with undefined",
    withCmd(
      "cmd.void",
      () => undefined,
      async () => {
        expect(await executeCommandAsync("cmd.void")).toBeUndefined();
      },
    ),
  );
});
