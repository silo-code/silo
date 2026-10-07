// What arrives when the client DOES advertise the subagent capability? — the
// spike behind RFC 0055's "Out of scope — and why it is blocked, not deferred".
//
// The sibling of subagent-finish-2026-10-06.mjs, which is the capability-OFF
// baseline. Everything structural is the same so the two captures diff; the
// only deliberate differences are the advertised capabilities and what
// `analyze()` asks. Keep it that way.
//
// RFC 0055 shipped a transcript fix built entirely on capability-free frames:
// `_meta.claudeCode.subagent` on the dispatching tool call, `toolResponse`
// `async_launched` for the hand-off, and `parentToolUseId` on each delegated
// call. It then recorded three claims about what turning the capability ON
// would do, from reading `dist/` rather than from a run. This probe tests
// exactly those three, because they decide whether RFC 0055's rendering has a
// future or is superseded:
//
//   Q1. Does the dispatching Agent/Task tool call VANISH from the stream?
//       `native-subagents.js` `route()` ends `return forcedSessionId ? {...} :
//       null` for a control update when enabled, and a `null` is dropped by the
//       caller. If so, the `Agent(…)` row RFC 0055 renders has no source and
//       the whole UI is rebuilt on the subagent lifecycle instead.
//
//   Q2. Is there a per-subagent TERMINAL signal, and is it identified?
//       `acp-subagents.d.ts` declares `subagent_state_update
//       { subagentSessionId, state: completed|failed|cancelled|disconnected }`.
//       That is the thing RFC 0055 says does not exist — "nothing revisits the
//       dispatch", so its aggregate count can never decrement. If this arrives,
//       a per-agent finish becomes renderable for the first time.
//
//   Q3. Do a subagent's own tool calls arrive under a DIFFERENT sessionId?
//       If they do, `sessionId`-aware update routing stops being optional:
//       `acp-jsonrpc.ts` currently reads `params.update` and discards
//       `params.sessionId`, so every child's work would merge into the parent
//       transcript unlabelled — worse than the lie RFC 0055 fixed.
//
// Two ways to advertise, and they are NOT the same code path
// (`clientSupportsSubagents` accepts either):
//
//   PROBE_OPT_IN=canonical  (default)  clientCapabilities.subagents = {}
//   PROBE_OPT_IN=air                   clientCapabilities._meta.jetbrains.air
//                                        = { version: 1, capabilities: [...] }
//
// Run both before trusting a conclusion — RFC 0055 asserts they emit the same
// draft shape regardless, and that is itself worth confirming rather than
// repeating.
//
//   node subagent-capability-2026-10-07.mjs
//   PROBE_OPT_IN=air node subagent-capability-2026-10-07.mjs
//   PROBE_SLEEP_SECONDS=45 node subagent-capability-2026-10-07.mjs
//   PROBE_DWELL_MS=180000 node subagent-capability-2026-10-07.mjs
//   PROBE_STDERR=1 node subagent-capability-2026-10-07.mjs
//
// PERMISSIONS ARE ALLOWED BY DEFAULT HERE, unlike the baseline. That probe
// denied everything after the hand-off to force an idle window; this one needs
// the subagent to actually RUN TO COMPLETION, because a terminal state that
// never happens proves nothing. `PROBE_FENCE=1` restores the baseline's
// denying behaviour if you want the idle window instead.

import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, appendFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const AGENT =
  process.env.PROBE_AGENT ?? "@agentclientprotocol/claude-agent-acp@0.75.1";
const DWELL_MS = Number(process.env.PROBE_DWELL_MS ?? 150000);
const SLEEP_SECONDS = Number(process.env.PROBE_SLEEP_SECONDS ?? 35);
const OPT_IN = process.env.PROBE_OPT_IN ?? "canonical";
const FENCE = !!process.env.PROBE_FENCE;

// Backgrounded vs synchronous is the axis that turned out to matter: a
// `run_in_background: true` Task goes down the CLI's *async agent* path and
// reports `async_launched` on the dispatching tool call, which is the
// capability-free shape RFC 0055 already handles. The native subagent SESSION
// machinery (`subagent_spawned` / `subagent_state_update`) is a different path.
// Run both before concluding anything about the capability.
//
//   PROBE_BACKGROUND=0 node subagent-capability-2026-10-07.mjs
const BACKGROUND = process.env.PROBE_BACKGROUND !== "0";

const PROMPT = BACKGROUND
  ? `Use the Task tool with subagent_type "general-purpose" and run_in_background: true. Its prompt: "Run \`sleep ${SLEEP_SECONDS}\`, then reply FINISHED." Do not wait for it or poll it. Reply with the single word "launched", then end your turn.`
  : `Use the Task tool with subagent_type "general-purpose" (do NOT set run_in_background). Its prompt: "Run \`sleep ${SLEEP_SECONDS}\`, then reply FINISHED." Wait for it, then reply with the single word "done" and end your turn.`;

/** Silo's real capabilities today, which this probe only ADDS to. */
const BASE = {
  fs: { readTextFile: false, writeTextFile: false },
  terminal: false,
};

/**
 * The two opt-in shapes, read straight out of the adapter rather than guessed:
 *
 * - canonical — `clientSupportsSubagents` returns true for *any* non-array
 *   object at `capabilities.subagents` (`acp-subagents.js`).
 * - air — `clientSupportsAirCapability` requires an integer
 *   `version >= 1` AND an array `capabilities` containing the name, nested
 *   `_meta.jetbrains.air` (`air-extension.js`). All three or it silently
 *   reads as off, which would make this capture a duplicate of the baseline.
 */
function advertise(mode) {
  if (mode === "canonical") return { ...BASE, subagents: {} };
  if (mode === "air") {
    return {
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
  }
  console.error(`unknown PROBE_OPT_IN "${mode}" — use canonical or air`);
  process.exit(2);
}

/**
 * The mirror of the baseline's `assertNoOptIn`. A capture where the capability
 * silently failed to register looks exactly like the capability-off baseline,
 * and would be read as "the capability changes nothing" — the most expensive
 * wrong conclusion available here. So re-implement both gates and refuse to run
 * unless at least one says yes.
 */
function assertOptIn(caps, mode) {
  const canonical =
    typeof caps.subagents === "object" &&
    caps.subagents !== null &&
    !Array.isArray(caps.subagents);
  const air = caps._meta?.jetbrains?.air;
  const airOk =
    Number.isInteger(air?.version) &&
    air.version >= 1 &&
    Array.isArray(air?.capabilities) &&
    air.capabilities.includes("nativeSubagentSessions");
  if (!canonical && !airOk) {
    console.error(
      "REFUSING TO RUN — neither opt-in gate would read as advertised:",
    );
    console.error(`  canonical (capabilities.subagents object): ${canonical}`);
    console.error(`  AIR (_meta.jetbrains.air v>=1 + name):     ${airOk}`);
    process.exit(2);
  }
  console.log(
    `opt-in   ${mode} — canonical=${canonical} air=${airOk} (either is enough)`,
  );
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
    this.dispatchSeen = false;
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
      u?.toolCallId,
      u?.subagentSessionId && `child=${u.subagentSessionId}`,
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
      const u = msg.params?.update;
      if (u?.sessionUpdate === "tool_call") {
        const cc = u._meta?.claudeCode;
        if (
          cc?.subagent === true ||
          cc?.toolName === "Agent" ||
          cc?.toolName === "Task"
        )
          this.dispatchSeen = true;
      }
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
      if (FENCE && this.dispatchSeen) {
        const reject = opts.find((o) =>
          /reject|deny|no/i.test(o.name ?? o.optionId ?? ""),
        );
        this._send({
          jsonrpc: "2.0",
          id,
          result: reject
            ? { outcome: { outcome: "selected", optionId: reject.optionId } }
            : { outcome: { outcome: "cancelled" } },
        });
        return;
      }
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

/**
 * Answers Q1–Q3 as data, not prose. Every field here is something a reader can
 * check against the raw JSONL beside it.
 */
function analyze(frames, rootSessionId, promptEndedRel) {
  const ups = updates(frames);
  const out = {
    rootSessionId,
    promptEndedRel,
    frames: frames.length,
    updates: ups.length,
  };

  // --- Q1: did the dispatching control call survive? ---------------------
  // The same test `isNativeSubagentControlUpdate` applies, so a hit here means
  // the adapter did NOT swallow it and RFC 0055's `Agent(…)` row still has a
  // source even with the capability on.
  out.dispatchCalls = ups
    .filter(({ u }) => {
      const cc = u._meta?.claudeCode;
      return (
        (u.sessionUpdate === "tool_call" ||
          u.sessionUpdate === "tool_call_update") &&
        (cc?.subagent === true ||
          cc?.toolName === "Agent" ||
          cc?.toolName === "Task")
      );
    })
    .map(({ rel, sessionId, u }) => ({
      rel,
      sessionId,
      sessionUpdate: u.sessionUpdate,
      toolCallId: u.toolCallId,
      status: u.status,
      title: u.title,
      toolResponse: u._meta?.claudeCode?.toolResponse,
    }));
  out.dispatchRowSurvives = out.dispatchCalls.length > 0;

  // --- Q2: is there an identified terminal signal? -----------------------
  const lifecycle = ups.filter(({ u }) =>
    ["subagent_spawned", "subagent_state_update"].includes(u.sessionUpdate),
  );
  out.subagentLifecycle = lifecycle.map(({ rel, sessionId, u }) => ({
    rel,
    sessionId,
    sessionUpdate: u.sessionUpdate,
    subagentSessionId: u.subagentSessionId,
    name: u.name,
    task: u.task,
    state: u.state,
    capabilities: u.capabilities,
    // The field RFC 0055 would need to correlate a finish back to a dispatch
    // row. Declared nowhere in the type — check whether it rides anyway.
    toolCallId: u.toolCallId,
    _meta: u._meta,
  }));
  out.spawned = out.subagentLifecycle.filter(
    (f) => f.sessionUpdate === "subagent_spawned",
  );
  out.stateUpdates = out.subagentLifecycle.filter(
    (f) => f.sessionUpdate === "subagent_state_update",
  );
  out.terminalStates = out.stateUpdates.map((f) => f.state);
  out.hasIdentifiedTerminalSignal =
    out.stateUpdates.length > 0 &&
    out.stateUpdates.every((f) => typeof f.subagentSessionId === "string");
  // The decisive timing question: does the finish land AFTER the parent's turn
  // ended? If it only ever arrives inside the turn, it is no more useful than
  // what capability-off already gives.
  out.terminalAfterTurnEnd = out.stateUpdates
    .filter((f) => secs(f.rel) > secs(promptEndedRel))
    .map((f) => ({ rel: f.rel, state: f.state, child: f.subagentSessionId }));

  // --- Q3: whose session does the delegated work arrive on? --------------
  out.sessionIds = [...new Set(ups.map((u) => u.sessionId).filter(Boolean))];
  out.childSessionIds = out.sessionIds.filter((id) => id !== rootSessionId);
  out.updatesBySession = Object.fromEntries(
    out.sessionIds.map((id) => [
      id === rootSessionId ? `${id} (ROOT)` : `${id} (child)`,
      ups.filter((x) => x.sessionId === id).length,
    ]),
  );
  out.sessionRoutingRequired = out.childSessionIds.length > 0;

  // Does the capability-free attribution still ride alongside? If it does, a
  // migration could read both; if it stops, RFC 0055's field is dead on
  // arrival the moment the capability is on.
  out.parentToolUseIdStillPresent = ups.some(
    ({ u }) => u._meta?.claudeCode?.parentToolUseId !== undefined,
  );

  // The adapter gates forwarding a subagent's prose on this capability, so
  // its presence is a second, independent confirmation the opt-in registered.
  out.subagentProseForwarded = ups.some(
    ({ sessionId, u }) =>
      sessionId !== rootSessionId &&
      ["agent_message_chunk", "agent_thought_chunk"].includes(u.sessionUpdate),
  );

  const q1 = out.dispatchRowSurvives
    ? "Q1 dispatch row SURVIVES — RFC 0055's Agent(…) row still has a source"
    : "Q1 dispatch row IS DROPPED — RFC 0055's rendering loses its source";
  const q2 = out.hasIdentifiedTerminalSignal
    ? `Q2 identified terminal signal EXISTS (${out.terminalStates.join(", ")})`
    : "Q2 NO identified terminal signal arrived";
  const q3 = out.sessionRoutingRequired
    ? `Q3 child sessions ARE used (${out.childSessionIds.length}) — sessionId routing required first`
    : "Q3 everything stayed on the root session — no routing prerequisite observed";
  out.verdict = [q1, q2, q3].join("\n");
  return out;
}

async function main() {
  const ADVERTISED = advertise(OPT_IN);
  assertOptIn(ADVERTISED, OPT_IN);

  const cwd = mkdtempSync(path.join(os.tmpdir(), "acp-subagent-cap-"));
  writeFileSync(path.join(cwd, "note.txt"), "subagent capability spike\n");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const mode = BACKGROUND ? "bg" : "sync";
  const logPath = path.join(cwd, `frames-cap-${OPT_IN}-${mode}-${stamp}.jsonl`);

  console.log(`agent    ${AGENT}`);
  console.log(`cwd      ${cwd}`);
  console.log(`frames   ${logPath}`);
  console.log(`dwell    ${DWELL_MS}ms after the turn ends`);
  console.log(
    `task     ${BACKGROUND ? "run_in_background: true (async agent path)" : "synchronous (native subagent path)"}`,
  );
  console.log(`sleep    ${SLEEP_SECONDS}s inside the subagent`);
  console.log(
    `fence    ${FENCE ? "deny after dispatch (PROBE_FENCE)" : "allow all — the subagent must finish"}\n`,
  );

  const c = new Conn(logPath).start();
  const report = {
    agent: AGENT,
    cwd,
    logPath,
    optIn: OPT_IN,
    background: BACKGROUND,
    advertised: ADVERTISED,
    prompt: PROMPT,
  };

  try {
    const init = await c.request(
      "initialize",
      {
        protocolVersion: 1,
        clientCapabilities: ADVERTISED,
        clientInfo: {
          name: "silo-subagent-capability-probe",
          version: "0.0.0",
        },
      },
      60000,
    );
    report.negotiated = init?.protocolVersion;
    report.agentInfo = init?.agentInfo;
    report.agentCapabilities = init?.agentCapabilities;
    // What the agent says back about subagents — its own advertisement, which
    // tells us whether the handshake registered before any turn runs.
    report.agentMeta = init?._meta;

    // The AIR payload goes on `session/new` as well as `initialize`.
    // claude-agent-acp#1195: the canonical `clientCapabilities.subagents` opt-in
    // is STRIPPED by the SDK's `zClientCapabilities` Zod schema before
    // `clientSupportsSubagents` ever reads it, so the canonical path cannot work
    // on these versions and AIR is the only one that does.
    const sess = await c.request(
      "session/new",
      {
        cwd,
        mcpServers: [],
        ...(OPT_IN === "air" ? { _meta: ADVERTISED._meta } : {}),
      },
      120000,
    );
    report.sessionId = sess?.sessionId;
    report.sessionCapabilities = sess?.capabilities ?? sess?._meta;

    console.log(
      `\n--- prompting (subagent sleeps ${SLEEP_SECONDS}s; watching for subagent_spawned / subagent_state_update) ---\n`,
    );

    const res = await c.request(
      "session/prompt",
      { sessionId: sess.sessionId, prompt: [{ type: "text", text: PROMPT }] },
      300000,
    );
    report.stopReason = res?.stopReason;
    const promptEndedRel = rel();
    report.promptEndedRel = promptEndedRel;

    console.log(
      `\n--- turn ended at ${promptEndedRel} (stopReason=${report.stopReason}) ---`,
    );
    console.log(`--- dwelling ${DWELL_MS}ms for the subagent to finish ---\n`);
    await new Promise((r) => setTimeout(r, DWELL_MS));

    report.result = analyze(c.frames, sess.sessionId, promptEndedRel);
  } catch (e) {
    report.error = String(e);
    report.result = analyze(
      c.frames,
      report.sessionId,
      report.promptEndedRel ?? "+0s",
    );
  } finally {
    c.kill();
  }

  const reportPath = path.join(
    cwd,
    `report-cap-${OPT_IN}-${mode}-${stamp}.json`,
  );
  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  const r = report.result ?? {};
  console.log(
    `\n================ VERDICT (opt-in: ${OPT_IN}, task: ${BACKGROUND ? "backgrounded" : "synchronous"}) ================`,
  );
  console.log(r.verdict ?? "no verdict");
  console.log(
    `\nQ1 — frames naming the dispatching Agent/Task call: ${r.dispatchCalls?.length ?? 0}`,
  );
  console.log(JSON.stringify(r.dispatchCalls ?? [], null, 2).slice(0, 2000));
  console.log(
    `\nQ2 — subagent lifecycle frames: ${r.subagentLifecycle?.length ?? 0}`,
  );
  console.log(
    JSON.stringify(r.subagentLifecycle ?? [], null, 2).slice(0, 3000),
  );
  console.log(
    `     terminal states:        ${JSON.stringify(r.terminalStates ?? [])}`,
  );
  console.log(
    `     arrived after turn end: ${JSON.stringify(r.terminalAfterTurnEnd ?? [])}`,
  );
  console.log(`\nQ3 — updates per session:`);
  console.log(JSON.stringify(r.updatesBySession ?? {}, null, 2));
  console.log(`     root:  ${r.rootSessionId}`);
  console.log(`     child: ${JSON.stringify(r.childSessionIds ?? [])}`);
  console.log(`\ncarry-over checks:`);
  console.log(
    `  parentToolUseId still present: ${r.parentToolUseIdStillPresent}`,
  );
  console.log(`  subagent prose forwarded:      ${r.subagentProseForwarded}`);
  console.log(`\nframes   ${logPath}`);
  console.log(`report   ${reportPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
