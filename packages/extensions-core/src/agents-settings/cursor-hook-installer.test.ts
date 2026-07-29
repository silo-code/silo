import { describe, it, expect } from "vitest";
import {
  hasCursorHookInstalled,
  withCursorHookInstalled,
  withCursorHookUninstalled,
  type CursorHooksFile,
} from "./cursor-hook-installer";

const MARKER = "silo-managed-agent-hook";
const spec = {
  hookEvent: "sessionStart",
  marker: MARKER,
  buildCommand: () => `python3 -c "print(1)" # ${MARKER}`,
};

/** Mirrors a real ~/.cursor/hooks.json that already has a third-party hook. */
const WITH_SUPERSET: CursorHooksFile = {
  version: 1,
  hooks: {
    sessionStart: [
      { command: "/Users/x/.superset/hooks/cursor-hook.sh SessionStart" },
    ],
    sessionEnd: [
      { command: "/Users/x/.superset/hooks/cursor-hook.sh SessionEnd" },
    ],
  },
};

describe("hasCursorHookInstalled", () => {
  it("is false for an empty / missing file", () => {
    expect(hasCursorHookInstalled({}, spec)).toBe(false);
    expect(hasCursorHookInstalled({ version: 1, hooks: {} }, spec)).toBe(false);
  });

  it("is false when only third-party hooks are present", () => {
    expect(hasCursorHookInstalled(WITH_SUPERSET, spec)).toBe(false);
  });

  it("is true once Silo's command is present", () => {
    const installed = withCursorHookInstalled(WITH_SUPERSET, spec);
    expect(hasCursorHookInstalled(installed, spec)).toBe(true);
  });
});

describe("withCursorHookInstalled", () => {
  it("appends without touching existing sessionStart or other events", () => {
    const next = withCursorHookInstalled(WITH_SUPERSET, spec);
    expect(next.version).toBe(1);
    expect(next.hooks!.sessionStart).toHaveLength(2);
    expect(next.hooks!.sessionStart![0]).toEqual(
      WITH_SUPERSET.hooks!.sessionStart![0],
    );
    expect(next.hooks!.sessionStart![1].command).toContain(MARKER);
    expect(next.hooks!.sessionEnd).toEqual(WITH_SUPERSET.hooks!.sessionEnd);
  });

  it("is idempotent", () => {
    const once = withCursorHookInstalled(WITH_SUPERSET, spec);
    const twice = withCursorHookInstalled(once, spec);
    expect(twice.hooks!.sessionStart).toHaveLength(2);
    expect(twice).toBe(once);
  });

  it("refreshes the command body when Silo's correlator has changed", () => {
    const stale = withCursorHookInstalled(WITH_SUPERSET, {
      ...spec,
      buildCommand: () => `python3 -c "old" # ${MARKER}`,
    });
    const refreshed = withCursorHookInstalled(stale, {
      ...spec,
      buildCommand: () => `python3 -c "new" # ${MARKER}`,
    });
    expect(refreshed.hooks!.sessionStart).toHaveLength(2);
    const silo = refreshed.hooks!.sessionStart!.find((e) =>
      e.command?.includes(MARKER),
    );
    expect(silo?.command).toContain("new");
    expect(silo?.command).not.toContain("old");
  });

  it("seeds version: 1 on a brand-new file", () => {
    const next = withCursorHookInstalled({}, spec);
    expect(next.version).toBe(1);
    expect(next.hooks!.sessionStart).toHaveLength(1);
  });
});

describe("withCursorHookUninstalled", () => {
  it("removes only Silo's entry and leaves third-party hooks", () => {
    const installed = withCursorHookInstalled(WITH_SUPERSET, spec);
    const uninstalled = withCursorHookUninstalled(installed, spec);
    expect(uninstalled.hooks!.sessionStart).toHaveLength(1);
    expect(uninstalled.hooks!.sessionStart![0]).toEqual(
      WITH_SUPERSET.hooks!.sessionStart![0],
    );
    expect(uninstalled.hooks!.sessionEnd).toEqual(
      WITH_SUPERSET.hooks!.sessionEnd,
    );
  });
});
