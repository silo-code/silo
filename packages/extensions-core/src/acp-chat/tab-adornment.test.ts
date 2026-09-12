import { describe, it, expect } from "vitest";
import { chatTabActivity } from "./tab-adornment";

describe("chatTabActivity", () => {
  it("shows a working badge while a turn runs", () => {
    expect(
      chatTabActivity({ activity: "working", needsAttention: false }),
    ).toEqual({ activity: "working", tooltip: "Agent working" });
  });

  it("shows a ready badge only for an unseen finish", () => {
    expect(chatTabActivity({ activity: "idle", needsAttention: true })).toEqual(
      { activity: "ready", tooltip: "Agent finished" },
    );
    expect(
      chatTabActivity({ activity: "idle", needsAttention: false }),
    ).toBeNull();
  });

  it("shows an error badge for a stopped or dead process", () => {
    expect(
      chatTabActivity({ activity: "error", needsAttention: true }),
    ).toEqual({ activity: "error", tooltip: "Agent stopped" });
    expect(
      chatTabActivity({ activity: "dead", needsAttention: false }),
    ).toEqual({ activity: "error", tooltip: "Agent stopped" });
  });

  it("shows nothing at rest or with no info", () => {
    expect(chatTabActivity(undefined)).toBeNull();
    expect(
      chatTabActivity({ activity: "none", needsAttention: false }),
    ).toBeNull();
  });
});
