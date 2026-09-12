import { describe, it, expect } from "vitest";
import {
  confirmProfileSwitch,
  hasConversation,
  type SwitchConfirm,
} from "./profile-switch";
import {
  appendNotice,
  appendUserMessage,
  emptyTranscript,
  type Transcript,
} from "./transcript-model";

function withNotice(text = "ACP connection closed"): Transcript {
  return appendNotice(emptyTranscript, "error", text);
}

describe("hasConversation", () => {
  it("is false for an empty transcript", () => {
    expect(hasConversation(emptyTranscript)).toBe(false);
  });

  it("is false when Silo's own notice lines are all there is", () => {
    // A panel that only managed "could not connect" holds nothing to mourn —
    // making the user confirm past a failed connect to try a different agent
    // would be the opposite of helpful.
    expect(hasConversation(withNotice())).toBe(false);
  });

  it("is true once anyone has actually said something", () => {
    expect(hasConversation(appendUserMessage(emptyTranscript, "hi"))).toBe(
      true,
    );
  });
});

describe("confirmProfileSwitch", () => {
  it("asks nothing for a switch that costs nothing", () => {
    expect(confirmProfileSwitch(emptyTranscript, false, "Claude")).toBeNull();
    expect(confirmProfileSwitch(withNotice(), false, "Claude")).toBeNull();
  });

  it("confirms losing a conversation, naming the agent being left", () => {
    const ask = confirmProfileSwitch(
      appendUserMessage(emptyTranscript, "hi"),
      false,
      "Claude Agent",
    ) as SwitchConfirm;
    expect(ask).not.toBeNull();
    expect(ask.body).toContain("Claude Agent");
    expect(ask.confirmLabel).toBe("Switch");
    expect(ask.danger).toBe(true);
  });

  it("confirms stopping a running turn — even with nothing on screen yet", () => {
    const ask = confirmProfileSwitch(
      emptyTranscript,
      true,
      "Claude Agent",
    ) as SwitchConfirm;
    expect(ask).not.toBeNull();
    expect(ask.title).toContain("Stop this turn");
    expect(ask.confirmLabel).toBe("Stop and switch");
  });

  it("a running turn wins over a non-empty transcript — it is the more urgent loss", () => {
    const ask = confirmProfileSwitch(
      appendUserMessage(emptyTranscript, "hi"),
      true,
      "Claude Agent",
    ) as SwitchConfirm;
    expect(ask.confirmLabel).toBe("Stop and switch");
  });
});
