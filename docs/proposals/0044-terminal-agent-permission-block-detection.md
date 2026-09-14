---
status: draft # draft | accepted | implemented | rejected | superseded-by NNNN
created: 2026-09-14
---

# 0044. Terminal-agent permission-block detection

## Summary

`AgentActivity` gained a `"blocked"` value (2026-09-14): a Chat session shows
an amber, pulsing status — with its own optional notification sound — the
instant it suspends on `session/request_permission`, regardless of whether
its tab is focused. That signal is Chat-only. A **terminal-kind** agent
(Claude Code, Cursor Agent, Codex, etc. run as a raw PTY Silo watches rather
than an ACP child it talks to) has no equivalent: its permission prompt and
its ordinary "waiting for your next message" idle state are visually
identical from the outside, so Silo cannot tell them apart today. This RFC
proposes how to close that gap — or explicitly decide not to, if the recon
says it isn't reliably detectable — rather than let terminal agents silently
lack a status Chat agents now have.

## Motivation

Dave asked for the same "waiting on you" indicator on CLI agents right after
shipping it for Chat, and the honest answer was no — not without new
detection work, because the two kinds get this information through
fundamentally different channels:

- **Chat**: the Agent Client Protocol's `session/request_permission` is a
  structured RPC. Silo is _told_ the agent is blocked, with the exact tool
  call and options it's asking about.
- **Terminal**: Silo _infers_ everything about a session's activity from
  OSC titles and raw PTY output (`agent-osc-detectors.ts`,
  `agent-activity-model.ts`) — there is no structured "I am now blocked"
  message, because there is no protocol at all, just a program drawing a TUI.
  For Claude Code specifically, the OSC 0 title is binary: an animated
  spinner glyph while working, a `✳` marker once idle — and that `✳` marker
  covers _both_ "ready for your next message" and "sitting on a permission
  prompt" with no distinction.

Today's settings page already had to describe the new blocked-sound
preference as Chat-only (`packages/extensions-silo/src/agents/settings.tsx`)
precisely because of this gap — the setting exists but silently does nothing
for a terminal agent, which is the kind of asymmetry this repo's "observation
parity" promise (RFC 0038) exists to avoid.

## Design

The likely shape, pending the recon below:

1. **Per-agent permission-prompt detectors.** Each `AgentDefinition` in
   `agent-catalog.ts`/`catalog/*.ts` already carries `activityDetectors` for
   working/idle. This adds a sibling detector (or extends the existing one)
   that recognizes a permission prompt's actual on-screen rendering — the
   literal text/TUI box each CLI draws when it wants a yes/no/always answer.
   That means **recon per agent**, the same way `activityDetectors` were
   built originally (RFC 0033-style: run the real CLI, capture the raw PTY
   bytes for a permission prompt, and pin the exact pattern with a version
   number) — not a guess. Candidates to start with, since they're already
   cataloged: Claude Code, Cursor Agent, Codex.
2. **Feed the shared core.** `agent-activity-model.ts` already resolves
   terminal detection's ambiguity before calling into the kind-agnostic
   `agent-turn-model.ts` core that Chat calls directly. A detected
   permission prompt would need to map onto an event that core (or the
   terminal-specific model wrapping it) can turn into `activity: "blocked"`
   — deliberately reusing the same `AgentActivity` value and the same
   `deriveStatusRow`/`deriveTab`/`agents-panel-view.ts` projection Chat
   already exercises, not a parallel status.
3. **Resolving back out of "blocked".** Chat gets this for free — the
   permission response's own callback flips `activity` back to `"working"`.
   A terminal detector needs its own resolution signal: the prompt's box
   disappearing from output, the working spinner glyph resuming, or both as
   a fallback, whichever recon shows is reliable.
4. **Settings.** Once shipped, drop the "Chat sessions only" qualifier this
   RFC's companion change added to the blocked-sound setting
   (`packages/extensions-silo/src/agents/settings.tsx`).

## Alternatives considered

- **Idle-duration heuristic** (no text detection at all): treat an unusually
  long idle stretch as "probably a permission prompt." Rejected outright — a
  human just being slow to type is indistinguishable from a stuck prompt, so
  this would fire constantly on ordinary silence and still miss a permission
  prompt answered quickly.
- **Do nothing; push users toward Chat for this signal.** Cheapest option,
  and already true today (this RFC's companion change documents it in
  settings rather than hiding the gap). Reasonable as a permanent answer if
  recon shows permission-prompt text is too unstable across CLI versions to
  detect reliably — call it out explicitly in the Decision below rather than
  leaving the gap silently unaddressed.
- **Ask each CLI to emit a structured signal for this** (an OSC extension,
  a hook event). Out of Silo's control — none of the cataloged agents
  support it — and worth revisiting only if one starts to.

## Decision

Not yet decided — draft. Recon (real CLI, real permission prompt, captured
PTY bytes, pinned version) is the next step before committing to the
detector-based design above over the "leave it Chat-only" alternative.
