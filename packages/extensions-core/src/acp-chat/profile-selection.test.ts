import { describe, it, expect } from "vitest";
import type { AgentProfileSummary } from "@silo-code/sdk";
import { chatProfiles, resolveChatProfile } from "./profile-selection";

function profile(
  id: string,
  patch: Partial<AgentProfileSummary> = {},
): AgentProfileSummary {
  return {
    id,
    label: id,
    isDefault: false,
    acceptsPrompt: true,
    interface: "chat",
    ...patch,
  };
}

describe("chatProfiles", () => {
  it("keeps only the Chat-armed profiles", () => {
    const all = [profile("term", { interface: "terminal" }), profile("chat")];
    expect(chatProfiles(all).map((p) => p.id)).toEqual(["chat"]);
  });

  it("preserves the user's own order", () => {
    const all = [profile("b"), profile("a"), profile("c")];
    expect(chatProfiles(all).map((p) => p.id)).toEqual(["b", "a", "c"]);
  });
});

describe("resolveChatProfile", () => {
  it("honours the id the tab remembered", () => {
    const all = [profile("a", { isDefault: true }), profile("b")];
    expect(resolveChatProfile(all, "b")?.id).toBe("b");
  });

  it("falls back to the default Chat profile when nothing was requested", () => {
    const all = [profile("a"), profile("b", { isDefault: true })];
    expect(resolveChatProfile(all)?.id).toBe("b");
  });

  it("falls back to the first Chat profile when none is default", () => {
    expect(resolveChatProfile([profile("a"), profile("b")])?.id).toBe("a");
  });

  it("ignores a default that is a Terminal profile", () => {
    const all = [
      profile("term", { interface: "terminal", isDefault: true }),
      profile("chat"),
    ];
    expect(resolveChatProfile(all)?.id).toBe("chat");
  });

  it("falls through when the remembered profile was deleted", () => {
    expect(resolveChatProfile([profile("a")], "gone")?.id).toBe("a");
  });

  it("falls through when the remembered profile switched to Terminal", () => {
    const all = [profile("was-chat", { interface: "terminal" }), profile("a")];
    expect(resolveChatProfile(all, "was-chat")?.id).toBe("a");
  });

  it("returns undefined when the user has no Chat profile at all", () => {
    expect(
      resolveChatProfile([profile("term", { interface: "terminal" })]),
    ).toBeUndefined();
    expect(resolveChatProfile([])).toBeUndefined();
  });
});
