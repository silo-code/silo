import { describe, it, expect } from "vitest";
import { makeChunkGrouper } from "./acp-transport";

/**
 * Spike (docs/acp-recon.md). The grouper is the one piece of protocol logic in
 * the transport, and it exists because real agents omit `messageId` — verified
 * against `cursor-agent` 2026.09.02, whose chunks are `{ sessionUpdate,
 * content }` and nothing else.
 */

const chunk = (kind: string, text: string, messageId?: string) => ({
  jsonrpc: "2.0",
  method: "session/update",
  params: {
    sessionId: "s1",
    update: {
      sessionUpdate: kind,
      content: { type: "text", text },
      ...(messageId === undefined ? {} : { messageId }),
    },
  },
});

const idOf = (m: Record<string, unknown>) =>
  (m.params as { update: { messageId?: string } }).update.messageId;

describe("makeChunkGrouper", () => {
  it("gives consecutive same-kind chunks one id", () => {
    const g = makeChunkGrouper();
    const a = g(chunk("agent_message_chunk", "I'll"));
    const b = g(chunk("agent_message_chunk", " create"));
    const c = g(chunk("agent_message_chunk", " it"));
    expect(idOf(a)).toBeDefined();
    expect(idOf(b)).toBe(idOf(a));
    expect(idOf(c)).toBe(idOf(a));
  });

  it("starts a new run when the chunk kind changes", () => {
    const g = makeChunkGrouper();
    const thought = g(chunk("agent_thought_chunk", "thinking"));
    const message = g(chunk("agent_message_chunk", "answering"));
    expect(idOf(message)).not.toBe(idOf(thought));
  });

  it("splits a run around a rendered block, so text either side is its own bubble", () => {
    const g = makeChunkGrouper();
    const before = g(chunk("agent_message_chunk", "I'll edit"));
    g({
      jsonrpc: "2.0",
      method: "session/update",
      params: { update: { sessionUpdate: "tool_call", toolCallId: "t1" } },
    });
    const after = g(chunk("agent_message_chunk", "Done."));
    expect(idOf(after)).not.toBe(idOf(before));
  });

  it("does not split on updates that render nothing inline", () => {
    const g = makeChunkGrouper();
    const before = g(chunk("agent_message_chunk", "one"));
    g({
      jsonrpc: "2.0",
      method: "session/update",
      params: { update: { sessionUpdate: "usage_update", tokens: 1 } },
    });
    const after = g(chunk("agent_message_chunk", " two"));
    expect(idOf(after)).toBe(idOf(before));
  });

  it("leaves an agent that sends its own messageId completely alone", () => {
    const g = makeChunkGrouper();
    const a = g(chunk("agent_message_chunk", "hi", "upstream-1"));
    const b = g(chunk("agent_message_chunk", " there", "upstream-1"));
    expect(idOf(a)).toBe("upstream-1");
    expect(idOf(b)).toBe("upstream-1");
  });

  it("passes non-session/update messages through untouched", () => {
    const g = makeChunkGrouper();
    const reply = { jsonrpc: "2.0", id: 0, result: { protocolVersion: 1 } };
    expect(g(reply)).toBe(reply);
  });

  it("preserves the rest of the payload", () => {
    const g = makeChunkGrouper();
    const out = g(chunk("agent_message_chunk", "hello"));
    const update = (out.params as { update: Record<string, unknown> }).update;
    expect(update.content).toEqual({ type: "text", text: "hello" });
    expect((out.params as { sessionId: string }).sessionId).toBe("s1");
    expect(out.method).toBe("session/update");
  });
});
