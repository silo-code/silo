// What arrives for a backgrounded SHELL in the main session? — the spike behind
// RFC 0055's last open item ("Backgrounded shells are unblocked, and were never
// part of this").
//
// The third sibling of subagent-finish-2026-10-06.mjs (capability-off baseline)
// and subagent-capability-2026-10-07.mjs (AIR subagent capability). Everything
// structural is the same so the captures diff; the deliberate differences are
// the prompt (a `Bash` with `run_in_background: true`, NOT a `Task`) and what
// `analyze()` asks.
//
// WHY THIS PROBE EXISTS EVEN THOUGH A CAPTURE ALREADY SHOWS THE LIFECYCLE.
// `captures/frames-cap-air-bg-2026-10-07T19-35-21-238Z.jsonl` already contains a
// full `async_task_*` lifecycle — but for a shell run INSIDE A SUBAGENT, which
// is the one case where the correlation is cross-session: the `Bash` tool call
// arrived on the child session (`a26fef4c`) while `AsyncTaskRuntime.publishState`
// used the ROOT session (`34937d66`), because the runtime is constructed once per
// `session/new`. The case Silo actually has to render is a background shell in
// the session the user is looking at, and "both land on the root" must be
// observed, not assumed.
//
// The questions, each decided by a field a reader can check against the JSONL:
//
//   Q1. Does `_meta.jetbrains.air.asyncTasks.backgrounded` land on the Bash
//       `tool_call_update` in the MAIN session? `backgroundedBashToolCall` only
//       stamps it when the task's `toolCallId` matches the update's, and that
//       id is recovered from the tool RESULT (`backgroundBashTaskFromToolResult`).
//       Without it the row cannot know it is backgrounded rather than finished.
//
//   Q2. Does the lifecycle arrive on the SAME sessionId as the tool call?
//       If it does, RFC 0057's routing is irrelevant here and the reducer is a
//       plain `asyncTaskId` → row correlation. If not, this inherits the whole
//       routing problem after all.
//
//   Q3. Does `session/prompt` resolve BEFORE the shell finishes?
//       Decides whether an indicator must survive turn end. For subagents both
//       regimes occurred and neither was a protocol guarantee, so the answer
//       here is "observe, then handle both" — not "pick one".
//
//   Q4. Is the double terminal (`stopped` then `completed`, 1ms apart)
//       reproducible? `finish()` in `async-tasks.js` documents it: a "level"
//       source publishes a best-effort `stopped` and the authoritative "event"
//       edge corrects it. A reducer that latches the FIRST terminal renders a
//       completed shell as stopped, so this is load-bearing, not trivia.
//
//   Q5. Does `async_task_spawned` carry a `toolCallId`? In the committed
//       capture it did NOT — the correlation arrived on the first
//       `async_task_progress` 1ms later. A consumer keyed on `toolCallId` alone
//       would therefore drop the spawn.
//
//   node background-shell-2026-10-08.mjs
//   PROBE_SLEEP_SECONDS=45 node background-shell-2026-10-08.mjs
//   PROBE_DWELL_MS=180000 node background-shell-2026-10-08.mjs
//   PROBE_STDERR=1 node background-shell-2026-10-08.mjs
//
// Permissions are ALLOWED by default: a shell that never runs proves nothing.
// Defaults to the real `~/.claude` and to the adapter version `catalog/claude.ts`
// pins, for the same reason the siblings do.

import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, appendFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const AGENT =
  process.env.PROBE_AGENT ?? "@agentclientprotocol/claude-agent-acp@0.75.1";
const DWELL_MS = Number(process.env.PROBE_DWELL_MS ?? 120000);
const SLEEP_SECONDS = Number(process.env.PROBE_SLEEP_SECONDS ?? 30);

// A backgrounded Bash, with the agent told explicitly not to poll it — polling
// would keep the turn open and destroy the Q3 observation.
const PROMPT =
  `Run this shell command with the Bash tool and run_in_background set to true: ` +
  `\`sleep ${SLEEP_SECONDS} && echo PROBE_SHELL_FINISHED\`. ` +
  `Do NOT wait for it, do NOT poll it with BashOutput, and do NOT check on it. ` +
  `As soon as it is launched, reply with the single word "launched" and end your turn.`;

/** Silo's real capabilities today, which this probe only ADDS `asyncTasks` to. */
const BASE = {
  fs: { readTextFile: false, writeTextFile: false },
  terminal: false,
};

/**
 * Silo's live AIR block plus `asyncTasks`. Shaped per `air-extension.js`
 * `clientSupportsAirCapability`: an integer `version >= 1` AND an array
 * `capabilities` containing the name, nested under `_meta.jetbrains.air`.
 *
 * It must sit INSIDE `clientCapabilities` on `initialize` — the adapter reads
 * it only from there, never from `session/new` (ADR 0057). A correctly-shaped
 * block in the wrong place reads as capability-off, which here would mean no
 * lifecycle and no marker: an empty capture indistinguishable from "the
 * adapter doesn't do this".
 */
const ADVERTISED = {
  ...BASE,
  _meta: {
    jetbrains: {
      air: {
        version: 1,
        capabilities: ["nativeSubagentSessions", "asyncTasks"],
      },
    },
  },
};

/** The adapter's own gate, re-implemented, so a silent opt-in failure can't be
 *  read as a finding. Refuses to run rather than produce a void capture. */
function assertOptIn(caps) {
  const air = caps._meta?.jetbrains?.air;
  const ok =
    Number.isInteger(air?.version) &&
    air.version >= 1 &&
    Array.isArray(air?.capabilities) &&
    air.capabilities.includes("asyncTasks");
  if (!ok) {
    console.error(
      "REFUSING TO RUN — the adapter's asyncTasks gate would read as OFF.",
    );
    process.exit(2);
  }
  console.log("opt-in   AIR asyncTasks — gate re-checked locally: true");
}

const started = Date.now();
const rel = () => `+${((Date.now() - started) / 1000).toFixed(3)}s`;
const secs = (r) => parseFloat(String(r).replace(/[+s]/g, ""));

class Conn {
  constructor(logPath) {
    this.logPath = logPath;
    this.buf = "";
    this.nextId = 1;
    this.pending = new Map();
    this.frames = [];
  }

  _log(dir, msg) {
    const rec = { t: Date.now(), rel: rel(), dir, msg };
    this.frames.push(rec);
    appendFileSync(this.logPath, JSON.stringify(rec) + "\n");
    const m =
      msg.method ??
      (msg.error ? `error(id=${msg.id})` : `result(id=${msg.id})`);
    const u = msg.params?.update;
    const detail = [
      u?.sessionUpdate,
      u?.asyncTaskId && `task=${u.asyncTaskId}`,
      u?.toolCallId,
      u?.state && `state=${u.state}`,
      u?.status && `status=${u.status}`,
    ]
      .filter(Boolean)
      .join(" ");
    console.log(
      `${rel()} ${dir === "in" ? "<-" : "->"} ${m}${detail ? ` ${detail}` : ""}`,
    );
  }

  start() {
    this.child = spawn("npx", ["-y", AGENT], {
      env: { ...process.env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child.stdout.on("data", (d) => this._onData(d));
    this.child.stderr.on("data", (d) => {
      if (process.env.PROBE_STDERR) process.stderr.write(`[stderr] ${d}`);
    });
    this.child.on("error", (e) => {
      console.error(`spawn failed: ${e.message}`);
      process.exit(1);
    });
    return this;
  }

  _onData(d) {
    this.buf += d.toString();
    let i;
    while ((i = this.buf.indexOf("\n")) >= 0) {
      const line = this.buf.slice(0, i).trim();
      this.buf = this.buf.slice(i + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        appendFileSync(
          this.logPath,
          JSON.stringify({ t: Date.now(), rel: rel(), dir: "in", raw: line }) +
            "\n",
        );
        continue;
      }
      this._log("in", msg);
      this._dispatch(msg);
    }
  }

  _dispatch(msg) {
    if (msg.method !== undefined && msg.id !== undefined) {
      this._answerServerReq(msg);
      return;
    }
    if (msg.id !== undefined && this.pending.has(msg.id)) {
      const { res, rej } = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error)
        rej(
          Object.assign(new Error(msg.error.message), { data: msg.error.data }),
        );
      else res(msg.result);
    }
  }

  _answerServerReq(msg) {
    const { method, id } = msg;
    if (method === "session/request_permission") {
      const opts = msg.params?.options ?? [];
      const allow =
        opts.find((o) => /allow.*always|always.*allow/i.test(o.name ?? "")) ??
        opts.find((o) =>
          /allow|approve|yes/i.test(o.name ?? o.optionId ?? ""),
        ) ??
        opts[0];
      this._send({
        jsonrpc: "2.0",
        id,
        result: { outcome: { outcome: "selected", optionId: allow?.optionId } },
      });
      return;
    }
    this._send({
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: `method not supported: ${method}` },
    });
  }

  _send(obj) {
    this._log("out", obj);
    this.child.stdin.write(JSON.stringify(obj) + "\n");
  }

  request(method, params, timeoutMs = 300000) {
    const id = this.nextId++;
    const p = new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          rej(new Error(`timeout ${method}`));
        }
      }, timeoutMs);
    });
    this._send({ jsonrpc: "2.0", id, method, params });
    return p;
  }

  kill() {
    try {
      this.child.kill("SIGKILL");
    } catch {}
  }
}

function updates(frames) {
  return frames
    .filter((f) => f.dir === "in" && f.msg?.method === "session/update")
    .map((f) => ({
      rel: f.rel,
      sessionId: f.msg.params?.sessionId,
      u: f.msg.params?.update ?? {},
    }));
}

const AIR_ASYNC = (u) => u._meta?.jetbrains?.air?.asyncTasks;

/** Answers Q1-Q5 as data, not prose. */
function analyze(frames, rootSessionId, promptEndedRel) {
  const ups = updates(frames);
  const out = {
    rootSessionId,
    promptEndedRel,
    frames: frames.length,
    updates: ups.length,
  };

  // --- Q1: the marker on the Bash tool call ------------------------------
  const bashCalls = ups.filter(
    ({ u }) =>
      (u.sessionUpdate === "tool_call" ||
        u.sessionUpdate === "tool_call_update") &&
      (u._meta?.claudeCode?.toolName === "Bash" || AIR_ASYNC(u)),
  );
  out.bashCalls = bashCalls.map(({ rel, sessionId, u }) => ({
    rel,
    sessionId,
    sessionUpdate: u.sessionUpdate,
    toolCallId: u.toolCallId,
    status: u.status,
    title: u.title,
    // The link the adapter recovers from the tool result.
    backgroundTaskId: u._meta?.claudeCode?.toolResponse?.backgroundTaskId,
    airAsyncTasks: AIR_ASYNC(u),
  }));
  const marked = out.bashCalls.filter((c) => c.airAsyncTasks?.backgrounded);
  out.markerPresent = marked.length > 0;
  out.markerFrames = marked;
  // The lie this feature exists to correct: the row says completed while the
  // command runs on. Confirm it is still told, so the fix still has a purpose.
  out.markedRowStatuses = marked.map((c) => c.status);

  // --- Q2/Q5: the async task lifecycle -----------------------------------
  const life = ups.filter(({ u }) =>
    String(u.sessionUpdate).startsWith("async_task"),
  );
  out.lifecycle = life.map(({ rel, sessionId, u }) => ({
    rel,
    sessionId,
    sessionUpdate: u.sessionUpdate,
    asyncTaskId: u.asyncTaskId,
    taskType: u.taskType,
    name: u.name,
    description: u.description,
    showInTranscript: u.showInTranscript,
    canStop: u.canStop,
    state: u.state,
    summary: u.summary,
    toolCallId: u.toolCallId,
    outputFilePath: u.outputFilePath,
  }));
  out.spawned = out.lifecycle.filter(
    (f) => f.sessionUpdate === "async_task_spawned",
  );
  out.states = out.lifecycle.filter(
    (f) => f.sessionUpdate === "async_task_state_update",
  );
  // Q5 — does the spawn name the tool call, or does correlation arrive later?
  out.spawnCarriesToolCallId = out.spawned.every(
    (f) => typeof f.toolCallId === "string" && f.toolCallId,
  );
  out.firstToolCallIdAt = out.lifecycle.find((f) => f.toolCallId)?.rel;
  // Q2 — one session or two?
  out.lifecycleSessionIds = [...new Set(out.lifecycle.map((f) => f.sessionId))];
  out.bashSessionIds = [...new Set(out.bashCalls.map((c) => c.sessionId))];
  out.sameSession =
    out.lifecycleSessionIds.length === 1 &&
    out.bashSessionIds.length === 1 &&
    out.lifecycleSessionIds[0] === out.bashSessionIds[0];
  // Does the lifecycle's toolCallId actually name a Bash call we saw?
  const bashIds = new Set(out.bashCalls.map((c) => c.toolCallId));
  out.correlationResolves = out.lifecycle
    .filter((f) => f.toolCallId)
    .every((f) => bashIds.has(f.toolCallId));

  // --- Q3: did the turn end before the shell did? ------------------------
  const terminal = out.states.filter((f) =>
    ["completed", "failed", "stopped"].includes(f.state),
  );
  out.terminalStates = terminal.map((f) => ({ rel: f.rel, state: f.state }));
  out.turnEndedBeforeShellFinished =
    terminal.length > 0 &&
    promptEndedRel !== undefined &&
    secs(terminal[terminal.length - 1].rel) > secs(promptEndedRel);

  // --- Q4: the double terminal -------------------------------------------
  out.terminalCount = terminal.length;
  out.doubleTerminal = terminal.length > 1;
  out.lastTerminalState = terminal[terminal.length - 1]?.state;
  out.firstTerminalState = terminal[0]?.state;
  out.latchingFirstWouldBeWrong =
    out.doubleTerminal && out.firstTerminalState !== out.lastTerminalState;

  const verdict = [
    out.markerPresent
      ? `Q1 marker PRESENT on ${marked.length} frame(s) (row status: ${out.markedRowStatuses.join(", ") || "none"}) — a row can know it is backgrounded`
      : "Q1 marker ABSENT — the tool call cannot be told apart from a finished one",
    out.sameSession
      ? `Q2 tool call and lifecycle share one session (${out.lifecycleSessionIds[0]}) — no routing prerequisite`
      : `Q2 SPLIT ACROSS SESSIONS — bash on ${out.bashSessionIds.join(",")}, lifecycle on ${out.lifecycleSessionIds.join(",")}`,
    out.turnEndedBeforeShellFinished
      ? "Q3 the turn ENDED while the shell ran on — an indicator must survive turn end"
      : "Q3 the turn outlived the shell (or no terminal arrived) — see terminalStates",
    out.doubleTerminal
      ? `Q4 DOUBLE terminal reproduced: ${terminal.map((f) => f.state).join(" -> ")}${out.latchingFirstWouldBeWrong ? " — latching the first WOULD BE WRONG" : ""}`
      : `Q4 single terminal (${out.lastTerminalState ?? "none"})`,
    out.spawnCarriesToolCallId
      ? "Q5 async_task_spawned carries toolCallId"
      : `Q5 spawn carries NO toolCallId — correlation first seen at ${out.firstToolCallIdAt ?? "never"}`,
  ];
  out.verdict = verdict.join("\n");
  return out;
}

async function main() {
  assertOptIn(ADVERTISED);

  const cwd = mkdtempSync(path.join(os.tmpdir(), "acp-bg-shell-"));
  writeFileSync(path.join(cwd, "note.txt"), "background shell spike\n");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const logPath = path.join(cwd, `frames-bgshell-${stamp}.jsonl`);

  console.log(`agent    ${AGENT}`);
  console.log(`cwd      ${cwd}`);
  console.log(`frames   ${logPath}`);
  console.log(`sleep    ${SLEEP_SECONDS}s in a backgrounded Bash`);
  console.log(`dwell    ${DWELL_MS}ms after the turn ends\n`);

  const c = new Conn(logPath).start();
  const report = { agent: AGENT, cwd, logPath, advertised: ADVERTISED, PROMPT };

  try {
    const init = await c.request(
      "initialize",
      {
        protocolVersion: 1,
        clientCapabilities: ADVERTISED,
        clientInfo: { name: "silo-background-shell-probe", version: "0.0.0" },
      },
      60000,
    );
    report.negotiated = init?.protocolVersion;
    report.agentInfo = init?.agentInfo;
    // The adapter's OWN advertisement, never an acknowledgement of ours —
    // reading it as confirmation has already cost this project one wrong
    // conclusion (RFC 0055).
    report.agentMeta = init?._meta;

    const sess = await c.request(
      "session/new",
      { cwd, mcpServers: [] },
      120000,
    );
    report.sessionId = sess?.sessionId;

    console.log(
      `\n--- prompting (shell sleeps ${SLEEP_SECONDS}s; watching async_task_*) ---\n`,
    );

    const res = await c.request(
      "session/prompt",
      { sessionId: sess.sessionId, prompt: [{ type: "text", text: PROMPT }] },
      300000,
    );
    const promptEndedRel = rel();
    report.stopReason = res?.stopReason;
    report.promptEndedRel = promptEndedRel;
    console.log(
      `\n--- turn ended at ${promptEndedRel} (${res?.stopReason}); dwelling ${DWELL_MS}ms ---\n`,
    );

    await new Promise((r) => setTimeout(r, DWELL_MS));

    report.analysis = analyze(c.frames, sess?.sessionId, promptEndedRel);
    console.log(`\n================ VERDICT ================\n`);
    console.log(report.analysis.verdict);
    console.log(`\n========================================\n`);
  } catch (err) {
    report.error = String(err?.message ?? err);
    console.error(`\nPROBE FAILED: ${report.error}`);
  } finally {
    const reportPath = path.join(cwd, `report-bgshell-${stamp}.json`);
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`report   ${reportPath}`);
    console.log(`frames   ${logPath}`);
    c.kill();
  }
}

main();
