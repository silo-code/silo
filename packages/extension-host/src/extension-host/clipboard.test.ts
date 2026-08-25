import { describe, expect, it, vi } from "vitest";

const { readTextMock } = vi.hoisted(() => ({
  readTextMock: vi.fn(async () => "clipboard"),
}));

vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  readText: readTextMock,
}));

import { readClipboardText } from "./clipboard";

describe("readClipboardText", () => {
  it("reads via the Tauri clipboard plugin", async () => {
    readTextMock.mockResolvedValueOnce("hello");
    await expect(readClipboardText()).resolves.toBe("hello");
    expect(readTextMock).toHaveBeenCalledOnce();
  });
});
