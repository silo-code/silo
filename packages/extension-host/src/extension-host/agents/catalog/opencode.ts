import { detectOpencodeOutput } from "../agent-osc-detectors";
import type { AgentDefinition } from "../agent-catalog";

/**
 * OpenCode's catalog entry. Plain data, and needs none of `agent-catalog.ts`'s
 * shared hook constants (resume is `none`) — a plain exported object, same as
 * `grok.ts`. Split out in ADR 0042 phase 7 purely for `agent-catalog.ts`
 * navigability.
 */
export const opencodeAgent: AgentDefinition = {
  id: "opencode",
  displayName: "OpenCode",
  // Native compiled binary — argv0 is `opencode` directly, no node-wrapping.
  leaderNames: ["opencode"],
  // Its async session-naming rename (see `contract` below) leads with this —
  // redundant once the tab shows OpenCode's icon.
  titleIdentityPrefix: "OC | ",
  // No OSC-based signal exists at all (see contract) — activity comes only
  // from the raw-output bar-spinner fallback, same shape as Cursor Agent's.
  activityDetectors: [],
  outputDetector: detectOpencodeOutput,
  // Tier 3 (exact resume) is deliberately deferred (ADR 0043): no
  // pid-bearing session store exists to read passively — `opencode session
  // list` has no pid column — and the plugin-based mechanism that could
  // supply one is unbuilt and unverified. Honest default, not a
  // placeholder.
  resume: { kind: "none" },
  // Inert until Tier 3 lands a `kind: "hook"` resume — `docsUrl` only
  // renders for hook/session-file rows (Settings → Agents). Points at the
  // anchor that setup page will use once there's something to document.
  docsUrl: "https://getsilo.dev/guide/agent-sessions#opencode",
  contract:
    "OpenCode (opencode-ai) ships as a native compiled binary; argv0 is " +
    "`opencode` directly (no node-wrapping). CONFIRMED live against " +
    "opencode 1.18.20 (2026-08-26), across four separate real generations " +
    "(three in a live Silo terminal, one via direct raw-PTY capture): it " +
    "NEVER emits OSC 9 (ConEmu progress) or OSC 133 (shell integration). " +
    'Its OSC 0 title is static ("OpenCode") except one async rename to ' +
    '"OC | <session summary>" roughly 40s after the first message, ' +
    "uncorrelated with any working/idle transition — a one-time " +
    "session-naming event, not a status signal. The one real signal: its " +
    "@opentui-based TUI renders an animated 8-cell bar while busy — each " +
    "cell a CSI cursor-position escape immediately followed by U+2B1D " +
    '"⬝" (empty) or U+25A0 "■" (filled) — confirmed building in real time ' +
    "(425+ filled-frame writes within 4s) during genuine generation, not " +
    "just the connection-retry state where it was first observed; no " +
    "explicit idle signal exists in raw output, so the agent-idle debounce " +
    "clears working on silence, same as Cursor's fallback. Resume: " +
    "`--session <id>` / `--continue` / `--fork` are real CLI flags, but " +
    "`opencode session list` returns id/title/timestamp with NO pid, so " +
    "Silo's pid-correlated session-file resume cannot read it passively. " +
    "A pi-extension-style installed plugin (the official @opencode-ai/" +
    "plugin SDK loads in-process, confirmed via `ps` that the local TUI " +
    "case is a single OS process) is the plausible resume path, but is " +
    "UNVERIFIED — read from shipped .d.ts files only, no plugin built or " +
    "run. See ADR 0043. RFC 0033 recon (2026-08-31): OPENCODE_CONFIG_DIR is a " +
    "real config-load-path override (and suppresses default config bootstrap), " +
    "but credentials/state live at ~/.local/share/opencode independently — a " +
    "second profile would share the first's account — so `configDirEnvVar` is " +
    "left undefined.",
  upstreamRefs: [
    "https://opencode.ai",
    "https://github.com/sst/opencode",
    // @opencode-ai/plugin's shipped .d.ts (index.d.ts, tui.d.ts) is the
    // source for the unverified Tier-3 plugin mechanism the contract above
    // describes — no public docs page covers it yet.
  ],
  lastVerified: "2026-08-31",
  verifiedAgainstVersion: "opencode@1.18.20",
};
