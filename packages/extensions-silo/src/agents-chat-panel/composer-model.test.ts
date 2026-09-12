import { describe, it, expect } from "vitest";
import {
  composerCanSend,
  composerInputEnabled,
  composerPlaceholder,
  composerShowConnecting,
} from "./composer-model";

describe("composerInputEnabled", () => {
  it("lets the user type while the agent is still connecting", () => {
    expect(composerInputEnabled(false, false)).toBe(true);
  });

  it("locks the field when the agent is gone or the session is journal-only", () => {
    expect(composerInputEnabled(true, false)).toBe(false);
    expect(composerInputEnabled(false, true)).toBe(false);
    expect(composerInputEnabled(true, true)).toBe(false);
  });
});

describe("composerCanSend", () => {
  const draft = {
    ready: true,
    lost: false,
    draft: "hello",
    attachmentCount: 0,
  };

  it("arms Send once the agent is ready and the draft is non-empty", () => {
    expect(composerCanSend(draft)).toBe(true);
  });

  it("arms Send on attachments alone", () => {
    expect(composerCanSend({ ...draft, draft: "", attachmentCount: 1 })).toBe(
      true,
    );
  });

  it("stays off while connecting, even if the user already typed", () => {
    expect(composerCanSend({ ...draft, ready: false })).toBe(false);
  });

  it("stays off when the agent is lost, the draft is blank, or only whitespace", () => {
    expect(composerCanSend({ ...draft, lost: true })).toBe(false);
    expect(composerCanSend({ ...draft, draft: "", attachmentCount: 0 })).toBe(
      false,
    );
    expect(composerCanSend({ ...draft, draft: "   " })).toBe(false);
  });
});

describe("composerShowConnecting", () => {
  it("is only the connecting phase — ready/error/no-profile show the real controls", () => {
    expect(composerShowConnecting("connecting")).toBe(true);
    expect(composerShowConnecting("ready")).toBe(false);
    expect(composerShowConnecting("error")).toBe(false);
    expect(composerShowConnecting("no-profile")).toBe(false);
  });
});

describe("composerPlaceholder", () => {
  it("invites a draft even before the agent is ready", () => {
    expect(composerPlaceholder(false, false)).toBe(
      "Message the agent or use /commands and /skills",
    );
  });

  it("explains the locked states", () => {
    expect(composerPlaceholder(false, true)).toMatch(/read-only/);
    expect(composerPlaceholder(true, false)).toMatch(/no longer running/);
  });
});
