---
status: implemented
created: 2026-09-14
---

# 0045. Context usage in the Chat panel

## Summary

Surface how much of an agent's context window a Chat session has consumed —
at minimum a token count, ideally a percentage — in the Chat panel's composer
control row, the same place the model/permission pills already live. Users
need this to know when a session is approaching compaction/truncation and
should start a fresh one, the same way every competitor ACP client (Paseo
confirmed by source) already shows it.

## Motivation

Today Silo's Chat panel (`silo.agents-chat-panel`) gives no signal at all
about session usage — a conversation can run until the agent silently
compacts or degrades, with no warning. Dave asked for this directly after
comparing against Paseo, which shows a small ring meter with an exact
token/percentage tooltip. This is table-stakes for a Chat UI in this
category, not a nice-to-have.

The gap is not a rendering gap — it's a **data** gap: the ACP layer this
panel is built on does not hand every agent's usage over uniformly, and
never hands over a context-window ceiling at all. `AgentSessionUpdate`
(`packages/sdk/src/agents-service.ts:761`) deliberately does not model
`usage_update` in its typed surface, precisely because "no agent reports the
same way" — its own doc comment already flags this as "a gap in this
surface worth reporting" once a real UI needs it every session. This RFC is
that report.

## What the protocol actually gives us (verified against source, not assumed)

- **ACP's `usage_update`** is optional in the protocol. Silo's own recon
  (`docs/acp-recon.md`, Spike A) directly observed it from `claude-agent-acp`
  (a running token count, streamed repeatedly through a turn) and its
  absence from Cursor ("no usage block"). It has never been profiled for the
  rest of the catalog (Codex, Copilot, Grok, OMP, Pi, opencode) — no claim is
  made about them here. **No agent's ACP `usage_update` has ever been
  observed carrying a context-window ceiling** — only a used-token count.
- **Today's SDK surface**: `usage_update` is deliberately left out of
  `AgentSessionUpdate`'s typed fields; it is reachable only through the
  `raw` escape hatch, in an unstable, per-agent shape.
- **How Paseo actually does it** (read directly from their source,
  `repos/getpaseo-paseo/packages/server/src/server/agent/providers/`):
  they do **not** use ACP for this at all. Each provider is a bespoke
  integration against that vendor's _native_ protocol —
  - `claude/agent.ts`: parses the Claude Agent SDK's own stream-json events
    (`message_start`, `modelUsage`, `message.usage`) inline as they stream.
  - `codex-app-server-agent.ts`: Codex's own app-server JSON-RPC pushes a
    native `token_usage_updated` notification carrying both used tokens
    _and_ `model_context_window` — the one provider whose native protocol
    hands over the ceiling too.
  - `opencode-agent.ts`: opencode's own event bus sends `step.finish` parts
    with a `tokens: {input, output, total, cache}` object, inline.
  - `omp/usage-poller.ts`, `pi/usage-poller.ts`: neither pushes usage at
    all — Paseo polls a stats RPC every 3s while a turn is running.
  - **The context-window ceiling itself** (`model-manifest.ts`) is a
    hand-maintained table per model (`claude-sonnet-5: 200_000`,
    `claude-opus-4-8[1m]: 1_000_000`, …), not sourced from any provider at
    runtime, for any provider — including Codex/OMP/Pi, whose native
    protocols _do_ hand over a ceiling, presumably because it's simpler to
    maintain one table than trust five different sources of truth.

  In short: full Paseo-style parity means bypassing ACP per agent, the same
  way Paseo bypasses it entirely. That is a materially bigger undertaking
  than reading one protocol field, and cuts against ACP being Silo's
  uniform agent-integration layer in the first place — worth deciding
  explicitly rather than backing into by accident.

## Design

Two phases, so a real (if partial) signal ships without committing to the
full bypass undertaking up front.

### Phase 1 — what ACP already gives us, modeled properly (shipped)

What actually shipped, differing from the sketch above in naming:

1. `AgentSessionUpdate.usage` (`packages/sdk/src/agents-service.ts`) is typed
   as `AgentSessionUsage`, using the protocol's own `used`/`size` field names
   rather than inventing `usedTokens`/`maxTokens`. Both fields are required
   together — a `usage_update` missing either is treated as not reported at
   all, matching every agent observed in practice (see "Verified live",
   below): none has been seen sending a used count with no ceiling. A
   used-only fallback was prototyped and rolled back as unneeded speculative
   handling for a case no agent actually produces; revisit if one ever does.

2. The host's ACP update pipeline (`acp-update-model.ts`'s `parseUsage`)
   normalizes `usage_update.used`/`.size`/`.cost` straight off the wire.
   **No hand-maintained per-model context-window table was built** — Silo
   trusts whatever `size` the agent itself reports instead of maintaining a
   second source of truth for it.

3. UI: not a ring/meter. A text pill (`"13.5k/200k (7%)"`, or `"7%"` at
   `condensed` density) in `.acp-chat__controls` (`AcpChatPanel.tsx`), next
   to the config-option pills, with the warn/err tone thresholds Paseo uses
   (70%/90%). **Always rendered** (reads `—`) rather than hidden for an
   agent that never reports usage — deliberately showing "not reported" as
   the same kind of unset value as any other config pill, rather than
   making the row's presence itself a signal.

### Phase 2 — native per-agent parity (deferred, not committed here)

Bypassing ACP per agent (Codex app-server, opencode's event bus, OMP/Pi's
stats RPC) the way Paseo does, for agents that have no `usage_update`
equivalent over ACP. This is real scope — a bespoke integration per
provider, maintained against each vendor's own protocol rather than ACP's —
and should get its own decision once Phase 1 ships and it's clear how much
that gap actually matters in practice. Not designed further here.

## Alternatives considered

- **Do nothing; let each Chat UI read `raw.usage_update` itself.** Rejected —
  that's exactly the escape hatch's stated limit ("if you find yourself
  needing it for something every Chat UI must render, that is a gap in this
  surface worth reporting"). A third-party extension would have to
  re-derive the same unstable parsing this RFC does once, centrally.
- **Full Paseo-style native bypass for every agent, up front.** Rejected for
  v1 — materially larger scope (a bespoke integration per vendor protocol,
  not a protocol field), and a real architectural question (does Silo ever
  bypass ACP, and under what rule) that deserves its own decision rather
  than shipping as a side effect of a usage meter.
- **Show a percentage with no confirmed ceiling (guess/estimate one).**
  Rejected — a wrong percentage is worse than no percentage; Phase 1 shows
  a raw count with no bar when the max isn't known.

## Verified live (2026-10-14)

Driven through the real app (`verifier-gui`) against Claude, Codex, Copilot,
Cursor, pi, and OpenCode, with source/spec research to back up what wasn't
directly observable:

- **Claude, Codex, Copilot**: send `usage_update` every turn; Context shows.
- **Cursor**: confirmed live (real completed turn, `—` throughout) and by the
  Cursor team — an open, acknowledged feature request with no committed date.
- **pi**: confirmed live and by source — a known bug in the `pi-acp` adapter
  (tracked upstream, not in pi itself, which does collect the numbers
  internally).
- **OpenCode**: confirmed by source
  (`packages/cli/src/acp/turn.ts`'s `sendUsageUpdate`) — it sends
  `usage_update` only when its own model catalog has a known context-window
  size for the model in use; a local/custom model without one gets nothing,
  by design, not by bug.

None of this is a Silo gap — every case above is the connected agent's own
ACP implementation choosing not to send the (spec-optional) notification, for
a reason specific to that agent. Documented for users in the "Chat panel
functionality" compatibility matrix at `/guide/agent-sessions` (apps/docs)
rather than fixed in code, since there is nothing on Silo's side to fix.

## Decision

Accepted and shipped as Phase 1. Phase 2 (bypassing ACP per agent for native
parity, as Paseo does) remains undesigned and not committed to — revisit only
if an agent's own ACP implementation stays stalled long enough that users
keep asking.
