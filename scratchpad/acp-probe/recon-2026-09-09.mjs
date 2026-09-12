// ACP recon — the 5 items from docs/acp-process-ownership.md §4.6
// Speaks newline-delimited JSON-RPC over a child's stdio, no deps.
import { spawn } from "node:child_process";
import {
  mkdtempSync,
  writeFileSync,
  readdirSync,
  statSync,
  existsSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

const AGENTS = {
  claude: {
    cmd: "npx",
    args: ["-y", "@agentclientprotocol/claude-agent-acp@0.75.1"],
  },
  "claude-latest": {
    cmd: "npx",
    args: ["-y", "@agentclientprotocol/claude-agent-acp@latest"],
  },
  cursor: { cmd: "cursor-agent", args: ["acp"] },
  opencode: { cmd: "opencode", args: ["acp"] },
  codex: { cmd: "npx", args: ["-y", "@agentclientprotocol/codex-acp@1.10.0"] },
  pi: { cmd: "npx", args: ["-y", "pi-acp@0.0.33"] },
};
const REAL_CONFIG = !!process.env.ACP_REAL_CONFIG;

const only = process.argv[2] ? process.argv[2].split(",") : Object.keys(AGENTS);
const FACT = "the passphrase is BANANA-4291-KIWI";
const RECALL_Q =
  "What exactly is the passphrase I told you? Reply with only the passphrase.";

function nowMs() {
  return Date.now();
}

class Conn {
  constructor(name, spec, env) {
    this.name = name;
    this.spec = spec;
    this.env = { ...process.env, ...env };
    this.buf = "";
    this.nextId = 1;
    this.pending = new Map();
    this.updates = []; // session/update params, in order
    this.serverReqs = []; // agent->client requests seen
    this.onUpdate = null;
    this.capturing = false;
  }
  start() {
    this.child = spawn(this.spec.cmd, this.spec.args, {
      env: this.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child.stdout.on("data", (d) => this._onData(d));
    this.child.stderr.on(
      "data",
      (d) =>
        process.env.ACP_STDERR &&
        process.stderr.write(`[${this.name} stderr] ${d}`),
    );
    this.exited = new Promise((res) =>
      this.child.on("exit", (c, s) => res({ code: c, signal: s })),
    );
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
        continue;
      }
      this._dispatch(msg);
    }
  }
  _dispatch(msg) {
    if (msg.method && msg.id !== undefined) {
      // agent -> client request
      this.serverReqs.push({
        t: nowMs(),
        method: msg.method,
        params: msg.params,
      });
      this._answerServerReq(msg);
      return;
    }
    if (msg.method === "session/update") {
      if (this.capturing) this.updates.push({ t: nowMs(), params: msg.params });
      if (this.onUpdate) this.onUpdate(msg.params);
      return;
    }
    if (msg.id !== undefined && this.pending.has(msg.id)) {
      const { res, rej } = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error)
        rej(
          Object.assign(new Error(msg.error.message), {
            code: msg.error.code,
            data: msg.error.data,
          }),
        );
      else res(msg.result);
    }
  }
  _answerServerReq(msg) {
    const { method, id } = msg;
    if (method === "session/request_permission") {
      // auto-approve so a turn can complete
      const opts = msg.params?.options ?? [];
      const allow =
        opts.find((o) =>
          /allow|approve|yes/i.test(o.name || o.optionId || ""),
        ) ?? opts[0];
      this._send({
        jsonrpc: "2.0",
        id,
        result: { outcome: { outcome: "selected", optionId: allow?.optionId } },
      });
      return;
    }
    // decline everything else (fs/*, terminal/*, vendor)
    this._send({
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: `method not supported: ${method}` },
    });
  }
  _send(obj) {
    this.child.stdin.write(JSON.stringify(obj) + "\n");
  }
  request(method, params, timeoutMs = 120000) {
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
  notify(method, params) {
    this._send({ jsonrpc: "2.0", method, params });
  }
  async initialize(protocolVersion = 1) {
    return this.request(
      "initialize",
      {
        protocolVersion,
        clientCapabilities: {
          fs: { readTextFile: false, writeTextFile: false },
          terminal: false,
        },
        clientInfo: { name: "silo-recon", version: "0.0.0" },
      },
      30000,
    );
  }
  kill() {
    try {
      this.child.kill("SIGKILL");
    } catch {}
  }
}

function summarizeUpdates(updates) {
  const kinds = {};
  const text = [];
  for (const u of updates) {
    const upd = u.params?.update ?? u.params;
    const k = upd?.sessionUpdate ?? upd?.kind ?? "?";
    kinds[k] = (kinds[k] || 0) + 1;
    const c = upd?.content;
    const t = typeof c === "string" ? c : (c?.text ?? upd?.text);
    if (t) text.push(`  ${k}: ${JSON.stringify(String(t).slice(0, 200))}`);
  }
  return { count: updates.length, kinds, text };
}

async function dirSnapshot(root) {
  const out = {};
  function walk(d, depth) {
    if (depth > 3 || !existsSync(d)) return;
    let entries;
    try {
      entries = readdirSync(d);
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(d, e);
      let s;
      try {
        s = statSync(p);
      } catch {
        continue;
      }
      if (s.isDirectory()) walk(p, depth + 1);
      else out[p] = s.mtimeMs;
    }
  }
  walk(root, 0);
  return out;
}

async function probeAgent(name) {
  const spec = AGENTS[name];
  const report = { name, spec: `${spec.cmd} ${spec.args.join(" ")}` };
  const cwd = mkdtempSync(path.join(os.tmpdir(), `acp-recon-${name}-`));
  writeFileSync(path.join(cwd, "note.txt"), "recon sandbox\n");
  const configDir =
    name.startsWith("claude") && !REAL_CONFIG
      ? mkdtempSync(path.join(os.tmpdir(), "acp-claudecfg-"))
      : undefined;
  const env = configDir ? { CLAUDE_CONFIG_DIR: configDir } : {};

  // ---- #5 + #2: initialize, full capability dump ----
  let c = new Conn(name, spec, env).start();
  let init;
  try {
    init = await c.initialize(1);
    report.initialize = {
      protocolVersion: init?.protocolVersion,
      agentInfo: init?.agentInfo,
      agentCapabilities: init?.agentCapabilities,
      authMethods: init?.authMethods,
    };
  } catch (e) {
    report.initialize = { error: String(e) };
    c.kill();
    return report;
  }

  // try protocolVersion:2 in a fresh process
  try {
    const c2 = new Conn(name, spec, env).start();
    const i2 = await c2.initialize(2);
    report.protocolV2 = { accepted: true, negotiated: i2?.protocolVersion };
    c2.kill();
  } catch (e) {
    report.protocolV2 = { accepted: false, error: String(e).slice(0, 120) };
  }

  // ---- new session ----
  let sess;
  try {
    sess = await c.request("session/new", { cwd, mcpServers: [] }, 60000);
    report.sessionNew = {
      ok: true,
      sessionId: sess?.sessionId,
      hasConfigOptions: !!sess?.configOptions,
      keys: Object.keys(sess || {}),
    };
  } catch (e) {
    report.sessionNew = { ok: false, error: String(e).slice(0, 200) };
    c.kill();
    return report;
  }
  const sessionId = sess.sessionId;

  // ---- #2: session/list, session/close probes ----
  for (const m of ["session/list", "session/close"]) {
    try {
      const r = await c.request(
        m,
        m === "session/close" ? { sessionId } : {},
        15000,
      );
      report[m.replace("/", "_")] = {
        ok: true,
        result: JSON.stringify(r).slice(0, 300),
      };
    } catch (e) {
      report[m.replace("/", "_")] = {
        ok: false,
        code: e.code,
        error: String(e.message).slice(0, 120),
        data: e.data,
      };
    }
  }

  // session/close may have ended the session; make a fresh one for the replay test
  let liveConn = c;
  if (report["session_close"]?.ok) {
    c.kill();
    liveConn = new Conn(name, spec, env).start();
    await liveConn.initialize(1);
    sess = await liveConn.request(
      "session/new",
      { cwd, mcpServers: [] },
      60000,
    );
  }
  const sid = sess.sessionId;

  // ---- #1: Spike D — plant a fact, kill, respawn, session/load, ASSERT REPLAY CONTENT ----
  try {
    await liveConn.request(
      "session/prompt",
      {
        sessionId: sid,
        prompt: [
          {
            type: "text",
            text: `Please remember this: ${FACT}. Just acknowledge briefly.`,
          },
        ],
      },
      120000,
    );
  } catch (e) {
    report.spikeD = { error: `plant failed: ${String(e).slice(0, 150)}` };
    liveConn.kill();
    return report;
  }

  // #4: session/load on a STILL-LIVE session (before the kill)
  try {
    const r = await liveConn.request(
      "session/load",
      { sessionId: sid, cwd, mcpServers: [] },
      20000,
    );
    report.loadOnLiveSession = {
      ok: true,
      result: JSON.stringify(r).slice(0, 200),
    };
  } catch (e) {
    report.loadOnLiveSession = {
      ok: false,
      code: e.code,
      error: String(e.message).slice(0, 150),
    };
  }

  const storeRoot = configDir
    ? path.join(configDir, "projects")
    : name.startsWith("claude")
      ? path.join(os.homedir(), ".claude", "projects")
      : null;
  const snapBefore = storeRoot ? await dirSnapshot(storeRoot) : {};
  liveConn.kill();
  await liveConn.exited;

  // respawn + load
  const c3 = new Conn(name, spec, env).start();
  await c3.initialize(1);
  c3.capturing = true;
  let loadErr = null,
    loadResult = null;
  try {
    loadResult = await c3.request(
      "session/load",
      { sessionId: sid, cwd, mcpServers: [] },
      60000,
    );
  } catch (e) {
    loadErr = e;
  }
  await new Promise((r) => setTimeout(r, 1500)); // let trailing updates land
  const replay = summarizeUpdates(c3.updates);
  const contentJoined = replay.text.join(" ");
  report.spikeD = {
    loadAdvertised: !!init?.agentCapabilities?.loadSession,
    loadOk: !loadErr,
    loadError: loadErr ? String(loadErr.message).slice(0, 150) : undefined,
    loadResultKeys: loadResult ? Object.keys(loadResult) : undefined,
    replayCount: replay.count,
    replayKinds: replay.kinds,
    factInReplay: contentJoined.includes("BANANA-4291-KIWI"),
    sampleContent: replay.text.slice(0, 6),
  };

  // recall test: ask for the fact back on the resumed session
  if (!loadErr) {
    c3.capturing = false;
    const answerChunks = [];
    c3.onUpdate = (p) => {
      const upd = p?.update ?? p;
      const t =
        upd?.content?.text ??
        (typeof upd?.content === "string" ? upd.content : upd?.text);
      if (
        t &&
        /message_chunk|agent_message|assistant/i.test(
          upd?.sessionUpdate ?? upd?.kind ?? "",
        )
      )
        answerChunks.push(t);
    };
    try {
      await c3.request(
        "session/prompt",
        { sessionId: sid, prompt: [{ type: "text", text: RECALL_Q }] },
        120000,
      );
      const ans = answerChunks.join("");
      report.spikeD.recalledFact = ans.includes("BANANA-4291-KIWI");
      report.spikeD.recallAnswer = ans.slice(0, 200);
    } catch (e) {
      report.spikeD.recallError = String(e).slice(0, 150);
    }
  }

  // #3: $TMPDIR / config-dir dependence — what did the agent write, and where?
  if (storeRoot) {
    const snapAfter = await dirSnapshot(storeRoot);
    const changed = Object.keys(snapAfter).filter(
      (k) => snapBefore[k] !== snapAfter[k],
    );
    report.sessionStore = {
      storeRoot,
      inTmp: storeRoot.startsWith(os.tmpdir()),
      filesTouched: changed.map((p) => p.replace(storeRoot, "")).slice(0, 15),
      sessionFileForThisId: changed
        .filter((p) => p.includes(sid))
        .map((p) => p.replace(storeRoot, "")),
    };
  } else {
    report.sessionStore = {
      note: "unknown store location for this agent; inspect manually",
    };
  }

  c3.kill();
  return report;
}

const results = [];
for (const name of only) {
  if (!AGENTS[name]) {
    console.error(`unknown agent ${name}`);
    continue;
  }
  process.stderr.write(`\n=== probing ${name} ===\n`);
  try {
    results.push(await probeAgent(name));
  } catch (e) {
    results.push({ name, fatal: String(e.stack || e) });
  }
}
console.log(JSON.stringify(results, null, 2));
