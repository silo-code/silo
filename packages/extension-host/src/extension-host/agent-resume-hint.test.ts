import { describe, it, expect } from "vitest";
import {
  genericHint,
  isKnownAgentLeader,
  parseResumeSessionIdFromArgv,
} from "./agent-resume-hint";

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

describe("parseResumeSessionIdFromArgv", () => {
  const uuid = "a95d1c3b-5cae-40ad-aa88-dee475fc31e2";

  it("extracts the id from `--resume=<uuid>` (Cursor's form)", () => {
    expect(
      parseResumeSessionIdFromArgv(
        `/Users/x/.local/bin/cursor-agent --use-system-ca /opt/index.js -f --resume=${uuid}`,
      ),
    ).toBe(uuid);
  });

  it("extracts the id from `--resume <uuid>` (space) and `-r <uuid>`", () => {
    expect(parseResumeSessionIdFromArgv(`claude --resume ${uuid}`)).toBe(uuid);
    expect(parseResumeSessionIdFromArgv(`cursor-agent -r ${uuid}`)).toBe(uuid);
    expect(parseResumeSessionIdFromArgv(`grok -r=${uuid}`)).toBe(uuid);
  });

  it("returns null for a fresh (non-resume) launch", () => {
    expect(
      parseResumeSessionIdFromArgv(
        "/Users/x/.local/bin/cursor-agent --use-system-ca /opt/index.js -f",
      ),
    ).toBeNull();
  });

  it("only treats UUID-shaped values as ids, not titles", () => {
    // Cursor/Grok --resume accept a title too; a non-UUID must NOT be captured
    // as an exact resumable id.
    expect(
      parseResumeSessionIdFromArgv("cursor-agent --resume my-feature"),
    ).toBeNull();
    expect(
      parseResumeSessionIdFromArgv('cursor-agent --resume "Fix the bug"'),
    ).toBeNull();
  });

  it("doesn't misfire on a substring or a non-flag occurrence", () => {
    // `--resumex` isn't `--resume`; a bare uuid without the flag isn't a resume.
    expect(parseResumeSessionIdFromArgv(`tool --resumex=${uuid}`)).toBeNull();
    expect(parseResumeSessionIdFromArgv(`tool ${uuid}`)).toBeNull();
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
