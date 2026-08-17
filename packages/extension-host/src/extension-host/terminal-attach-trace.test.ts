import { describe, it, expect, vi, beforeEach } from "vitest";

const { info, error, invokeMock } = vi.hoisted(() => ({
  info: vi.fn(),
  error: vi.fn(),
  invokeMock: vi.fn(() => Promise.resolve()),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

vi.mock("./output-store", () => ({
  createHostChannel: () => ({
    info,
    error,
    warn: vi.fn(),
    debug: vi.fn(),
    clear: vi.fn(),
  }),
}));

import {
  formatTraceDetail,
  formatTraceMessage,
  logTerminalAttachTrace,
} from "./terminal-attach-trace";

describe("formatTraceDetail", () => {
  it("joins key=value and skips nullish", () => {
    expect(
      formatTraceDetail({
        terminalId: "term_1",
        sessionId: "sess_a",
        ok: true,
        missing: undefined,
        empty: null,
        n: 3,
      }),
    ).toBe("terminalId=term_1 sessionId=sess_a ok=true n=3");
  });

  it("JSON-stringifies values with spaces or equals", () => {
    expect(formatTraceDetail({ reason: "no record", path: "a=b" })).toBe(
      'reason="no record" path="a=b"',
    );
  });
});

describe("formatTraceMessage", () => {
  it("prefixes the event name", () => {
    expect(formatTraceMessage("ui_attach_ok", "session=s1")).toBe(
      "ui_attach_ok session=s1",
    );
    expect(formatTraceMessage("ui_init_miss", "")).toBe("ui_init_miss");
  });
});

describe("logTerminalAttachTrace", () => {
  beforeEach(() => {
    invokeMock.mockClear();
    info.mockClear();
    error.mockClear();
  });

  it("writes info events to the Output channel and terminal_diag_log", () => {
    logTerminalAttachTrace("ui_attach_start", {
      terminalId: "term_1",
      sessionId: "sess_1",
      workspaceId: "ws_1",
    });
    expect(info).toHaveBeenCalledOnce();
    expect(error).not.toHaveBeenCalled();
    expect(invokeMock).toHaveBeenCalledWith("terminal_diag_log", {
      event: "ui_attach_start",
      detail: "terminalId=term_1 sessionId=sess_1 workspaceId=ws_1",
    });
  });

  it("routes miss/fail/gone to the error channel level", () => {
    logTerminalAttachTrace("ui_init_miss", { terminalId: "term_x" });
    expect(error).toHaveBeenCalledOnce();
    expect(info).not.toHaveBeenCalled();
  });
});
