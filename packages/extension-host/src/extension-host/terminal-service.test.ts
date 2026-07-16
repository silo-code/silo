import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the Tauri terminal client and the process service (force-spawn path).
const { sendInput, deleteTerminal, spawn } = vi.hoisted(() => ({
  sendInput: vi.fn(),
  deleteTerminal: vi.fn(() => Promise.resolve()),
  spawn: vi.fn(),
}));
vi.mock("../services/tauri-terminal-client", () => ({
  tauriTerminalClient: { sendInput, deleteTerminal },
}));
vi.mock("./process-service", () => ({
  getProcessService: () => ({ spawn }),
}));

import { store } from "../state/store";
import type { WorkspaceInternal } from "../state/types";
import { getTerminalService } from "./terminal-service";

const svc = getTerminalService();
const flush = () => new Promise((r) => setTimeout(r, 0));

function makeWorkspace(id: string): WorkspaceInternal {
  return {
    id,
    name: id,
    folder: `/ws/${id}`,
    createdAt: "",
    lastOpenedAt: "",
    terminals: [],
    editors: [],
    dockLayout: null,
    previewEditorId: null,
  };
}

beforeEach(() => {
  sendInput.mockReset();
  deleteTerminal.mockReset().mockResolvedValue(undefined);
  spawn.mockReset();
  const ws = makeWorkspace("w");
  ws.terminals = [
    { id: "t1", sessionId: "sess-1", kind: "shell", title: "Terminal" },
    {
      id: "t2",
      sessionId: "",
      kind: "shell",
      title: "Terminal",
      cwd: "/ws/w/sub",
    },
  ];
  store.workspaces = { w: ws };
  store.workspaceOrder = ["w"];
  store.activeWorkspaceId = "w";
});

describe("TerminalService.sendText (B7)", () => {
  it("writes to an existing session with a carriage return by default", async () => {
    svc.sendText("t1", "npm run build");
    await flush();
    expect(sendInput).toHaveBeenCalledWith("sess-1", "npm run build\r");
  });

  it("stages text without executing when addNewline is false", async () => {
    svc.sendText("t1", "partial", false);
    await flush();
    expect(sendInput).toHaveBeenCalledWith("sess-1", "partial");
  });

  it("force-spawns a PTY for an unmounted terminal, then writes", async () => {
    spawn.mockResolvedValue({ id: "sess-2", kill: vi.fn() });
    svc.sendText("t2", "ls");
    await flush();
    // Spawned with the record's cwd, wrote once spawned, and recorded sessionId.
    expect(spawn).toHaveBeenCalledWith({ cwd: "/ws/w/sub" });
    expect(sendInput).toHaveBeenCalledWith("sess-2", "ls\r");
    expect(store.workspaces.w.terminals[1].sessionId).toBe("sess-2");
  });

  it("shares one spawn across concurrent sends to the same terminal", async () => {
    spawn.mockResolvedValue({ id: "sess-2", kill: vi.fn() });
    svc.sendText("t2", "one");
    svc.sendText("t2", "two");
    await flush();
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(sendInput).toHaveBeenCalledTimes(2);
  });

  it("is a no-op for an unknown terminal id", async () => {
    svc.sendText("nope", "x");
    await flush();
    expect(sendInput).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  });
});

describe("TerminalService.close (B7)", () => {
  it("removes the record and kills its PTY", () => {
    svc.close("t1");
    expect(
      store.workspaces.w.terminals.find((t) => t.id === "t1"),
    ).toBeUndefined();
    expect(deleteTerminal).toHaveBeenCalledWith("sess-1");
  });

  it("removes an unspawned terminal without a kill call", () => {
    svc.close("t2");
    expect(
      store.workspaces.w.terminals.find((t) => t.id === "t2"),
    ).toBeUndefined();
    expect(deleteTerminal).not.toHaveBeenCalled();
  });

  it("is a no-op for an unknown id", () => {
    svc.close("nope");
    expect(store.workspaces.w.terminals).toHaveLength(2);
    expect(deleteTerminal).not.toHaveBeenCalled();
  });
});

describe("TerminalService.closeWorkspace", () => {
  it("kills every live session and clears the workspace's terminal list", () => {
    svc.closeWorkspace("w");
    expect(store.workspaces.w.terminals).toEqual([]);
    expect(deleteTerminal).toHaveBeenCalledWith("sess-1");
    expect(deleteTerminal).toHaveBeenCalledTimes(1);
  });

  it("is a no-op for an unknown workspace id", () => {
    svc.closeWorkspace("nope");
    expect(store.workspaces.w.terminals).toHaveLength(2);
    expect(deleteTerminal).not.toHaveBeenCalled();
  });
});

describe("TerminalService.rename (B7)", () => {
  it("sets a custom name and mirrors it into the title", () => {
    svc.rename("t1", "  deploy  ");
    const rec = store.workspaces.w.terminals[0];
    expect(rec.customName).toBe("deploy");
    expect(rec.title).toBe("deploy");
  });

  it("clears the custom name on an empty string", () => {
    svc.rename("t1", "deploy");
    svc.rename("t1", "");
    expect(store.workspaces.w.terminals[0].customName).toBeUndefined();
  });
});
