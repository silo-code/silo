#!/usr/bin/env node
// Generate a synthetic Chat transcript journal (RFC 0042 JSONL) for load
// testing RFC 0050. Shapes are modelled on a real 28 MB session measured
// 2026-09-16: 48 user turns, 625 tool calls, 3,014 agent message chunks,
// 2,481 tool_call_updates, and 26 individual lines over 200 KB.
//
//   node gen-journal.mjs --turns 48 --out /path/to/<sessionId>.jsonl
//
// Deterministic for a given --seed, so a before/after comparison measures the
// change and not a different transcript.

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith("--")) acc.push([a.slice(2), arr[i + 1]]);
    return acc;
  }, []),
);

const TURNS = Number(args.turns ?? 48);
const OUT = args.out;
const SCALE = Number(args.scale ?? 1); // multiplies per-turn tool/chunk counts
if (!OUT) {
  console.error("usage: gen-journal.mjs --turns N --out <file> [--scale S]");
  process.exit(1);
}

// Deterministic PRNG (mulberry32) — same seed, same transcript.
let s = Number(args.seed ?? 20260916) >>> 0;
const rnd = () => {
  s = (s + 0x6d2b79f5) >>> 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
const between = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));

const WORDS =
  `transcript panel workspace dock session journal replay anchor scroll offset entry turn
   render layout paint host extension boundary identity keying window spacer estimate cache
   measure restore clamp retry frame commit reconcile fold chunk stream update tool diff`
    .split(/\s+/)
    .filter(Boolean);
const sentence = (n = between(8, 22)) =>
  Array.from({ length: n }, () => pick(WORDS)).join(" ") + ".";
const para = (n = between(2, 5)) =>
  Array.from({ length: n }, () => sentence()).join(" ");

const FILES = [
  "packages/extension-host/src/panels/WorkspaceDock.tsx",
  "packages/extensions-silo/src/agents-chat-panel/AcpChatPanel.tsx",
  "packages/extensions-silo/src/agents-chat-panel/transcript-model.ts",
  "packages/extensions-silo/src/agents-chat-panel/scroll.ts",
  "packages/sdk/src/agents-service.ts",
];

const codeLines = (n) =>
  Array.from(
    { length: n },
    (_, i) => `  const ${pick(WORDS)}${i} = ${pick(WORDS)}(${i});`,
  ).join("\n");

const lines = [];
const put = (o) => lines.push(JSON.stringify(o));

let toolSeq = 0;
for (let turn = 0; turn < TURNS; turn++) {
  put({ kind: "user_message_chunk", text: `${sentence(between(6, 18))}` });

  const msgId = `m${turn}`;
  // Agent prose, streamed as several chunks that the fold merges into one entry.
  const chunks = Math.max(2, Math.round(between(40, 80) * SCALE));
  for (let c = 0; c < chunks; c++) {
    put({
      kind: "agent_message_chunk",
      messageId: msgId,
      text: (c === 0 ? `## ${pick(WORDS)}\n\n` : "") + para() + "\n\n",
    });
  }

  const tools = Math.max(1, Math.round(between(8, 18) * SCALE));
  for (let t = 0; t < tools; t++) {
    const id = `tool-${toolSeq++}`;
    const path = pick(FILES);
    // Most calls are modest; roughly 1 in 25 is a monster, mirroring the 26
    // >200 KB lines in the measured session.
    const huge = rnd() < 0.04;
    const n = huge ? between(4000, 9000) : between(20, 220);
    const isDiff = rnd() < 0.55;

    const content = isDiff
      ? [
          {
            type: "diff",
            path,
            oldText: codeLines(n),
            newText: codeLines(n + between(1, 12)),
          },
        ]
      : [
          {
            type: "content",
            content: { type: "text", text: codeLines(n) },
          },
        ];

    put({
      kind: "tool_call",
      toolCall: {
        toolCallId: id,
        title: `${isDiff ? "Edit" : "Read"} ${path.split("/").pop()}`,
        kind: isDiff ? "edit" : "read",
        status: "pending",
        locations: [{ path, line: between(1, 400) }],
        rawInput: { file_path: path, limit: n },
        content,
      },
    });
    // Real agents send several updates per call (status ladder, late content),
    // and each one costs an O(n) findIndex over the whole entry list today.
    const updates = between(2, 5);
    for (let u = 0; u < updates; u++) {
      put({
        kind: "tool_call_update",
        toolCall: {
          toolCallId: id,
          status: u === updates - 1 ? "completed" : "in_progress",
        },
      });
    }
  }
}

const body = lines.join("\n") + "\n";
const { writeFileSync, mkdirSync } = await import("node:fs");
const { dirname } = await import("node:path");
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, body);

const bytes = Buffer.byteLength(body);
const big = lines.filter((l) => Buffer.byteLength(l) > 200_000).length;
console.log(
  `wrote ${OUT}\n  ${lines.length} updates, ${(bytes / 1048576).toFixed(1)} MB, ` +
    `${TURNS} turns, ${toolSeq} tool calls, ${big} lines >200KB`,
);
