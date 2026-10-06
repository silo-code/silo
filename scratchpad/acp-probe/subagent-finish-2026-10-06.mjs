// Does a backgrounded subagent's completion reach the client with NO capability
// advertised? — the open question from RFC 0055's Decision section.
//
// RFC 0055 claims nothing reports that a subagent finished, from one recording
// in which the dispatching tool call was never mentioned again after
// `async_launched`. But `claude-agent-acp` registers a PostToolUse hook per
// tool use (dist/acp-agent.js, `onPostToolUseHook`) gated on no client
// capability at all, and each firing publishes a `tool_call_update` on the
// dispatching toolCallId carrying `_meta.claudeCode.toolResponse`. The adapter
// even notes a PostToolUse hook can fire *after* tool_result time. So the
// delivery path is open; whether the CLI uses it for a backgrounded Task is
// CLI-side and only a live run can say.
//
// The question this answers, precisely: after a Task dispatched with
// `run_in_background: true` reports back, does a SECOND `tool_call_update`
// arrive on the original dispatching toolCallId, and what does its
// `toolResponse` carry?
//
// Advertises the same clientCapabilities Silo does today and nothing more — no
// `subagents`, no AIR `_meta`. Keeping that true is the whole point, so it is
// asserted at startup rather than trusted (see ADVERTISED / assertNoOptIn).
//
// Speaks newline-delimited JSON-RPC over a child's stdio, no deps, same shape
// as recon-2026-09-09.mjs. Every frame in both directions is written to a
// JSONL file so the answer is re-derivable without a rerun.
//
//   node subagent-finish-2026-10-06.mjs
//   PROBE_DWELL_MS=180000 node subagent-finish-2026-10-06.mjs
//   PROBE_SLEEP_SECONDS=35 node subagent-finish-2026-10-06.mjs
//   PROBE_ALLOW_ALL=1 node subagent-finish-2026-10-06.mjs      # don't fence the agent (see below)
//   PROBE_AGENT=@agentclientprotocol/claude-agent-acp@latest node subagent-finish-2026-10-06.mjs
//   PROBE_ISOLATED_CONFIG=1 node subagent-finish-2026-10-06.mjs   # unauthenticated; handshake only
//   PROBE_STDERR=1 node subagent-finish-2026-10-06.mjs
//
// Unlike recon-2026-09-09.mjs this defaults to the REAL ~/.claude config,
// because the probe is worthless unless the agent can actually run a Task.
//
// READ THIS BEFORE INTERPRETING A CAPTURE. `run_in_background: true` does not
// detach the subagent from the ACP *turn*. Across every capture here the parent
// said its word and stopped, but `session/prompt` stayed unresolved until the
// subagent was done — and in between, the subagent's own tool calls streamed
// onto the PARENT session, each stamped `_meta.claudeCode.parentToolUseId` with
// the dispatching call's id. The subagent's prose is not forwarded (the adapter
// gates that on `clientSupportsSubagents`), only its tool calls.
//
// NOT UNIVERSAL — both regimes occur. Every capture in this directory kept the
// turn open, but two independent Silo sessions on the same adapter version, also
// capability-off, did the opposite: the parent's `session/prompt` resolved while
// the subagent was still working, and the remaining child calls arrived inside a
// later agent-initiated turn. Journal `e88de454-…` (2026-10-06) shows a child
// call at line 49, `origin: human` turn end at 52, two more child calls at 53
// and 59, and an `origin: task-notification` turn end at 96.
//
// Whether the parent ends its turn after dispatching is a model decision, not a
// protocol guarantee — the Silo sessions ran opus, this probe takes the CLI
// default. So "the agent is idle while its delegate runs" is *sometimes* true,
// and a design must handle both. Pin the model and re-run if you need to settle
// which factor drives it.
//
// `analyze()` attributes every tool call to the dispatch or to the parent rather
// than assuming a long turn means the agent refused to detach. An early version
// of this script made exactly that mistake and reported a clean "no".

import { spawn } from "node:child_process";
import {
  mkdtempSync,
  writeFileSync,
  appendFileSync,
  existsSync,
  readFileSync,
  statSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

// Pinned to what `catalog/claude.ts` ships, so a finding here is a finding
// about the adapter Silo actually runs.
const AGENT =
  process.env.PROBE_AGENT ?? "@agentclientprotocol/claude-agent-acp@0.75.1";
const DWELL_MS = Number(process.env.PROBE_DWELL_MS ?? 150000);
const ISOLATED = !!process.env.PROBE_ISOLATED_CONFIG;
const SLEEP_SECONDS = Number(process.env.PROBE_SLEEP_SECONDS ?? 35);
// Deny permission once the dispatch is seen, so the agent cannot block the turn
// open until the subagent is done. See the header note on setup fragility.
const ALLOW_ALL = !!process.env.PROBE_ALLOW_ALL;
// DEFAULT OFF, and leave it off unless you know why you want it.
// `session/cancel` after the hand-off looked like a clean way to force the idle
// window, but capture 2026-10-06T19-56-33Z showed it propagates into the
// subagent: its output file ends `[Request interrupted by user]` mid-sleep. A
// cancelled run can therefore never answer the question — the subagent never
// finishes, so of course nothing reports that it did. Kept, with the
// `cancelKilledSubagent` check, because that propagation is itself a finding.
const FORCE_IDLE_MS = Number(process.env.PROBE_FORCE_IDLE_MS ?? 0);

// The async case from RFC 0055, with the sleep parameterized. The sleep must
// outlast the turn — the whole setup is that the subagent finishes while the
// agent is idle.
const PROMPT = `Use the Task tool with subagent_type "general-purpose" and run_in_background: true. Its prompt: "Run \`sleep ${SLEEP_SECONDS}\`, then reply FINISHED." Do not wait for it or poll it. Reply with the single word "launched", then end your turn.`;

/**
 * Exactly what Silo advertises today (`acp-jsonrpc.ts` + `acp-sessions-service.ts`):
 * fs declined, terminal declined, nothing else. No `subagents`, no `_meta`.
 * `clientSupportsSubagents` reads `capabilities.subagents` OR AIR
 * `_meta.jetbrains.air.capabilities` containing `nativeSubagentSessions`;
 * `clientSupportsAsyncTasks` reads the same AIR path for `asyncTasks`. Both
 * must be false for this capture to mean anything.
 */
const ADVERTISED = {
  fs: { readTextFile: false, writeTextFile: false },
  terminal: false,
};

function assertNoOptIn(caps) {
  const json = JSON.stringify(caps);
  const problems = [];
  if (caps.subagents !== undefined)
    problems.push("clientCapabilities.subagents is set");
  if (caps._meta !== undefined)
    problems.push("clientCapabilities._meta is set (AIR lives here)");
  for (const name of [
    "nativeSubagentSessions",
    "asyncTasks",
    "jetbrains",
    "air",
  ]) {
    if (json.includes(name)) problems.push(`capabilities mention "${name}"`);
  }
  if (problems.length) {
    console.error(
      "REFUSING TO RUN — this would not be a capability-off capture:",
    );
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(2);
  }
}

const started = Date.now();
const rel = () => `+${((Date.now() - started) / 1000).toFixed(3)}s`;

class Conn {
  constructor(logPath, env) {
    this.logPath = logPath;
    this.env = { ...process.env, ...env };
    this.buf = "";
    this.nextId = 1;
    this.pending = new Map();
    this.frames = []; // every frame, both directions, in order
    this.dispatchSeen = false; // set by _noteDispatch; fences permissions
    this.dispatchId = undefined;
    this.dispatchRel = undefined;
    this.denied = []; // tools refused after the dispatch, for the report
    this.dispatchSettledRel = undefined;
    this.cancelledRel = undefined;
    this.onDispatchSettled = null;
  }

  /**
   * Mirrors `isNativeSubagentControlUpdate` — `_meta.claudeCode.subagent`, or a
   * toolName of Agent/Task — so the probe keys off the same fact an
   * implementation would.
   */
  _noteDispatch(msg) {
    if (msg.method !== "session/update") return;
    const u = msg.params?.update;
    if (u?.sessionUpdate !== "tool_call" || this.dispatchSeen) return;
    const cc = u._meta?.claudeCode;
    if (
      cc?.subagent === true ||
      cc?.toolName === "Agent" ||
      cc?.toolName === "Task"
    ) {
      this.dispatchSeen = true;
      this.dispatchId = u.toolCallId;
      this.dispatchRel = rel();
      console.log(
        `${rel()} ** dispatch seen (${u.toolCallId}) — permissions now ${ALLOW_ALL ? "still open" : "DENIED"}`,
      );
    }
  }

  /**
   * The dispatching call reporting `completed` — the hand-off. Everything after
   * this is the window the probe cares about, so this is where the forced-idle
   * clock starts.
   */
  _noteDispatchSettled(msg) {
    if (this.dispatchSettledRel !== undefined || this.dispatchId === undefined)
      return;
    const u = msg.params?.update;
    if (!u || u.toolCallId !== this.dispatchId) return;
    if (u.status !== "completed" && u.status !== "failed") return;
    this.dispatchSettledRel = rel();
    this.onDispatchSettled?.();
  }

  /** One JSONL record per frame — the artifact. */
  _log(dir, msg) {
    const rec = { t: Date.now(), rel: rel(), dir, msg };
    this.frames.push(rec);
    appendFileSync(this.logPath, JSON.stringify(rec) + "\n");
    const m =
      msg.method ??
      (msg.error ? `error(id=${msg.id})` : `result(id=${msg.id})`);
    const kind = msg.params?.update?.sessionUpdate;
    const tcid = msg.params?.update?.toolCallId;
    const status = msg.params?.update?.status;
    const detail = [kind, tcid, status && `status=${status}`]
      .filter(Boolean)
      .join(" ");
    console.log(
      `${rel()} ${dir === "in" ? "<-" : "->"} ${m}${detail ? ` ${detail}` : ""}`,
    );
  }

  start() {
    this.child = spawn("npx", ["-y", AGENT], {
      env: this.env,
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
        // Not JSON-RPC — log it raw so a malformed frame can't vanish silently.
        appendFileSync(
          this.logPath,
          JSON.stringify({ t: Date.now(), rel: rel(), dir: "in", raw: line }) +
            "\n",
        );
        continue;
      }
      this._log("in", msg);
      this._noteDispatch(msg);
      this._noteDispatchSettled(msg);
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
      // Once the Task is away, refuse everything. The agent's instinct is to
      // block the turn open until the subagent reports (observed on the first
      // capture), which destroys the post-turn window this probe exists to
      // observe. Refusing is the only lever a client has.
      if (this.dispatchSeen && !ALLOW_ALL) {
        const name = msg.params?.toolCall?.name ?? "?";
        const cmd = msg.params?.toolCall?.rawInput?.command;
        this.denied.push({ rel: rel(), name, command: cmd });
        console.log(
          `${rel()} ** denying ${name}${cmd ? ` (${String(cmd).slice(0, 60)})` : ""} — post-dispatch fence`,
        );
        const reject = (msg.params?.options ?? []).find((o) =>
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
      // Auto-approve so the Task can actually dispatch. A denied tool would
      // send us down `failedControlFallback`, a different code path.
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
    // Decline everything else, exactly as Silo's DECLINED_METHOD_PREFIXES does.
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

/** session/update frames only, flattened to the inner `update`. */
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
 * The dispatching call: a `tool_call` the adapter marks as a subagent control
 * tool. Mirrors `isNativeSubagentControlUpdate` — `_meta.claudeCode.subagent`
 * or a toolName of Agent/Task — so the probe keys off the same fact an
 * implementation would.
 */
function findDispatch(ups) {
  for (const { u } of ups) {
    if (u.sessionUpdate !== "tool_call") continue;
    const cc = u._meta?.claudeCode;
    if (
      cc?.subagent === true ||
      cc?.toolName === "Agent" ||
      cc?.toolName === "Task"
    )
      return u.toolCallId;
  }
  return undefined;
}

const secs = (r) => parseFloat(String(r).replace(/[+s]/g, ""));

/** The subagent's own transcript, as `{type, role, text}` per JSONL record. */
function readSubagentOutput(file) {
  const out = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let r;
    try {
      r = JSON.parse(line);
    } catch {
      out.push({ type: "unparsed", role: undefined, text: line.slice(0, 200) });
      continue;
    }
    const m = r.message ?? {};
    const c = m.content;
    const text = Array.isArray(c)
      ? c
          .map((b) =>
            typeof b?.text === "string" ? b.text : b?.name ? `<${b.name}>` : "",
          )
          .join(" ")
          .trim()
      : typeof c === "string"
        ? c
        : "";
    out.push({ type: r.type, role: m.role, text });
  }
  return out;
}

function analyze(frames, promptEndedRel, denied = []) {
  const ups = updates(frames);
  const dispatchId = findDispatch(ups);
  const out = {
    dispatchId,
    promptEndedRel,
    frames: frames.length,
    updates: ups.length,
    deniedAfterDispatch: denied,
  };

  if (!dispatchId) {
    out.verdict =
      "INCONCLUSIVE — no dispatching subagent tool call was captured";
    return out;
  }

  // Every frame naming the dispatching call, in order. The answer lives here.
  out.onDispatch = ups
    .filter(({ u }) => u.toolCallId === dispatchId)
    .map(({ rel, u }) => ({
      rel,
      sessionUpdate: u.sessionUpdate,
      status: u.status,
      title: u.title,
      toolResponse: u._meta?.claudeCode?.toolResponse,
    }));

  // Anything at all after the prompt response — the agent-initiated turn.
  out.afterPromptEnded = ups
    .filter(({ rel }) => parseFloat(rel) > parseFloat(promptEndedRel))
    .map(({ rel, u }) => ({
      rel,
      sessionUpdate: u.sessionUpdate,
      toolCallId: u.toolCallId,
      status: u.status,
      origin: u._meta?.["_claude/origin"],
      text:
        typeof u.content?.text === "string"
          ? u.content.text.slice(0, 160)
          : undefined,
    }));

  const lateOnDispatch = out.onDispatch.filter(
    (f) => secs(f.rel) > secs(promptEndedRel),
  );
  out.secondUpdateOnDispatch = lateOnDispatch;

  // Distinct session ids — if any child session appears we were not
  // capability-off after all, and the capture is void.
  out.sessionIds = [...new Set(ups.map((u) => u.sessionId).filter(Boolean))];

  // `async_launched` carries the subagent's `agentId`. Nothing on the wire is
  // supposed to name it again; check, rather than assume.
  const launch = out.onDispatch.find(
    (f) => f.toolResponse?.status === "async_launched",
  );
  out.agentId = launch?.toolResponse?.agentId;
  out.launchedRel = launch?.rel;
  if (out.agentId) {
    const hay = JSON.stringify(
      frames.filter((f) => secs(f.rel) > secs(launch.rel) + 1),
    );
    out.agentIdNamedAgainLater = hay.includes(out.agentId);
  }

  // ---- the control ----
  // "Nothing on the wire" only means something if the subagent really finished.
  // `async_launched` hands us `outputFile` with `canReadOutputFile: true`, so
  // read it directly: it is ground truth independent of both the wire and the
  // agent's own prose, and it is the only way to tell a missing signal apart
  // from a subagent that never ran (or that a forced cancel killed).
  const outputFile = launch?.toolResponse?.outputFile;
  if (outputFile) {
    out.outputFile = outputFile;
    try {
      if (existsSync(outputFile)) {
        out.outputFileMtime = new Date(
          statSync(outputFile).mtimeMs,
        ).toISOString();
        out.subagentTranscript = readSubagentOutput(outputFile);
        // Must be the subagent's own ASSISTANT turn. A naive /FINISHED/ over the
        // whole file matches the prompt echoed back as the first `user` record,
        // which reported success on a run the cancel had killed.
        out.subagentDidFinish = out.subagentTranscript.some(
          (r) => r.role === "assistant" && /FINISHED/i.test(r.text),
        );
        out.cancelKilledSubagent = out.subagentTranscript.some((r) =>
          /\[Request interrupted by user\]/i.test(r.text),
        );
      } else {
        out.outputFileExists = false;
      }
    } catch (e) {
      out.outputFileError = String(e);
    }
  }

  // ---- who did what, by parentToolUseId ----
  // The only wire-level attribution available with no capability. A child call
  // names its dispatch; the parent's own calls name nothing.
  const calls = ups.filter(({ u }) => u.sessionUpdate === "tool_call");
  out.childCalls = calls
    .filter(({ u }) => u._meta?.claudeCode?.parentToolUseId === dispatchId)
    .map(({ rel, u }) => ({
      rel,
      toolCallId: u.toolCallId,
      tool: u._meta?.claudeCode?.toolName,
      title: u.title,
    }));
  out.parentOwnCallsAfterDispatch = calls
    .filter(
      ({ rel, u }) =>
        secs(rel) > secs(out.onDispatch[0].rel) &&
        !u._meta?.claudeCode?.parentToolUseId,
    )
    .map(({ rel, u }) => ({
      rel,
      tool: u._meta?.claudeCode?.toolName,
      title: u.title,
    }));

  // Did the parent speak again after the hand-off? That prose is where the
  // completion actually surfaces today.
  const parentText = ups.filter(
    ({ u }) =>
      u.sessionUpdate === "agent_message_chunk" &&
      !u._meta?.claudeCode?.parentToolUseId,
  );
  const settledAt = out.onDispatch.find((f) => f.status === "completed")?.rel;
  out.parentSpokeAfterHandoff = parentText
    .filter(({ rel }) => settledAt && secs(rel) > secs(settledAt) + 5)
    .map(({ rel, u }) => ({ rel, text: u.content?.text }));
  out.subagentTextForwarded = ups.some(
    ({ u }) =>
      u.sessionUpdate === "agent_message_chunk" &&
      u._meta?.claudeCode?.parentToolUseId,
  );

  // The turn did not end at the hand-off — so the agent was never idle.
  out.handoffToTurnEndSeconds = settledAt
    ? +(secs(promptEndedRel) - secs(settledAt)).toFixed(1)
    : undefined;
  out.turnStayedOpenForSubagent =
    out.childCalls.length > 0 && out.handoffToTurnEndSeconds > 5;

  if (out.cancelKilledSubagent) {
    out.verdict =
      "VOID — session/cancel propagated into the subagent (its output ends " +
      "`[Request interrupted by user]`), so it never finished and nothing could " +
      "have reported that it did. Re-run with PROBE_FORCE_IDLE_MS=0.";
    return out;
  }
  if (out.subagentDidFinish === false && out.outputFileExists !== false) {
    out.verdict =
      "INCONCLUSIVE — the subagent never reached its FINISHED reply, so there was " +
      "no completion for the wire to report. Check subagentTranscript in the report.";
    return out;
  }
  if (lateOnDispatch.length > 0) {
    const carries = lateOnDispatch
      .map((f) =>
        [
          f.status && `status=${f.status}`,
          f.toolResponse !== undefined && "toolResponse",
        ]
          .filter(Boolean)
          .join(", "),
      )
      .filter(Boolean);
    out.verdict = `YES — ${lateOnDispatch.length} update(s) on the dispatching call after the turn ended (${carries.join(" | ") || "no status, no toolResponse"})`;
  } else if (out.turnStayedOpenForSubagent) {
    out.verdict =
      `NO SECOND UPDATE ON THE DISPATCHING CALL — it settles once and is never named again. But the ` +
      `completion IS observable with no capability: the subagent's ${out.childCalls.length} tool call(s) ` +
      `streamed onto the parent session stamped parentToolUseId=${dispatchId}, session/prompt stayed open ` +
      `${out.handoffToTurnEndSeconds}s past the hand-off, and the parent spoke again ` +
      `(${out.parentSpokeAfterHandoff.length} chunk(s)) before the turn ended. The agent was never idle.`;
  } else if (out.afterPromptEnded.length > 0) {
    out.verdict =
      "NO SECOND UPDATE ON THE DISPATCHING CALL — but the agent took a later turn, so the completion " +
      "reaches the client only as prose in that turn, with nothing tying it to the dispatching row";
  } else {
    out.verdict =
      "NO — the dispatching call is never named again and nothing arrived after the turn ended. " +
      "Check childCalls: if it is empty the subagent never surfaced at all.";
  }
  return out;
}

async function main() {
  assertNoOptIn(ADVERTISED);

  const cwd = mkdtempSync(path.join(os.tmpdir(), "acp-subagent-probe-"));
  writeFileSync(path.join(cwd, "note.txt"), "subagent finish probe sandbox\n");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const logPath = path.join(cwd, `frames-${stamp}.jsonl`);

  const env = ISOLATED
    ? {
        CLAUDE_CONFIG_DIR: mkdtempSync(
          path.join(os.tmpdir(), "acp-claudecfg-"),
        ),
      }
    : {};

  console.log(`agent    ${AGENT}`);
  console.log(`cwd      ${cwd}`);
  console.log(`frames   ${logPath}`);
  console.log(
    `config   ${ISOLATED ? "isolated (expect an unauthenticated handshake only)" : "real ~/.claude"}`,
  );
  console.log(`dwell    ${DWELL_MS}ms after the turn ends`);
  console.log(`sleep    ${SLEEP_SECONDS}s inside the subagent`);
  console.log(
    `fence    ${ALLOW_ALL ? "off (PROBE_ALLOW_ALL)" : "deny permissions after dispatch"}\n`,
  );

  const c = new Conn(logPath, env).start();
  const report = {
    agent: AGENT,
    cwd,
    logPath,
    advertised: ADVERTISED,
    prompt: PROMPT,
  };

  try {
    const init = await c.request(
      "initialize",
      {
        protocolVersion: 1,
        clientCapabilities: ADVERTISED,
        clientInfo: { name: "silo-subagent-probe", version: "0.0.0" },
      },
      60000,
    );
    report.negotiated = init?.protocolVersion;
    report.agentInfo = init?.agentInfo;

    const sess = await c.request(
      "session/new",
      { cwd, mcpServers: [] },
      120000,
    );
    report.sessionId = sess?.sessionId;

    console.log(
      `\n--- prompting (turn should end in seconds; subagent sleeps ${SLEEP_SECONDS}s) ---\n`,
    );

    // Force the idle window if the agent won't yield it on its own. Armed when
    // the dispatch settles, disarmed when the turn ends.
    let forceTimer;
    if (FORCE_IDLE_MS > 0) {
      c.onDispatchSettled = () => {
        forceTimer = setTimeout(() => {
          if (c.cancelledRel !== undefined) return;
          c.cancelledRel = rel();
          console.log(
            `${rel()} ** turn still running ${FORCE_IDLE_MS}ms after the hand-off — session/cancel to force the idle window`,
          );
          c._send({
            jsonrpc: "2.0",
            method: "session/cancel",
            params: { sessionId: sess.sessionId },
          });
        }, FORCE_IDLE_MS);
      };
    }

    const res = await c.request(
      "session/prompt",
      { sessionId: sess.sessionId, prompt: [{ type: "text", text: PROMPT }] },
      300000,
    );
    clearTimeout(forceTimer);
    report.stopReason = res?.stopReason;
    const promptEndedRel = rel();
    report.promptEndedRel = promptEndedRel;

    console.log(
      `\n--- turn ended at ${promptEndedRel} (stopReason=${report.stopReason}) ---`,
    );
    console.log(
      `--- dwelling ${DWELL_MS}ms, logging anything that still arrives ---\n`,
    );
    await new Promise((r) => setTimeout(r, DWELL_MS));

    report.dispatchSettledRel = c.dispatchSettledRel;
    report.cancelledRel = c.cancelledRel;
    report.result = analyze(c.frames, promptEndedRel, c.denied);
    report.result.forcedIdleByCancel = c.cancelledRel !== undefined;
  } catch (e) {
    report.error = String(e);
    // Still analyze: a timeout mid-capture can be the most interesting case.
    report.result = analyze(c.frames, report.promptEndedRel ?? "+0s", c.denied);
  } finally {
    c.kill();
  }

  const reportPath = path.join(cwd, `report-${stamp}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`\n================ VERDICT ================`);
  console.log(report.result?.verdict ?? "no verdict");
  console.log(
    `\ndispatching toolCallId: ${report.result?.dispatchId ?? "(none found)"}`,
  );
  console.log(
    `session ids seen:       ${JSON.stringify(report.result?.sessionIds ?? [])}`,
  );
  console.log(`\nframes naming the dispatching call:`);
  console.log(JSON.stringify(report.result?.onDispatch ?? [], null, 2));
  console.log(`\neverything after the turn ended:`);
  console.log(JSON.stringify(report.result?.afterPromptEnded ?? [], null, 2));
  console.log(`\nattribution (capability-off, via parentToolUseId):`);
  console.log(
    `  subagent tool calls on the parent session: ${report.result?.childCalls?.length ?? 0}`,
  );
  console.log(
    `  parent's own calls after dispatch:         ${report.result?.parentOwnCallsAfterDispatch?.length ?? 0}`,
  );
  console.log(
    `  subagent prose forwarded:                  ${report.result?.subagentTextForwarded}`,
  );
  console.log(
    `  hand-off -> turn end:                      ${report.result?.handoffToTurnEndSeconds}s`,
  );
  console.log(
    `  parent spoke again after hand-off:         ${JSON.stringify((report.result?.parentSpokeAfterHandoff ?? []).map((p) => p.text).join(""))}`,
  );
  console.log(`\nsubagent output file (the control):`);
  console.log(`  path     ${report.result?.outputFile ?? "(none captured)"}`);
  console.log(
    `  finished ${report.result?.subagentDidFinish === true ? "YES — output contains FINISHED" : report.result?.subagentDidFinish === false ? "NO — output exists but has no FINISHED" : "unknown"}`,
  );
  console.log(
    `  tail     ${JSON.stringify(report.result?.outputFileTail ?? null)}`,
  );
  if (report.result?.forcedIdleByCancel) {
    console.log(
      `\nNOTE: the idle window was forced with session/cancel at ${report.cancelledRel}.`,
    );
  }
  console.log(`\nframes   ${logPath}`);
  console.log(`report   ${reportPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
