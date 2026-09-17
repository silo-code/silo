// Shared synthetic-transcript generator for the RFC 0050 load-test rig.
//
// Two consumers, same shapes:
//   - gen-journal.mjs    writes these to a journal file (needs the app stopped)
//   - fake-acp-agent.mjs streams these as live `session/update`s (no restart)
//
// Modelled on a real 28 MB session measured 2026-09-16: 48 user turns, 625 tool
// calls, 3,014 agent message chunks, 2,481 tool-call updates, 26 lines >200 KB.
// Deterministic for a given seed, so before/after comparisons measure the change
// and not a different transcript.

export function makeUpdates({
  turns = 48,
  scale = 1,
  seed = 20260916,
  // Streaming a few thousand chunk updates costs one React commit each. The
  // journal path wants them (it is what a real agent produced); the live path
  // collapses each turn's prose into one update, since DOM weight comes from
  // tool output, not from how finely the prose was sliced.
  compactChunks = false,
} = {}) {
  let s = seed >>> 0;
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

  /**
   * An Edit's `oldText`/`newText`, shaped like a real one.
   *
   * This used to be `codeLines(n)` vs `codeLines(n + 1..12)` — two
   * *independently random* blocks sharing no common prefix or suffix. That
   * defeats `diffLines`' prefix/suffix trim, so every line became an add or a
   * delete and the rig emitted ~568 rendered rows per diff. Real Silo journals
   * emit ~19. The rig overstated transcript DOM by ~20× per turn and sent the
   * first investigation pass after the wrong lever entirely — see FINDINGS.md
   * "Corrections".
   *
   * Measured shapes across three real journals (2026-09-17):
   *  - most Edits send a small *snippet*, not a whole file: oldText median 6
   *    lines, p90 13-18, max 33
   *  - new-file writes are `oldText: ""` with 100-160 new lines
   *  - occasional whole-file rewrites (old 600-1300 lines) still render only
   *    ~165 rows, because the trim removes the unchanged head and tail
   */
  const editTexts = () => {
    const roll = rnd();
    if (roll < 0.2) {
      // New-file write: no old side at all, so every line renders.
      return { oldText: "", newText: codeLines(between(40, 120)) };
    }
    // Whole-file rewrites happen, but the agent still replaces one contiguous
    // region — so the trim strips the unchanged head and tail and only a small
    // hunk renders. Scattering the edits instead would leave the whole interior
    // in the mid region and blow the row count up by ~100x, which is exactly
    // the mistake the old generator made by accident.
    const whole = roll > 0.9;
    const lines = codeLines(whole ? between(600, 1300) : between(3, 20)).split(
      "\n",
    );
    const next = lines.slice();
    const at = between(0, Math.max(0, next.length - 1));
    next.splice(
      at,
      between(0, 2),
      ...Array.from(
        { length: between(1, 3) },
        () => `  const ${pick(WORDS)} = ${pick(WORDS)}();`,
      ),
    );
    return { oldText: lines.join("\n"), newText: next.join("\n") };
  };

  const out = [];
  let toolSeq = 0;

  for (let turn = 0; turn < turns; turn++) {
    out.push({ kind: "user_message_chunk", text: sentence(between(6, 18)) });

    const msgId = `m${turn}`;
    const chunks = compactChunks
      ? 1
      : Math.max(2, Math.round(between(40, 80) * scale));
    for (let c = 0; c < chunks; c++) {
      const body = compactChunks
        ? Array.from({ length: between(40, 80) }, () => para()).join("\n\n")
        : para();
      out.push({
        kind: "agent_message_chunk",
        messageId: msgId,
        text: (c === 0 ? `## ${pick(WORDS)}\n\n` : "") + body + "\n\n",
      });
    }

    const tools = Math.max(1, Math.round(between(8, 18) * scale));
    for (let t = 0; t < tools; t++) {
      const id = `tool-${toolSeq++}`;
      const path = pick(FILES);
      // ~1 in 25 is a monster, mirroring the 26 >200 KB lines measured.
      const huge = rnd() < 0.04;
      const n = huge ? between(4000, 9000) : between(20, 220);
      const isDiff = rnd() < 0.55;

      const content = isDiff
        ? [{ type: "diff", path, ...editTexts() }]
        : [{ type: "content", content: { type: "text", text: codeLines(n) } }];

      out.push({
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
      // Real agents send several updates per call; each costs an O(n)
      // findIndex over the whole entry list today (RFC 0050).
      const updates = compactChunks ? 1 : between(2, 5);
      for (let u = 0; u < updates; u++) {
        out.push({
          kind: "tool_call_update",
          toolCall: {
            toolCallId: id,
            status: u === updates - 1 ? "completed" : "in_progress",
          },
        });
      }
    }
  }
  return out;
}
