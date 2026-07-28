import { describe, it, expect } from "vitest";
import { genericHint, isKnownAgentLeader } from "./agent-resume-hint";

describe("genericHint", () => {
  it("includes agentName from the catalog, not just the resume text", () => {
    // agentName must be populated on the generic hint too — which agent CLI
    // this is is known the moment a leader is recognized at all, independent
    // of whether an exact session id was ever resolved (a real gap: it used
    // to be left undefined here and only ever set by the hook path).
    const hint = genericHint("claude", "/tmp/proj");
    expect(hint.agentName).toBe("Claude Code");
    expect(hint.resumeCommand).toBe("was running claude in /tmp/proj");
    expect(hint.sessionId).toBeUndefined();
  });

  it("includes the stable agentId alongside agentName", () => {
    // agentId is the machine-safe key (unlike agentName, a display string) —
    // an extension should be able to switch on this without it breaking if
    // the display name is ever reworded.
    const hint = genericHint("claude", "/tmp/proj");
    expect(hint.agentId).toBe("claude");
  });

  it("resolves agentName/agentId through a full-path leader the same as the basename", () => {
    const hint = genericHint("/usr/local/bin/codex", "/tmp/proj");
    expect(hint.agentName).toBe("Codex CLI");
    expect(hint.agentId).toBe("codex");
  });

  it("omits the cwd clause when cwd is empty", () => {
    const hint = genericHint("claude", "");
    expect(hint.resumeCommand).toBe("was running claude");
  });

  it("leaves agentName and agentId undefined for an unrecognized leader", () => {
    const hint = genericHint("some-random-tool", "/tmp/proj");
    expect(hint.agentName).toBeUndefined();
    expect(hint.agentId).toBeUndefined();
  });
});

describe("isKnownAgentLeader", () => {
  it("recognizes every catalog agent's leader name", () => {
    expect(isKnownAgentLeader("claude")).toBe(true);
    expect(isKnownAgentLeader("codex")).toBe(true);
    expect(isKnownAgentLeader("cursor-agent")).toBe(true);
    expect(isKnownAgentLeader("copilot")).toBe(true);
  });

  it("returns false for a plain shell or unrelated program", () => {
    expect(isKnownAgentLeader("zsh")).toBe(false);
    expect(isKnownAgentLeader("/bin/bash")).toBe(false);
  });
});
