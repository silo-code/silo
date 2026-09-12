import { describe, it, expect, vi } from "vitest";
import {
  applyChatAgentsGate,
  type ChatAgentsGateDeps,
} from "./chat-panel-gate";

function deps(enabled: boolean): ChatAgentsGateDeps & {
  enable: ReturnType<typeof vi.fn>;
  disable: ReturnType<typeof vi.fn>;
} {
  return { enabled: () => enabled, enable: vi.fn(), disable: vi.fn() };
}

describe("applyChatAgentsGate", () => {
  it("activates the Chat panel when the gate is on", () => {
    const d = deps(true);
    applyChatAgentsGate("core.acp-chat", d);
    expect(d.enable).toHaveBeenCalledWith("core.acp-chat");
    expect(d.disable).not.toHaveBeenCalled();
  });

  it("tears it down when the gate is off", () => {
    const d = deps(false);
    applyChatAgentsGate("core.acp-chat", d);
    expect(d.disable).toHaveBeenCalledWith("core.acp-chat");
    expect(d.enable).not.toHaveBeenCalled();
  });

  it("gates whichever extension the caller names — the host knows no id", () => {
    const d = deps(true);
    applyChatAgentsGate("acme.chat", d);
    expect(d.enable).toHaveBeenCalledWith("acme.chat");
  });

  it("is safe to call repeatedly — it runs on every hydrate and every toggle", () => {
    const d = deps(true);
    applyChatAgentsGate("core.acp-chat", d);
    applyChatAgentsGate("core.acp-chat", d);
    expect(d.enable).toHaveBeenCalledTimes(2);
    expect(d.disable).not.toHaveBeenCalled();
  });
});
