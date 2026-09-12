import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AgentInfo } from "@silo-code/sdk";
import {
  chatAgentInfos,
  getChatAgentEntry,
  onChatAgentsChanged,
  patchChatAgent,
  registerChatAgent,
  removeChatAgent,
  resetChatAgentRegistry,
  setChatAgentControls,
} from "./chat-agent-registry";

function info(id: string, over: Partial<AgentInfo> = {}): AgentInfo {
  return {
    id,
    workspaceId: "w1",
    kind: "chat",
    isAgent: true,
    activity: "idle",
    needsAttention: false,
    stale: false,
    canResume: false,
    ...over,
  };
}

beforeEach(() => resetChatAgentRegistry());

describe("chat-agent-registry", () => {
  it("registers, lists, and looks up by id", () => {
    registerChatAgent(info("chat:a"));
    expect(chatAgentInfos().map((i) => i.id)).toEqual(["chat:a"]);
    expect(getChatAgentEntry("chat:a")?.info.kind).toBe("chat");
    expect(getChatAgentEntry("nope")).toBeUndefined();
  });

  it("patch merges fields and keeps the object identity stable per change", () => {
    registerChatAgent(info("chat:a", { activity: "working" }));
    const before = chatAgentInfos()[0];
    patchChatAgent("chat:a", { activity: "idle", needsAttention: true });
    const after = chatAgentInfos()[0];
    expect(before).not.toBe(after);
    expect(after).toMatchObject({ activity: "idle", needsAttention: true });
    // unrelated call does not re-allocate
    expect(chatAgentInfos()[0]).toBe(after);
  });

  it("patch is a no-op for an unknown (disposed) id", () => {
    patchChatAgent("gone", { activity: "error" });
    expect(chatAgentInfos()).toEqual([]);
  });

  it("notifies on register / patch / remove, not on unrelated reads", () => {
    const cb = vi.fn();
    onChatAgentsChanged(cb);
    registerChatAgent(info("chat:a"));
    patchChatAgent("chat:a", { activity: "working" });
    chatAgentInfos();
    removeChatAgent("chat:a");
    expect(cb).toHaveBeenCalledTimes(3);
  });

  it("removeChatAgent drops the entry and only fires once", () => {
    const cb = vi.fn();
    registerChatAgent(info("chat:a"));
    onChatAgentsChanged(cb);
    removeChatAgent("chat:a");
    removeChatAgent("chat:a");
    expect(chatAgentInfos()).toEqual([]);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("setChatAgentControls swaps controls without touching AgentInfo", () => {
    const first = vi.fn();
    const second = vi.fn();
    registerChatAgent(info("chat:a", { canResume: true }), { resume: first });
    const infoBefore = chatAgentInfos()[0];
    setChatAgentControls("chat:a", { resume: second });
    expect(chatAgentInfos()[0]).toBe(infoBefore);
    void getChatAgentEntry("chat:a")?.controls.resume?.();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalled();
  });
});
