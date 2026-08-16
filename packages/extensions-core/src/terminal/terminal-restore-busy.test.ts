import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  beginTerminalRestoreAttach,
  bindTerminalRestoreBusy,
  endTerminalRestoreAttach,
  resetTerminalRestoreBusyForTests,
  TERMINAL_RESTORE_BUSY_ID,
} from "./terminal-restore-busy";
import type { ExtensionContext } from "@silo-code/sdk";

describe("terminal-restore-busy", () => {
  const set = vi.fn();
  const clear = vi.fn();
  const notify = vi.fn();

  beforeEach(() => {
    resetTerminalRestoreBusyForTests();
    set.mockReset();
    clear.mockReset();
    notify.mockReset();
    set.mockReturnValue({ dispose: () => {} });
    bindTerminalRestoreBusy({
      ui: {
        busyStatus: { set, clear },
        notify,
      },
    } as unknown as ExtensionContext);
  });

  it("publishes Restoring… while attaches are in flight and clears on settle", () => {
    beginTerminalRestoreAttach();
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        id: TERMINAL_RESTORE_BUSY_ID,
        label: "Restoring terminal…",
        detail: "1 in progress",
      }),
    );

    beginTerminalRestoreAttach();
    expect(set).toHaveBeenLastCalledWith(
      expect.objectContaining({
        label: "Restoring terminals…",
        detail: "2 in progress",
      }),
    );

    endTerminalRestoreAttach(true);
    expect(clear).not.toHaveBeenCalled();
    endTerminalRestoreAttach(true);
    expect(clear).toHaveBeenCalledWith(TERMINAL_RESTORE_BUSY_ID);
    expect(notify).not.toHaveBeenCalled();
  });

  it("notifies once when the cohort finishes with failures", () => {
    beginTerminalRestoreAttach();
    beginTerminalRestoreAttach();
    endTerminalRestoreAttach(false);
    expect(notify).not.toHaveBeenCalled();
    endTerminalRestoreAttach(true);
    expect(clear).toHaveBeenCalledWith(TERMINAL_RESTORE_BUSY_ID);
    expect(notify).toHaveBeenCalledWith("error", "1 terminal needs reconnect");
  });
});
