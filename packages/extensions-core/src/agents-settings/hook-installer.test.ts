import { describe, it, expect } from "vitest";
import {
  hasHookInstalled,
  withHookInstalled,
  withHookUninstalled,
  type ClaudeSettings,
  type HookInstallSpec,
} from "./hook-installer";

// A minimal, self-contained hook spec (structurally what the catalog's
// AgentHookResume provides) — the merge logic is what's under test here, not
// the exact command; the real command's content is tested in the host's
// agent-catalog.test.ts. Declared locally so this pure-logic test imports
// nothing from the host.
const MARKER = "silo-managed-agent-hook";
const CLAUDE_SPEC: HookInstallSpec = {
  hookEvent: "SessionStart",
  marker: MARKER,
  buildCommand: () => `python3 -c "..." # ${MARKER}`,
};
const CODEX_SPEC: HookInstallSpec = {
  hookEvent: "SessionStart",
  marker: MARKER,
  buildCommand: () => `python3 -c "..." # ${MARKER}`,
  statusMessage: "Silo session tracking (getsilo.dev)",
};

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

describe("hasHookInstalled", () => {
  it("is false for settings with no hooks at all", () => {
    expect(hasHookInstalled({}, CLAUDE_SPEC)).toBe(false);
  });

  it("is false for settings with only third-party hooks", () => {
    expect(hasHookInstalled(SUPERSET_SETTINGS, CLAUDE_SPEC)).toBe(false);
  });

  it("is true once installed", () => {
    expect(
      hasHookInstalled(
        withHookInstalled(SUPERSET_SETTINGS, CLAUDE_SPEC),
        CLAUDE_SPEC,
      ),
    ).toBe(true);
  });
});

describe("withHookInstalled", () => {
  it("appends a new hook group without touching the existing (Superset) one", () => {
    const next = withHookInstalled(SUPERSET_SETTINGS, CLAUDE_SPEC);
    const sessionStart = next.hooks!.SessionStart;
    expect(sessionStart).toHaveLength(2);
    expect(sessionStart[0]).toEqual(SUPERSET_SETTINGS.hooks!.SessionStart[0]);
    expect(sessionStart[1].hooks![0].command).toContain(MARKER);
  });

  it("never touches other event hooks (SessionEnd)", () => {
    const next = withHookInstalled(SUPERSET_SETTINGS, CLAUDE_SPEC);
    expect(next.hooks!.SessionEnd).toEqual(SUPERSET_SETTINGS.hooks!.SessionEnd);
  });

  it("preserves unrelated top-level fields (env)", () => {
    const next = withHookInstalled(SUPERSET_SETTINGS, CLAUDE_SPEC);
    expect(next.env).toEqual(SUPERSET_SETTINGS.env);
  });

  it("is idempotent — installing twice doesn't add a second entry", () => {
    const once = withHookInstalled(SUPERSET_SETTINGS, CLAUDE_SPEC);
    const twice = withHookInstalled(once, CLAUDE_SPEC);
    expect(twice.hooks!.SessionStart).toHaveLength(2);
  });

  it("refreshes the command body when Silo's correlator has changed", () => {
    const stale = withHookInstalled(SUPERSET_SETTINGS, {
      ...CLAUDE_SPEC,
      buildCommand: () => `python3 -c "old" # ${CLAUDE_SPEC.marker}`,
    });
    const refreshed = withHookInstalled(stale, {
      ...CLAUDE_SPEC,
      buildCommand: () => `python3 -c "new" # ${CLAUDE_SPEC.marker}`,
    });
    expect(refreshed.hooks!.SessionStart).toHaveLength(2);
    const silo = refreshed
      .hooks!.SessionStart.flatMap((g) => g.hooks ?? [])
      .find((e) => e.command?.includes(CLAUDE_SPEC.marker));
    expect(silo?.command).toContain("new");
    expect(silo?.command).not.toContain("old");
  });

  it("works from a completely empty settings object", () => {
    const next = withHookInstalled({}, CLAUDE_SPEC);
    expect(hasHookInstalled(next, CLAUDE_SPEC)).toBe(true);
  });

  it("writes statusMessage onto the entry when the spec provides one", () => {
    const next = withHookInstalled({}, CODEX_SPEC);
    expect(next.hooks!.SessionStart[0].hooks![0].statusMessage).toBe(
      "Silo session tracking (getsilo.dev)",
    );
  });

  it("omits statusMessage entirely when the spec doesn't provide one", () => {
    const next = withHookInstalled({}, CLAUDE_SPEC);
    expect(next.hooks!.SessionStart[0].hooks![0]).not.toHaveProperty(
      "statusMessage",
    );
  });
});

describe("withHookUninstalled", () => {
  it("removes only Silo's own entry, leaving the Superset one intact", () => {
    const installed = withHookInstalled(SUPERSET_SETTINGS, CLAUDE_SPEC);
    const uninstalled = withHookUninstalled(installed, CLAUDE_SPEC);
    expect(hasHookInstalled(uninstalled, CLAUDE_SPEC)).toBe(false);
    expect(uninstalled.hooks!.SessionStart).toHaveLength(1);
    expect(uninstalled.hooks!.SessionStart[0]).toEqual(
      SUPERSET_SETTINGS.hooks!.SessionStart[0],
    );
  });

  it("never touches other event hooks (SessionEnd)", () => {
    const installed = withHookInstalled(SUPERSET_SETTINGS, CLAUDE_SPEC);
    const uninstalled = withHookUninstalled(installed, CLAUDE_SPEC);
    expect(uninstalled.hooks!.SessionEnd).toEqual(
      SUPERSET_SETTINGS.hooks!.SessionEnd,
    );
  });

  it("is a no-op when nothing is installed", () => {
    expect(withHookUninstalled(SUPERSET_SETTINGS, CLAUDE_SPEC)).toEqual(
      SUPERSET_SETTINGS,
    );
  });

  it("is a no-op on completely empty settings", () => {
    expect(withHookUninstalled({}, CLAUDE_SPEC)).toEqual({});
  });
});
