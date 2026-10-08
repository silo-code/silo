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
      params: {
        sessionId: "s1",
        update: { sessionUpdate: "tool_call", toolCallId: "t1" },
      },
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
      params: {
        sessionId: "s1",
        update: { sessionUpdate: "usage_update", tokens: 1 },
      },
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

  // RFC 0057. A run belongs to a session, not to the connection: once Silo
  // advertises the subagent capability a parent and its subagent stream text
  // down the same pipe, and connection-wide run state would fold the two into
  // one bubble — the parent appearing to say what the subagent said.
  describe("per-session runs", () => {
    const on = (sessionId: string, kind: string, text: string) => ({
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId,
        update: { sessionUpdate: kind, content: { type: "text", text } },
      },
    });

    it("gives two sessions streaming at once two distinct ids", () => {
      const g = makeChunkGrouper();
      const parent = g(on("parent", "agent_message_chunk", "I'll delegate"));
      const child = g(on("child", "agent_message_chunk", "working on it"));
      expect(idOf(parent)).toBeDefined();
      expect(idOf(child)).toBeDefined();
      expect(idOf(child)).not.toBe(idOf(parent));
    });

    it("still groups consecutive chunks within one session", () => {
      const g = makeChunkGrouper();
      const a = g(on("parent", "agent_message_chunk", "one"));
      g(on("child", "agent_message_chunk", "interleaved"));
      const b = g(on("parent", "agent_message_chunk", " two"));
      expect(idOf(b)).toBe(idOf(a));
    });

    it("breaks only the session whose run was interrupted", () => {
      const g = makeChunkGrouper();
      const parentBefore = g(on("parent", "agent_message_chunk", "before"));
      const childBefore = g(on("child", "agent_message_chunk", "child one"));
      // A tool call the *child* makes says nothing about whether the parent is
      // mid-sentence.
      g({
        jsonrpc: "2.0",
        method: "session/update",
        params: {
          sessionId: "child",
          update: { sessionUpdate: "tool_call", toolCallId: "t1" },
        },
      });
      const childAfter = g(on("child", "agent_message_chunk", "child two"));
      const parentAfter = g(on("parent", "agent_message_chunk", " after"));
      expect(idOf(childAfter)).not.toBe(idOf(childBefore));
      expect(idOf(parentAfter)).toBe(idOf(parentBefore));
    });

    it("never mints the same id for two sessions", () => {
      // `seq` stays connection-wide precisely for this: two sessions keying
      // their own runs must not both reach for `silo-msg-1`.
      const g = makeChunkGrouper();
      const seen = new Map<string, string>();
      for (let i = 0; i < 20; i++) {
        // Alternating kinds, so each session keeps opening fresh runs.
        const kind =
          i % 2 === 0 ? "agent_message_chunk" : "agent_thought_chunk";
        for (const session of ["a", "b", "c"]) {
          const id = idOf(g(on(session, kind, "x")));
          expect(id).toBeDefined();
          const owner = seen.get(id!);
          // Either this id is new, or it belongs to the session that minted it.
          expect(owner ?? session).toBe(session);
          seen.set(id!, session);
        }
      }
      // 20 run-opening frames per session across three sessions.
      expect(seen.size).toBe(60);
    });

    it("shares one bucket for frames carrying no session id", () => {
      // Every agent before RFC 0057 omits `sessionId`, and most still do:
      // their frames must group exactly as they always did.
      const g = makeChunkGrouper();
      const bare = (kind: string, text: string) => ({
        jsonrpc: "2.0",
        method: "session/update",
        params: { update: { sessionUpdate: kind, content: { text } } },
      });
      const a = g(bare("agent_message_chunk", "one"));
      const b = g(bare("agent_message_chunk", " two"));
      expect(idOf(b)).toBe(idOf(a));
      const c = g(bare("agent_thought_chunk", "hmm"));
      expect(idOf(c)).not.toBe(idOf(a));
    });

    it("reads a non-string session id as no session id", () => {
      const g = makeChunkGrouper();
      const weird = (sessionId: unknown) => ({
        jsonrpc: "2.0",
        method: "session/update",
        params: {
          sessionId,
          update: { sessionUpdate: "agent_message_chunk", content: {} },
        },
      });
      const a = g(weird(7));
      const b = g(weird(null));
      expect(idOf(a)).toBeDefined();
      expect(idOf(b)).toBe(idOf(a));
    });
  });
});
