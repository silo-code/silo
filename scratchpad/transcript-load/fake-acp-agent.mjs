#!/usr/bin/env node
// A minimal ACP agent for RFC 0050 load testing — newline-delimited JSON-RPC
// over stdio, no deps, no network, no LLM.
//
// It exists so a Chat panel can own a *real* session id (and therefore a real
// DockPanelRecord and a real journal file) without spending tokens or waiting
// on a vendor agent. The transcript under test is then supplied by writing a
// synthetic journal at that session's path — see gen-journal.mjs.
//
// It deliberately advertises **neither** `agentCapabilities.loadSession` nor
// `sessionCapabilities.resume`. That makes a restore take the `via: "none"`
// branch in `tryResumeOrLoad`, so the session degrades to `"journal-only"` and
// the panel paints the journal verbatim — exactly the state we want to measure,
// and with no replay to race or `dropSeed` to discard our lines.

import { randomUUID } from "node:crypto";
import { makeUpdates } from "./transcript-gen.mjs";

// --turns N: stream a synthetic transcript right after `session/new`, so a load
// test needs no journal planting and no app restart. 0 = behave as a bare agent.
//
// --unprompted N: after answering each `session/prompt`, wait N seconds and
// then stream an **agent-initiated turn** — one the client never asked for.
// This is the shape Claude Code's harness produces in the wild: a background
// task notifies, the harness re-invokes the agent in-process, and the adapter
// streams the whole turn at the client as ordinary `session/update`
// notifications with no `session/prompt` to own it. The turn deliberately
// includes a tool call that stays `in_progress` for several seconds before
// completing, because that gap is what defeats a naive "silence means idle"
// read of the stream.
const argv = process.argv.slice(2);
const TURNS = Number(argv[argv.indexOf("--turns") + 1]) || 0;
const UNPROMPTED = argv.includes("--unprompted")
  ? Number(argv[argv.indexOf("--unprompted") + 1]) || 5
  : 0;

let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (line) handle(line);
  }
});

const send = (o) => process.stdout.write(JSON.stringify(o) + "\n");
const reply = (id, result) => send({ jsonrpc: "2.0", id, result });
const fail = (id, code, message) =>
  send({ jsonrpc: "2.0", id, error: { code, message } });

const sessions = new Set();

function handle(line) {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  const { id, method, params } = msg;
  if (id === undefined) return; // a notification — nothing to answer

  switch (method) {
    case "initialize":
      reply(id, {
        protocolVersion: params?.protocolVersion ?? 1,
        // No loadSession, no resume — see the module comment.
        agentCapabilities: {},
        sessionCapabilities: {},
        promptCapabilities: {
          image: false,
          audio: false,
          embeddedContext: false,
        },
        authMethods: [],
      });
      return;

    case "session/new": {
      const sessionId = randomUUID();
      sessions.add(sessionId);
      reply(id, { sessionId, configOptions: [] });
      if (TURNS > 0) streamTranscript(sessionId, TURNS);
      return;
    }

    case "session/load":
    case "session/resume":
      // Refused on purpose, so the restore degrades to journal-only.
      fail(id, -32601, "not supported by fake-acp-agent");
      return;

    case "session/prompt": {
      const sid = params?.sessionId;
      send({
        jsonrpc: "2.0",
        method: "session/update",
        params: {
          sessionId: sid,
          update: {
            sessionUpdate: "agent_message_chunk",
            content: {
              type: "text",
              text: "fake-acp-agent: load-test fixture, no model behind me.",
            },
          },
        },
      });
      reply(id, { stopReason: "end_turn" });
      if (UNPROMPTED > 0)
        setTimeout(() => agentInitiatedTurn(sid), UNPROMPTED * 1000);
      return;
    }

    case "session/cancel":
    case "session/close":
      reply(id, {});
      return;

    default:
      fail(id, -32601, `unknown method ${method}`);
  }
}

/**
 * Blast a synthetic transcript at the client as ordinary `session/update`
 * notifications — the *live* path a working agent uses. No journal on disk and
 * no restart, and it models the case that actually matters: an agent producing
 * output into a workspace the user is not looking at.
 *
 * Chunked across ticks so the panel renders between batches instead of
 * receiving one multi-megabyte write.
 */
function streamTranscript(sessionId, turns) {
  const updates = makeUpdates({ turns, compactChunks: true });
  let i = 0;
  const pump = () => {
    const end = Math.min(i + 25, updates.length);
    for (; i < end; i++) {
      send({
        jsonrpc: "2.0",
        method: "session/update",
        params: { sessionId, update: toWire(updates[i]) },
      });
    }
    if (i < updates.length) setTimeout(pump, 10);
  };
  setTimeout(pump, 250);
}

/**
 * A turn the client never asked for: no `session/prompt` is in flight for any
 * of this. Mirrors what Silo saw in prod on 2026-10-06 — a monitor notification
 * woke the agent, it thought, ran a long command, and reported back, all while
 * the tab still showed the "Finished" badge from the user's previous turn.
 *
 * The 8-second `in_progress` gap is the interesting part. The real session's
 * tool call was a test suite that ran for over a minute with no intervening
 * update, so anything that ends a turn on short silence would cut this turn in
 * half and flicker the badge.
 */
function agentInitiatedTurn(sessionId) {
  const update = (u) =>
    send({
      jsonrpc: "2.0",
      method: "session/update",
      params: { sessionId, update: u },
    });
  const text = (t) =>
    update({
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: t },
    });

  text("A background task just notified me — checking on it.");
  setTimeout(() => {
    update({
      sessionUpdate: "tool_call",
      toolCallId: "unprompted-1",
      title: "npm run test --workspace=job-booking-panel",
      kind: "execute",
      status: "in_progress",
    });
    // The long gap: a real command running, with nothing on the wire.
    setTimeout(() => {
      update({
        sessionUpdate: "tool_call_update",
        toolCallId: "unprompted-1",
        status: "completed",
      });
      text("Tests pass. Nothing needed from you.");
      // The title the adapter regenerates at turn-over. Pure metadata — if the
      // host reads it as work, it reopens the turn it just closed, forever.
      setTimeout(
        () =>
          update({
            sessionUpdate: "session_info_update",
            title: "Background task follow-up",
          }),
        500,
      );
    }, 8000);
  }, 1500);
}

/**
 * Journal shape (`{kind, toolCall:{...}}`) -> ACP wire shape.
 *
 * Tool-call fields are **flat** on the wire — `parseToolCall` reads
 * `v.toolCallId` straight off the update object. The journal stores the
 * SDK-normalised nested form instead, so this is not a pass-through.
 */
function toWire(u) {
  const { kind, ...rest } = u;
  if (kind === "user_message_chunk" || kind === "agent_message_chunk") {
    return {
      sessionUpdate: kind,
      content: { type: "text", text: rest.text },
      ...(rest.messageId ? { messageId: rest.messageId } : {}),
    };
  }
  if (kind === "tool_call" || kind === "tool_call_update") {
    return { sessionUpdate: kind, ...rest.toolCall };
  }
  return { sessionUpdate: kind, ...rest };
}
