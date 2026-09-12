import { describe, it, expect } from "vitest";
import type { DockPanelKind } from "@silo-code/sdk";
import {
  chatProfileHostParams,
  resolveChatProfileHost,
} from "./chat-profile-host";

function kind(id: string, chatProfileHost?: boolean): DockPanelKind {
  return {
    id,
    component: () => null,
    ...(chatProfileHost === undefined ? {} : { chatProfileHost }),
  };
}

describe("resolveChatProfileHost", () => {
  it("finds the kind that declares itself a chat-profile host", () => {
    const kinds = [kind("terminal"), kind("acp-chat", true), kind("editor")];
    expect(resolveChatProfileHost(kinds)?.id).toBe("acp-chat");
  });

  it("is undefined when nothing claims the job", () => {
    // The `chatAgents` gate is off, or the bundled panel was disabled with no
    // replacement installed — a state the caller must report, not ignore.
    expect(
      resolveChatProfileHost([kind("terminal"), kind("editor")]),
    ).toBeUndefined();
    expect(resolveChatProfileHost([])).toBeUndefined();
  });

  it("ignores a kind that declares it false", () => {
    expect(resolveChatProfileHost([kind("acp-chat", false)])).toBeUndefined();
  });

  it("takes the first registered when several claim it", () => {
    const kinds = [kind("acp-chat", true), kind("acme-chat", true)];
    expect(resolveChatProfileHost(kinds)?.id).toBe("acp-chat");
  });
});

describe("chatProfileHostParams", () => {
  it("carries the profile id the panel connects with, and a starting title", () => {
    expect(
      chatProfileHostParams({ id: "claude-chat", label: "Claude (chat)" }),
    ).toEqual({ profileId: "claude-chat", title: "Claude (chat)" });
  });
});
