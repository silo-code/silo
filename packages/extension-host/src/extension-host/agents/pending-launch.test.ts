import { describe, it, expect, vi, beforeEach } from "vitest";

const { sendInput } = vi.hoisted(() => ({
  sendInput: vi.fn(),
}));
vi.mock("../../services/tauri-terminal-client", () => ({
  tauriTerminalClient: { sendInput },
}));

import { store } from "../../state/store";
import { addAgentProfile } from "../../state/agent-profiles";
import {
  requestProfileLaunch,
  requestRawLaunch,
  takePendingLaunch,
  discardPendingLaunch,
  hasPendingLaunch,
  drainPendingLaunch,
  chunkForPty,
} from "./pending-launch";
import { MAX_PROMPT_BYTES } from "./agent-prompt";

beforeEach(() => {
  store.agentProfiles = [];
  sendInput.mockReset();
});

describe("pending-launch registry (RFC 0033 R6)", () => {
  it("take after request returns the launch, then null (remove-on-read)", () => {
    requestProfileLaunch("t1", "claude-work");
    expect(takePendingLaunch("t1")).toEqual({ profileId: "claude-work" });
    expect(takePendingLaunch("t1")).toBeNull();
  });

  it("discard makes a later take return null", () => {
    requestProfileLaunch("t1", "p");
    discardPendingLaunch("t1");
    expect(takePendingLaunch("t1")).toBeNull();
  });

  it("keeps two terminals' pending launches independent", () => {
    requestProfileLaunch("t1", "a");
    requestRawLaunch("t2", "claude");
    expect(hasPendingLaunch("t1")).toBe(true);
    expect(takePendingLaunch("t2")).toEqual({ rawLine: "claude" });
    expect(takePendingLaunch("t1")).toEqual({ profileId: "a" });
  });
});

describe("drainPendingLaunch", () => {
  it("types the resolved launch line for a live profile, once", () => {
    addAgentProfile({
      id: "claude-work",
      label: "W",
      command: "claude-work",
      configDir: "/Users/d/.claude-work",
      assumedAgentId: "claude",
    });
    requestProfileLaunch("t1", "claude-work");
    drainPendingLaunch("t1", "sess-1");
    expect(sendInput).toHaveBeenCalledWith(
      "sess-1",
      "CLAUDE_CONFIG_DIR='/Users/d/.claude-work' claude-work\r",
    );
    // second drain is a no-op
    drainPendingLaunch("t1", "sess-1");
    expect(sendInput).toHaveBeenCalledTimes(1);
  });

  it("writes nothing when the profile was deleted before the drain", () => {
    requestProfileLaunch("t1", "gone");
    drainPendingLaunch("t1", "sess-1");
    expect(sendInput).not.toHaveBeenCalled();
  });

  it("writes nothing when there is no pending launch", () => {
    drainPendingLaunch("t1", "sess-1");
    expect(sendInput).not.toHaveBeenCalled();
  });

  it("types a raw line verbatim", () => {
    requestRawLaunch("t1", "pi");
    drainPendingLaunch("t1", "sess-1");
    expect(sendInput).toHaveBeenCalledWith("sess-1", "pi\r");
  });
});

// ---- RFC 0033 phase 3: an opening prompt on the launch line ----------------

/** A profile that resolves to Claude, which takes a positional prompt. */
function addClaudeProfile(): void {
  addAgentProfile({
    id: "claude",
    label: "Claude",
    command: "claude",
    assumedAgentId: "claude",
  });
}

/** Everything sent for one drain, reassembled — the send is chunked. */
function sentText(): string {
  return sendInput.mock.calls.map((c) => c[1] as string).join("");
}

describe("drainPendingLaunch — a claimed prompt", () => {
  it("carries the prompt and the dialect on the claim", () => {
    requestProfileLaunch("t1", "claude", "fix the CI", "posix");
    expect(takePendingLaunch("t1")).toEqual({
      profileId: "claude",
      prompt: "fix the CI",
      dialect: "posix",
    });
  });

  it("stays remove-on-read with a prompt attached", () => {
    requestProfileLaunch("t1", "claude", "fix the CI", "posix");
    expect(takePendingLaunch("t1")).not.toBeNull();
    expect(takePendingLaunch("t1")).toBeNull();
  });

  it("types the composed heredoc line, with \\r for every newline", () => {
    addClaudeProfile();
    requestProfileLaunch("t1", "claude", "fix the CI", "posix");
    drainPendingLaunch("t1", "sess-1");
    expect(sentText()).toBe(
      "claude \"$(cat <<'SILO_PROMPT'\rfix the CI\rSILO_PROMPT\r)\"\r",
    );
    // The one \n → \r seam: nothing reaches the PTY as a newline.
    expect(sentText()).not.toContain("\n");
  });

  it("delivers a multi-line prompt as one intent", () => {
    addClaudeProfile();
    requestProfileLaunch("t1", "claude", "one\ntwo", "posix");
    drainPendingLaunch("t1", "sess-1");
    expect(sentText()).toContain("\rone\rtwo\rSILO_PROMPT\r");
  });

  it("uses fish's single-quoted form when that is the dialect", () => {
    addClaudeProfile();
    requestProfileLaunch("t1", "claude", "fix the CI", "fish");
    drainPendingLaunch("t1", "sess-1");
    expect(sentText()).toBe("claude 'fix the CI'\r");
  });

  it("keeps a promptless launch byte-identical to phases 1–2", () => {
    addClaudeProfile();
    requestProfileLaunch("t1", "claude");
    drainPendingLaunch("t1", "sess-1");
    expect(sendInput).toHaveBeenCalledTimes(1);
    expect(sendInput).toHaveBeenCalledWith("sess-1", "claude\r");
  });

  it("types nothing when the profile was edited into one that takes no prompt", () => {
    // The drain re-resolves the profile (not the dialect), so an edit landing
    // between the precheck and the session coming up is respected — and this
    // is the one refusal `launch()` cannot return, because it already did.
    addAgentProfile({
      id: "claude",
      label: "Claude",
      command: "my-own-script",
    });
    requestProfileLaunch("t1", "claude", "fix the CI", "posix");
    drainPendingLaunch("t1", "sess-1");
    expect(sendInput).not.toHaveBeenCalled();
  });

  it("types nothing when the dialect cannot be quoted", () => {
    addClaudeProfile();
    requestProfileLaunch("t1", "claude", "fix the CI", "unsupported");
    drainPendingLaunch("t1", "sess-1");
    expect(sendInput).not.toHaveBeenCalled();
  });

  it("treats a claim with no dialect as unsupported rather than guessing", () => {
    addClaudeProfile();
    requestProfileLaunch("t1", "claude", "fix the CI");
    drainPendingLaunch("t1", "sess-1");
    expect(sendInput).not.toHaveBeenCalled();
  });

  it("types nothing when the profile was deleted, prompt included", () => {
    requestProfileLaunch("t1", "gone", "fix the CI", "posix");
    drainPendingLaunch("t1", "sess-1");
    expect(sendInput).not.toHaveBeenCalled();
  });
});

describe("chunking the send", () => {
  it("sends a short line in exactly one call", () => {
    addClaudeProfile();
    requestProfileLaunch("t1", "claude", "fix the CI", "posix");
    drainPendingLaunch("t1", "sess-1");
    expect(sendInput).toHaveBeenCalledTimes(1);
  });

  it("delivers a line at MAX_PROMPT_BYTES complete, in order", () => {
    // A truncated heredoc never terminates and parks the user's shell in an
    // unterminated quote, so the whole line has to arrive — the daemon drops
    // the tail of a single oversized write after one second.
    addClaudeProfile();
    const prompt = "x".repeat(MAX_PROMPT_BYTES);
    requestProfileLaunch("t1", "claude", prompt, "posix");
    drainPendingLaunch("t1", "sess-1");
    expect(sendInput.mock.calls.length).toBeGreaterThan(1);
    const text = sentText();
    expect(text.startsWith("claude \"$(cat <<'SILO_PROMPT'\r")).toBe(true);
    expect(text.endsWith('\rSILO_PROMPT\r)"\r')).toBe(true);
    expect(text).toContain(prompt);
  });

  it("never splits a multi-byte character across a chunk boundary", () => {
    // Each sendInput call is UTF-8 encoded independently, so a split surrogate
    // pair would put replacement bytes on the wire.
    const text = `${"🎉".repeat(4000)}\r`;
    const chunks = chunkForPty(text);
    expect(chunks.join("")).toBe(text);
    for (const chunk of chunks) {
      expect(chunk).not.toMatch(/[\uD800-\uDBFF]$/);
      expect(chunk).not.toMatch(/^[\uDC00-\uDFFF]/);
    }
  });

  it("keeps every chunk within the PTY write budget", () => {
    const encoder = new TextEncoder();
    for (const chunk of chunkForPty("é".repeat(5000))) {
      expect(encoder.encode(chunk).length).toBeLessThanOrEqual(1024);
    }
  });
});
