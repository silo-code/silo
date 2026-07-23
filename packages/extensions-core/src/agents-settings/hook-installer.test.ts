import { describe, it, expect } from "vitest";
import {
  buildHookCommand,
  hasHookInstalled,
  withHookInstalled,
  withHookUninstalled,
  SILO_HOOK_MARKER,
  type ClaudeSettings,
} from "./hook-installer";

// Mirrors the real, confirmed shape of an existing settings.json with a
// third-party ("Superset") hook already installed on several events.
const SUPERSET_SETTINGS: ClaudeSettings = {
  env: { CLAUDE_CODE_ATTRIBUTION_HEADER: "0" },
  hooks: {
    SessionStart: [
      {
        hooks: [
          {
            type: "command",
            command:
              '[ -n "$SUPERSET_HOME_DIR" ] && "$SUPERSET_HOME_DIR/hooks/notify.sh" || true',
          },
        ],
      },
    ],
    SessionEnd: [
      { hooks: [{ type: "command", command: "some-other-tool-hook.sh" }] },
    ],
  },
};

describe("buildHookCommand", () => {
  it("includes the Silo marker for later identification", () => {
    expect(buildHookCommand()).toContain(SILO_HOOK_MARKER);
  });

  it("is a single line (no embedded newlines) — safe for a JSON string value", () => {
    expect(buildHookCommand()).not.toContain("\n");
  });
});

describe("hasHookInstalled", () => {
  it("is false for settings with no hooks at all", () => {
    expect(hasHookInstalled({})).toBe(false);
  });

  it("is false for settings with only third-party hooks", () => {
    expect(hasHookInstalled(SUPERSET_SETTINGS)).toBe(false);
  });

  it("is true once installed", () => {
    expect(hasHookInstalled(withHookInstalled(SUPERSET_SETTINGS))).toBe(true);
  });
});

describe("withHookInstalled", () => {
  it("appends a new hook group without touching the existing (Superset) one", () => {
    const next = withHookInstalled(SUPERSET_SETTINGS);
    const sessionStart = next.hooks!.SessionStart;
    expect(sessionStart).toHaveLength(2);
    expect(sessionStart[0]).toEqual(SUPERSET_SETTINGS.hooks!.SessionStart[0]);
    expect(sessionStart[1].hooks![0].command).toContain(SILO_HOOK_MARKER);
  });

  it("never touches other event hooks (SessionEnd)", () => {
    const next = withHookInstalled(SUPERSET_SETTINGS);
    expect(next.hooks!.SessionEnd).toEqual(SUPERSET_SETTINGS.hooks!.SessionEnd);
  });

  it("preserves unrelated top-level fields (env)", () => {
    const next = withHookInstalled(SUPERSET_SETTINGS);
    expect(next.env).toEqual(SUPERSET_SETTINGS.env);
  });

  it("is idempotent — installing twice doesn't add a second entry", () => {
    const once = withHookInstalled(SUPERSET_SETTINGS);
    const twice = withHookInstalled(once);
    expect(twice.hooks!.SessionStart).toHaveLength(2);
  });

  it("works from a completely empty settings object", () => {
    const next = withHookInstalled({});
    expect(hasHookInstalled(next)).toBe(true);
  });
});

describe("withHookUninstalled", () => {
  it("removes only Silo's own entry, leaving the Superset one intact", () => {
    const installed = withHookInstalled(SUPERSET_SETTINGS);
    const uninstalled = withHookUninstalled(installed);
    expect(hasHookInstalled(uninstalled)).toBe(false);
    expect(uninstalled.hooks!.SessionStart).toHaveLength(1);
    expect(uninstalled.hooks!.SessionStart[0]).toEqual(
      SUPERSET_SETTINGS.hooks!.SessionStart[0],
    );
  });

  it("never touches other event hooks (SessionEnd)", () => {
    const installed = withHookInstalled(SUPERSET_SETTINGS);
    const uninstalled = withHookUninstalled(installed);
    expect(uninstalled.hooks!.SessionEnd).toEqual(
      SUPERSET_SETTINGS.hooks!.SessionEnd,
    );
  });

  it("is a no-op when nothing is installed", () => {
    expect(withHookUninstalled(SUPERSET_SETTINGS)).toEqual(SUPERSET_SETTINGS);
  });

  it("is a no-op on completely empty settings", () => {
    expect(withHookUninstalled({})).toEqual({});
  });
});
