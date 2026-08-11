import { useEffect, useMemo, useState } from "react";

export type BackdropVariant = "chat-typing" | "silo-rings" | "graph-network";

export const BACKDROP_VARIANTS: {
  id: BackdropVariant;
  label: string;
}[] = [
  { id: "chat-typing", label: "1 · Agent chat" },
  { id: "silo-rings", label: "2 · Silo from above" },
  { id: "graph-network", label: "3 · Network" },
];

const AMBIENT_WORDS = [
  "AGENT",
  "BRANCH",
  "TERMINAL",
  "WORKSPACE",
  "COMMIT",
  "PROJECT",
  "PANEL",
  "EXTENSION",
  "DOCK",
  "LAYOUT",
  "SESSION",
  "GIT",
  "AGENT",
  "WORKSPACE",
  "BRANCH",
  "COMMIT",
];

// Deterministic PRNG so the scatter layout is stable across re-renders
// instead of reshuffling (and jumping) on every mount.
function mulberry32(seed: number) {
  let a = seed;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A long repeated-word blob used to texture-fill a clipped shape, mirroring
 * how tterm.sh builds its mountain: real words packed tight enough that they
 * read as a fine noise texture rather than individual labels. */
const FILL_TEXT = Array.from({ length: 900 }, () => "SILO").join(" ");

function AsciiFill({ className }: { className?: string }) {
  return (
    <div className={`ascii-fill ${className ?? ""}`}>
      <div className="ascii-fill-text">{FILL_TEXT}</div>
    </div>
  );
}

function AmbientScatter({ seed, count }: { seed: number; count: number }) {
  const words = useMemo(() => {
    const rand = mulberry32(seed);
    return Array.from({ length: count }, (_, i) => {
      const word = AMBIENT_WORDS[Math.floor(rand() * AMBIENT_WORDS.length)];
      return {
        key: `${word}-${i}`,
        word,
        left: 4 + rand() * 92,
        top: 4 + rand() * 92,
        rotate: (rand() - 0.5) * 8,
        duration: 7 + rand() * 8,
        delay: -rand() * 12,
      };
    });
  }, [seed, count]);

  return (
    <div className="ascii-scatter" aria-hidden="true">
      {words.map((w) => (
        <span
          key={w.key}
          className="ascii-scatter-word"
          style={{
            left: `${w.left}%`,
            top: `${w.top}%`,
            transform: `rotate(${w.rotate}deg)`,
            animationDuration: `${w.duration}s`,
            animationDelay: `${w.delay}s`,
          }}
        >
          {w.word}
        </span>
      ))}
    </div>
  );
}

/** A faint, looping transcript of someone driving a coding agent — modeled
 * on this app's own demo transcripts (see workspaces/*\/terminals/*.json):
 * a typed request, tool calls with their result line, an inline diff, an
 * occasional subagent fan-out, and a success line closing each turn. Rows
 * type out character by character, hold briefly, then scroll into the
 * committed log. Purely decorative (aria-hidden) and never literally the
 * same text as the real demo below it, just the rhythm of one. */
type ChatRowStyle =
  | "command"
  | "prose"
  | "tool"
  | "tool-detail"
  | "diff-add"
  | "diff-del"
  | "diff-ctx"
  | "subagent-lead"
  | "subagent-row"
  | "success";

interface ChatRow {
  style: ChatRowStyle;
  text: string;
}

const CHAT_ROWS: ChatRow[] = [
  {
    style: "command",
    text: "› add rate limiting middleware to the public API",
  },
  {
    style: "prose",
    text: "  checking whether request counts are already tracked",
  },
  { style: "tool", text: "Read(server.ts)" },
  { style: "tool-detail", text: "  └ 142 lines" },
  { style: "tool", text: "Grep(rateLimit)" },
  { style: "tool-detail", text: "  └ no matches" },
  {
    style: "prose",
    text: "  no existing limiter — adding a sliding-window one",
  },
  { style: "tool", text: "Write(rate-limit.ts)" },
  { style: "tool-detail", text: "  └ +51 lines" },
  { style: "tool", text: "Update(server.ts)" },
  { style: "diff-ctx", text: "    app.use(cors());" },
  {
    style: "diff-add",
    text: "  + app.use(rateLimit({ windowMs: 60_000, max: 120 }));",
  },
  { style: "diff-ctx", text: "    app.use(express.json());" },
  { style: "tool", text: "Bash(npm test rate-limit)" },
  { style: "tool-detail", text: "  └ 3 passed" },
  { style: "success", text: "✓ done — 2 files changed, tests passing" },

  { style: "command", text: "› the tests are flaky on CI, can you look?" },
  { style: "tool", text: "Bash(npm test --runInBand)" },
  {
    style: "tool-detail",
    text: "  └ reproduced — race condition in setupMocks()",
  },
  { style: "tool", text: "Update(setup.ts)" },
  { style: "diff-del", text: "  - teardown();" },
  { style: "diff-add", text: "  + await teardown();" },
  { style: "success", text: "✓ fixed — CI green on 3 consecutive runs" },

  { style: "command", text: "› why is the api workspace failing to build?" },
  { style: "subagent-lead", text: "● Running 2 Explore agents…" },
  { style: "subagent-row", text: "  ├─ Explore build config · 14 tool uses" },
  {
    style: "subagent-row",
    text: "  └─ Explore recent refactors · 9 tool uses",
  },
  { style: "prose", text: "  rate-limit.ts imports a type that moved" },
  { style: "tool", text: "Update(rate-limit.ts)" },
  { style: "diff-del", text: "  - import { Options } from './server';" },
  { style: "diff-add", text: "  + import { Options } from './types';" },
  { style: "success", text: "✓ fixed the import — build is green" },

  { style: "command", text: "› cut a release branch from main" },
  { style: "tool", text: "Bash(git checkout -b release/1.4.0)" },
  { style: "tool-detail", text: "  └ created at a91f2c" },
  { style: "tool", text: "Bash(git push -u origin release/1.4.0)" },
  { style: "success", text: "✓ pushed — opening the PR now" },
];

// Agent output streams in fast; a human typing a request is slower and
// less even — jitter both, but center the human rows much higher.
const CHAT_PAUSE_AFTER: Record<ChatRowStyle, number> = {
  command: 1400,
  prose: 900,
  tool: 650,
  "tool-detail": 750,
  "diff-add": 420,
  "diff-del": 420,
  "diff-ctx": 420,
  "subagent-lead": 850,
  "subagent-row": 750,
  success: 3000,
};
// Bottom-anchored (see .ascii-chat), so more rows means the top of the log
// grows further up the hero, toward the nav divider.
const CHAT_MAX_VISIBLE = 20;
// So the backdrop never renders empty on first paint, this many rows start
// already committed — the typewriter picks up live from the row after.
const CHAT_PRESEEDED_ROWS = 17;

/** Advances a script one character at a time, committing finished rows
 * into a capped, scrolling log — a tiny typewriter state machine. */
function useTypedChat(rows: ChatRow[]) {
  const [committed, setCommitted] = useState<ChatRow[]>(() =>
    rows.slice(0, CHAT_PRESEEDED_ROWS),
  );
  const [rowIndex, setRowIndex] = useState(CHAT_PRESEEDED_ROWS);
  const [charIndex, setCharIndex] = useState(0);

  useEffect(() => {
    const row = rows[rowIndex];
    const isHuman = row.style === "command";
    const rowDone = charIndex >= row.text.length;
    const tick = isHuman ? 95 + Math.random() * 65 : 42 + Math.random() * 30;
    const delay = rowDone ? CHAT_PAUSE_AFTER[row.style] : tick;
    const timer = setTimeout(() => {
      if (rowDone) {
        setCommitted((prev) => [...prev, row].slice(-CHAT_MAX_VISIBLE));
        setRowIndex((i) => (i + 1) % rows.length);
        setCharIndex(0);
      } else {
        setCharIndex((c) => c + 1);
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [rows, rowIndex, charIndex]);

  return { committed, current: rows[rowIndex], charIndex };
}

function ChatBackdrop() {
  const { committed, current, charIndex } = useTypedChat(CHAT_ROWS);

  return (
    <div className="ascii-chat" aria-hidden="true">
      {committed.map((row, i) => (
        <div key={i} className={`ascii-chat-row ascii-chat-${row.style}`}>
          {row.text}
        </div>
      ))}
      <div className={`ascii-chat-row ascii-chat-${current.style}`}>
        {current.text.slice(0, charIndex)}
        <span className="ascii-chat-cursor" />
      </div>
    </div>
  );
}

/** Node-graph backdrop: a scatter of points connected to their nearest
 * neighbors, with a few "signal" dots gliding along edges — an abstract
 * stand-in for workspaces wired together with agents moving between them,
 * no silo imagery involved. */
function buildGraph(seed: number, count: number) {
  const rand = mulberry32(seed);
  const nodes = Array.from({ length: count }, () => ({
    x: 6 + rand() * 88,
    y: 6 + rand() * 88,
  }));

  const edges: [number, number][] = [];
  const seen = new Set<string>();
  nodes.forEach((n, i) => {
    const nearest = nodes
      .map((m, j) => ({
        j,
        d: i === j ? Infinity : Math.hypot(n.x - m.x, n.y - m.y),
      }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 2);
    for (const { j } of nearest) {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (!seen.has(key)) {
        seen.add(key);
        edges.push(i < j ? [i, j] : [j, i]);
      }
    }
  });

  return { nodes, edges };
}

function GraphBackdrop() {
  const { nodes, edges } = useMemo(() => buildGraph(4, 15), []);
  const pulseEdges = useMemo(() => edges.slice(0, 5), [edges]);

  return (
    <div className="ascii-graph" aria-hidden="true">
      <svg
        className="ascii-graph-svg"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {edges.map(([a, b], i) => (
          <line
            key={i}
            x1={nodes[a].x}
            y1={nodes[a].y}
            x2={nodes[b].x}
            y2={nodes[b].y}
            className="ascii-graph-edge"
          />
        ))}
        {pulseEdges.map(([a, b], i) => (
          <circle key={`pulse-${i}`} r={0.55} className="ascii-graph-pulse">
            <animateMotion
              dur={`${11 + i * 3.4}s`}
              begin={`${-i * 2.6}s`}
              repeatCount="indefinite"
              path={`M${nodes[a].x},${nodes[a].y} L${nodes[b].x},${nodes[b].y}`}
            />
          </circle>
        ))}
      </svg>
      {nodes.map((n, i) => (
        <span
          key={i}
          className="ascii-graph-node"
          style={{
            left: `${n.x}%`,
            top: `${n.y}%`,
            animationDelay: `${-(i * 1.7) % 9}s`,
          }}
        />
      ))}
    </div>
  );
}

export function AsciiBackdrop({ variant }: { variant: BackdropVariant }) {
  if (variant === "chat-typing") {
    return (
      <div className="ascii-backdrop ascii-backdrop-chat" aria-hidden="true">
        <ChatBackdrop />
      </div>
    );
  }

  if (variant === "graph-network") {
    return (
      <div className="ascii-backdrop ascii-backdrop-graph" aria-hidden="true">
        <GraphBackdrop />
      </div>
    );
  }

  return (
    <div className="ascii-backdrop ascii-backdrop-rings" aria-hidden="true">
      <AmbientScatter seed={3} count={16} />
      <div className="ascii-shape ascii-shape-rings">
        <div className="ascii-rings-spin">
          <AsciiFill className="ascii-rings-mask" />
        </div>
      </div>
    </div>
  );
}
