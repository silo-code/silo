---
status: accepted
date: 2026-08-26
---

# 0043. OpenCode: zero-install activity detection now, resume deferred to a verified plugin

## Context

OpenCode (`opencode`, native binary, `@opencode-ai/*` toolchain) has no
catalog entry — it runs in a Silo terminal as an unrecognized program, the
exact symptom `docs/adding-a-coding-agent.md` names as the trigger for this
recipe. Recon below is live-confirmed unless marked otherwise; see that doc's
"CONFIRMED live versus still UNVERIFIED" bar (Step 6).

**Identity — CONFIRMED.** `file` reports a native Mach-O binary; `ps` during
a running session shows a single OS process (no separate server child for
the local `opencode [project]` TUI case). argv0 is `opencode` directly — no
node-wrapped-argv0 quirk, no `processArgsMarkers` need.

**Activity — CONFIRMED, and it is not an OSC signal.** Captured the full raw
PTY byte stream (via `script`/`tmux pipe-pane`) and cross-checked against
Silo's own live `silo:agents` detection log for a real session across four
separate real generations (three inside a live Silo terminal, one via direct
capture): **zero OSC 9 (ConEmu progress) events, zero OSC 133
(shell-integration) events, ever.** OSC 0 (title) fires three times total in
the whole session — `"OpenCode"` → `"OpenCode"` (unchanged) →
`"OC | <session summary>"` (one async rename ~40s after the first message,
uncorrelated with either of two later generations) — a one-time
session-naming event, not a working/idle signal. Every other OSC code seen
(4/10/11/12/66/99/1337) is `@opentui`'s (the TUI's rendering framework)
startup capability-probing noise.

What _is_ real: a distinctive raw-output signal. While actively generating,
OpenCode's TUI renders an animated 8-cell bar spinner —
`⬝` (U+2B1D, empty) / `■` (U+25A0, filled), cursor-positioned via
`\x1b[<row>;<col>H` writes with a smooth 24-bit color gradient — confirmed
building in real time (425+ filled-frame writes within 4 seconds) during a
genuine successful generation, not just the connection-retry state where it
was first spotted. The footer also switches from `tab agents  ctrl+p
commands` (idle) to `esc interrupt` / `esc again to interrupt` (busy). This
is the same class of signal Cursor Agent's existing raw-output fallback
(`detectCursorAgentOutput`) already handles — a distinctive multi-character
animation in the raw stream, not a bare single glyph common enough to
false-positive.

**Resume — no zero-install path exists.** `--session <id>` / `--continue` /
`--fork` are real CLI flags (confirmed via `--help`), but the only way to
discover a session id short of installing something is `opencode session
list`, which returns id + title + timestamp and **no pid** — Silo's
`AgentSessionFileResume` requires correlating a recorded pid against the
terminal's foreground pgid (agents run as process-group leaders), and
OpenCode's session store has no pid anywhere to correlate against. Neither
existing `AgentResume` kind fits passively.

**A resume path likely exists, but through an install — UNVERIFIED.**
Every `opencode` install ships `@opencode-ai/plugin`, an SDK with two
lifecycle surfaces: a "server" plugin (`chat.message` hook, fires with
`sessionID`) and a richer "TUI" plugin (`event.on("session.status" |
"session.idle" | ..., handler)`, live access to `state.session.status(id)`).
Both plugin kinds load _in-process_ — combined with the single-process
finding above, a loaded plugin's own `process.pid` would equal the
foreground pid Silo already tracks, the same trick pi's extension uses (ADR 0041) to sidestep having no pid-bearing session registry. This is read
directly from the shipped `.d.ts` files, not built or run — no plugin has
been written, installed, or observed reporting a real pid/session pair yet.

## Decision

Ship in the two tiers the recon actually supports today, per
`docs/adding-a-coding-agent.md`'s "fine to ship a tier at a time":

1. **Add `opencode` to `AGENT_CATALOG` now — Tier 1 (Identified) + Tier 2
   (Activity), zero install.** `leaderNames: ["opencode"]`; a new
   `OutputDetector` (modeled on `detectCursorAgentOutput`) matching the
   `⬝`/`■` bar-spinner frames; `resume: { kind: "none" }` — the honest
   default (Step 4), not a placeholder standing in for something unverified.
   This is a thin catalog entry per ADR 0042 decision 2 — nothing here needs
   `AgentRuntimePolicy` or `agents/opencode.ts`: no OSC signal exists to
   suppress or stamp identity from, and argv0 needs no markers.

2. **Defer Tier 3 (exact resume) to a follow-up change**, not this ADR.
   The design direction is an installed plugin mirroring pi's
   `pi-extension` strategy (ADR 0041) — self-report `process.pid` +
   `sessionID` to the same shared capture script every other agent's hook
   invokes, sidestepping the missing-pid session store entirely. Landing it
   requires writing and verifying a real plugin against a live session
   first (confirm `process.pid` truly matches the foreground pid inside a
   TUI plugin specifically, confirm `session.status`/`chat.message` actually
   fires reliably) — recording it as decided before that exists would put
   an ADR on a foundation nobody has built, which is exactly the discipline
   ADR 0042's phased rollout was written to enforce elsewhere in this
   catalog.

## Consequences

- OpenCode gets real support today (name, cwd, live working/idle) without
  waiting on the resume design to land — matches how pi itself could have
  shipped Tier 1+2 alone were Tier 3 harder (ADR 0041's "no exact resume"
  alternative, not taken there because pi's session ids were trivially
  available; here they are not, without a plugin).
- The raw-output detector carries the same class of risk every raw-output
  fallback does: a false positive if an unrelated program emits an
  identical animation. The bar's shape (8 cursor-positioned cells, two
  specific box-drawing codepoints, cycling with a color gradient) is judged
  distinctive enough by the same bar Cursor's two-character frames cleared.
- Tier 3, once verified, is a legitimate second occupant of `agents/`
  (ADR 0042) and a real second `AgentRuntimePolicy`/install-strategy
  consumer — but the trigger is the _verified_ mechanism landing, not this
  ADR. Nothing here should be read as pre-justifying ADR 0042's deferred
  phases (6/7) on OpenCode's account alone.
- `docs/adding-a-coding-agent.md` gains OpenCode as a second live example of
  "ship a tier at a time," alongside its existing three-tier framing.

## Alternatives considered

- **OSC-based activity detection** — not available; confirmed absent across
  four independent real-generation captures, not assumed absent from a
  single test.
- **Tier 1 only, no activity detection** — rejected. The raw-output signal
  is real, distinctive, and free (no install); declining it would be Silo
  choosing not to support something it demonstrably can, the same reasoning
  ADR 0041 used for pi's resume capability.
- **Recency/heuristic resume without a plugin** (guess the most-recently-
  updated session in `opencode session list` for this cwd) — rejected on
  the same grounds RFC 0018 rejected it for every other agent: silently
  wrong the moment a user runs two sessions in one directory.
- **Ship Tier 3 now, based on the `.d.ts` reading alone** — deferred, not
  rejected. The mechanism is plausible and specific enough to act on later;
  recording it as accepted without having run it once would misrepresent
  what "accepted" means for every other ADR in this directory.

## References

- ADR 0028 (sealed detection — unchanged)
- ADR 0041 (pi hook as installed extension — the install-strategy shape a
  future OpenCode plugin would follow)
- ADR 0042 (host-internal catalog layout — OpenCode already lives at
  `agents/catalog/opencode.ts` as a plain object per phase 7; if Tier 3 adds
  real runtime quirks it's a genuine candidate to grow pi's factory-plus-
  `runtime`-policy shape, not before)
- `docs/adding-a-coding-agent.md` (the three-tier model this ships in
  stages of)
- `packages/extension-host/src/extension-host/agents/agent-osc-detectors.ts`
  (`detectCursorAgentOutput` — the precedent this ADR's `OutputDetector`
  follows)
