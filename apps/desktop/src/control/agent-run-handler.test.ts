import { describe, it, expect, beforeEach, vi } from "vitest";
import { store } from "@silo-code/extension-host";
import type { WorkspaceInternal } from "@silo-code/extension-host/internal";
import type { ControlResult } from "./types";

// `agent.run` is the Control API's proving mutate-tier consumer (RFC 0034 R11).
// What separates it from the Forward-mode command it replaces is that every
// outcome is *returned* — so these tests assert the returned code as strictly as
// they assert what did or did not get created.

// The handler delegates the launch itself to the same service
// `ctx.agents.profiles` is built from, so that is the seam these tests drive:
// it owns the prompt precheck, the dialect decision, and the activate/focus
// that follow. What stays this handler's own — and what is asserted here — is
// resolving the profile, the `--ws` target, and the launch cwd.
const { launchProfile } = vi.hoisted(() => ({
  launchProfile: vi.fn((_options: Record<string, unknown>) => ({
    ok: true,
    terminalId: "term-1",
  })),
}));

vi.mock("@silo-code/extension-host/internal", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@silo-code/extension-host/internal")>();
  return {
    ...actual,
    createAgentProfilesService: () => ({
      list: () => [],
      launch: launchProfile,
    }),
  };
});

const { addAgentProfile } = await import("@silo-code/extension-host/internal");
const { applyControlAgentRun } = await import("./agent-run-handler");

function makeWorkspace(
  id: string,
  folder: string,
  extra?: string[],
  closedAt?: string,
): WorkspaceInternal {
  return {
    id,
    name: id,
    folder,
    extraFolders: extra,
    closedAt,
    createdAt: "",
    lastOpenedAt: "",
    terminals: [],
    editors: [],
    dockLayout: null,
    previewEditorId: null,
  };
}

/** The refusal code, or `undefined` for a success. Keeps every assertion below
 *  reading as "which code did the caller get". */
function code(result: ControlResult): string | undefined {
  return result.ok ? undefined : result.code;
}

/** The `data` of a successful result. */
function data(result: ControlResult): Record<string, unknown> {
  if (!result.ok) throw new Error(`expected success, got ${result.code}`);
  return result.data as Record<string, unknown>;
}

beforeEach(() => {
  store.workspaces = {};
  store.workspaceOrder = [];
  store.activeWorkspaceId = null;
  store.agentProfiles = [];
  launchProfile.mockClear();
});

describe("applyControlAgentRun — success", () => {
  it("returns the terminal it created and the workspace it ran in", () => {
    addAgentProfile({ id: "p", label: "P", command: "claude" });
    store.workspaces = { w: makeWorkspace("w", "/proj") };
    store.workspaceOrder = ["w"];

    const result = applyControlAgentRun({ cwd: "/proj/src", profileId: "p" });

    // The whole point of the conversion: an id the caller can act on next.
    expect(data(result)).toEqual({
      terminalId: "term-1",
      workspaceId: "w",
      workspaceName: "w",
      profileId: "p",
    });
    expect(launchProfile).toHaveBeenCalledWith({
      profileId: "p",
      workspaceId: "w",
      cwd: "/proj/src",
    });
  });

  it("uses the default profile when none is named", () => {
    addAgentProfile({ id: "first", label: "First", command: "codex" });
    addAgentProfile({ id: "p", label: "P", command: "claude", default: true });
    store.workspaces = { w: makeWorkspace("w", "/proj") };

    const result = applyControlAgentRun({ cwd: "/proj" });

    expect(data(result).profileId).toBe("p");
  });

  it("resolves a soft-closed workspace containing the cwd instead of skipping it", () => {
    // Soft-closed is still a workspace: reopening it is the activation the
    // launch service performs, so what this handler owes is resolving to it
    // rather than falling through to "not inside any workspace".
    addAgentProfile({ id: "p", label: "P", command: "claude", default: true });
    store.workspaces = {
      w: makeWorkspace("w", "/proj", undefined, "2026-09-01T00:00:00Z"),
    };
    store.workspaceOrder = ["w"];

    const result = applyControlAgentRun({ cwd: "/proj/src" });

    expect(result.ok).toBe(true);
    expect(data(result).workspaceId).toBe("w");
    expect(launchProfile).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "w" }),
    );
  });
});

describe("applyControlAgentRun — not-found", () => {
  it("refuses an unknown --profile without creating anything", () => {
    addAgentProfile({ id: "real", label: "Real", command: "claude" });
    store.workspaces = { w: makeWorkspace("w", "/proj") };

    const result = applyControlAgentRun({ cwd: "/proj", profileId: "ghost" });

    expect(code(result)).toBe("not-found");
    expect(launchProfile).not.toHaveBeenCalled();
    expect(store.activeWorkspaceId).toBeNull();
  });

  it("refuses a bare run when no profiles are defined", () => {
    store.workspaces = { w: makeWorkspace("w", "/proj") };

    const result = applyControlAgentRun({ cwd: "/proj" });

    expect(code(result)).toBe("not-found");
    expect(launchProfile).not.toHaveBeenCalled();
  });

  it("refuses an unresolvable --ws rather than falling back", () => {
    addAgentProfile({ id: "p", label: "P", command: "claude", default: true });
    store.workspaces = { a: makeWorkspace("a", "/proj-a") };
    store.activeWorkspaceId = "a";

    const result = applyControlAgentRun({
      cwd: "/proj-a/src",
      ws: "/no/such/folder",
    });

    expect(code(result)).toBe("not-found");
    expect(launchProfile).not.toHaveBeenCalled();
    // Not silently redirected into the workspace the cwd happens to be in.
    expect(store.activeWorkspaceId).toBe("a");
  });

  it("refuses a cwd inside no workspace — never a silent create (ADR 0047 rule 5)", () => {
    // This is the conformance fix the conversion carries: the Forward
    // implementation logged a warning and exited 0.
    addAgentProfile({ id: "p", label: "P", command: "claude", default: true });

    const result = applyControlAgentRun({ cwd: "/fresh/repo" });

    expect(code(result)).toBe("not-found");
    expect(Object.keys(store.workspaces)).toHaveLength(0);
    expect(launchProfile).not.toHaveBeenCalled();
  });
});

describe("applyControlAgentRun — failed vs. internal", () => {
  it("reports a profile with no command as failed, naming it", () => {
    // The environment, not a bug in Silo — so `failed` (exit 7), never
    // `internal` (exit 70). The distinction is why the vocabulary has both.
    addAgentProfile({ id: "empty", label: "Empty", command: "   " });
    store.workspaces = { w: makeWorkspace("w", "/proj") };

    const result = applyControlAgentRun({ cwd: "/proj", profileId: "empty" });

    expect(code(result)).toBe("failed");
    expect(result.ok ? "" : result.message).toContain("empty");
    expect(launchProfile).not.toHaveBeenCalled();
  });

  it("maps a launch-time refusal onto the closed vocabulary, creating nothing", () => {
    // The service re-checks the profile and workspace this handler already
    // resolved, so this only fires if one went away mid-launch. It creates
    // nothing when it refuses, so there is no half-built terminal to clean up.
    addAgentProfile({ id: "p", label: "P", command: "claude" });
    store.workspaces = { w: makeWorkspace("w", "/proj") };
    launchProfile.mockReturnValueOnce({
      ok: false,
      refusal: "no-workspace",
    } as never);

    const result = applyControlAgentRun({ cwd: "/proj", profileId: "p" });

    expect(code(result)).toBe("not-found");
    expect(store.workspaces.w.terminals).toHaveLength(0);
  });
});

describe("applyControlAgentRun — --prompt", () => {
  it("forwards the prompt to the launch rather than handling it here", () => {
    // RFC 0033 phase 3 owns delivery — the quoted-heredoc transport, the
    // line-editor sanitizing, the dialect choice. This handler's whole job is
    // to carry the flag through and map a refusal onto an exit code, so what is
    // asserted is that the prompt reaches the service untouched.
    addAgentProfile({ id: "p", label: "P", command: "claude", default: true });
    store.workspaces = { w: makeWorkspace("w", "/proj") };

    const result = applyControlAgentRun({
      cwd: "/proj",
      prompt: "fix the build",
    });

    expect(result.ok).toBe(true);
    expect(launchProfile).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "fix the build" }),
    );
  });

  it("omits the key entirely when no prompt is given", () => {
    // Not `prompt: undefined` — the service branches on the key's presence.
    addAgentProfile({ id: "p", label: "P", command: "claude", default: true });
    store.workspaces = { w: makeWorkspace("w", "/proj") };

    expect(applyControlAgentRun({ cwd: "/proj" }).ok).toBe(true);
    expect(launchProfile).toHaveBeenCalledTimes(1);
    expect(launchProfile.mock.lastCall?.[0]).not.toHaveProperty("prompt");
  });

  it.each([
    ["no-agent"],
    ["agent-takes-none"],
    ["unsupported-shell"],
    ["too-large"],
  ])("maps the %s prompt refusal to failed, never internal", (refusal) => {
    // Every prompt refusal is a fact about the environment the command ran in,
    // never a malfunction — so `failed` (exit 7), never `internal` (exit 70).
    addAgentProfile({ id: "p", label: "P", command: "claude", default: true });
    store.workspaces = { w: makeWorkspace("w", "/proj") };
    launchProfile.mockReturnValueOnce({ ok: false, refusal } as never);

    const result = applyControlAgentRun({ cwd: "/proj", prompt: "go" });

    expect(code(result)).toBe("failed");
  });
});

describe("applyControlAgentRun — an explicit --ws target", () => {
  beforeEach(() => {
    addAgentProfile({ id: "p", label: "P", command: "claude", default: true });
    store.workspaces = {
      a: makeWorkspace("a", "/proj-a"),
      b: makeWorkspace("b", "/proj-b", ["/extra-b"]),
    };
    store.workspaceOrder = ["a", "b"];
    store.activeWorkspaceId = "a";
  });

  it("targets by folder path, overriding the cwd's own workspace", () => {
    applyControlAgentRun({ cwd: "/proj-a/src", ws: "/proj-b" });

    expect(launchProfile).toHaveBeenCalledWith({
      profileId: "p",
      workspaceId: "b",
      // Not /proj-a/src: a cwd outside the named workspace is irrelevant to it,
      // so the agent starts at the root the caller named.
      cwd: "/proj-b",
    });
  });

  it("keeps the shell's cwd when it is inside the named workspace", () => {
    applyControlAgentRun({ cwd: "/proj-b/packages/sdk", ws: "/proj-b" });

    expect(launchProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "b",
        cwd: "/proj-b/packages/sdk",
      }),
    );
  });

  it("starts at the named extra folder, not the primary one", () => {
    applyControlAgentRun({ cwd: "/proj-a", ws: "/extra-b" });

    expect(launchProfile).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "b", cwd: "/extra-b" }),
    );
  });

  it("starts at the primary folder when targeted by id from outside", () => {
    applyControlAgentRun({ cwd: "/proj-a", ws: "b" });

    expect(launchProfile).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "b", cwd: "/proj-b" }),
    );
  });

  it("does not match a containing folder — --ws is exact", () => {
    // Containment is the *inference* rule; an explicit target names a root.
    const result = applyControlAgentRun({
      cwd: "/proj-a",
      ws: "/proj-b/packages/sdk",
    });

    expect(code(result)).toBe("not-found");
    expect(launchProfile).not.toHaveBeenCalled();
  });
});
