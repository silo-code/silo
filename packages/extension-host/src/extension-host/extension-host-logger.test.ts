import { describe, it, expect, beforeEach } from "vitest";
import { outputStore, clearChannel } from "./output-store";

describe("extension-host-logger", () => {
  beforeEach(() => {
    clearChannel("silo:extension-host");
  });

  it("registers the Extension Host channel on import", async () => {
    await import("./extension-host-logger");
    expect(outputStore.channels["silo:extension-host"]).toBeDefined();
    expect(outputStore.channels["silo:extension-host"].displayName).toBe(
      "Extension Host",
    );
    expect(outputStore.order).toContain("silo:extension-host");
  });

  it("writes info entries to the channel", async () => {
    const { extHostLog } = await import("./extension-host-logger");
    extHostLog.info("test info message");
    const entries = outputStore.channels["silo:extension-host"].entries;
    const last = entries[entries.length - 1];
    expect(last.level).toBe("info");
    expect(last.message).toBe("test info message");
    expect(last.data).toBeUndefined();
  });

  it("writes error entries with structured data", async () => {
    const { extHostLog } = await import("./extension-host-logger");
    const err = new Error("boom");
    extHostLog.error("activation failed", err);
    const entries = outputStore.channels["silo:extension-host"].entries;
    const last = entries[entries.length - 1];
    expect(last.level).toBe("error");
    expect(last.message).toBe("activation failed");
    expect(last.data).toBe(err);
  });

  it("writes warn entries", async () => {
    const { extHostLog } = await import("./extension-host-logger");
    extHostLog.warn("dock kind registered");
    const entries = outputStore.channels["silo:extension-host"].entries;
    const last = entries[entries.length - 1];
    expect(last.level).toBe("warn");
    expect(last.message).toBe("dock kind registered");
  });

  it("writes debug entries", async () => {
    const { extHostLog } = await import("./extension-host-logger");
    extHostLog.debug("verbose detail", { x: 1 });
    const entries = outputStore.channels["silo:extension-host"].entries;
    const last = entries[entries.length - 1];
    expect(last.level).toBe("debug");
    expect(last.data).toEqual({ x: 1 });
  });

  it("clear() empties the channel", async () => {
    const { extHostLog } = await import("./extension-host-logger");
    extHostLog.info("one");
    extHostLog.info("two");
    extHostLog.clear();
    expect(outputStore.channels["silo:extension-host"].entries).toHaveLength(0);
  });
});
