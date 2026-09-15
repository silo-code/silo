---
status: draft
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

### Phase 1 — what ACP already gives us, modeled properly

1. Add a typed, optional field to `AgentSessionUpdate`
   (`packages/sdk/src/agents-service.ts`), e.g.:

   ```ts
   /**
    * Token usage as of this update, when the agent reports it — `undefined`
    * for updates that don't carry usage and for every agent that never
    * reports it at all (confirmed absent from Cursor; unconfirmed for the
    * rest of the catalog). No agent has been observed reporting a
    * context-window ceiling over ACP — that half of {@link AgentContextUsage}
    * is Silo's own, not the protocol's.
    */
   readonly usage?: AgentContextUsage;
   ```

   ```ts
   export interface AgentContextUsage {
     readonly usedTokens: number;
     /** From Silo's own maintained per-model table, not the protocol. */
     readonly maxTokens?: number;
   }
   ```

   This replaces one more `raw` reach-through with a real field — the thing
   the RFC 0038 doc comment asked for — instead of leaving every Chat UI
   (bundled or third-party) to parse `usage_update` itself.

2. In the host's ACP update pipeline (`acp-update-model.ts`,
   `acp-sessions-service.ts`), normalize `usage_update.tokens` (and whatever
   else is present — Claude's payload has more than a bare count per the
   recon transcript's "usage: 41,244 tokens, model claude-opus-5") into
   `usage.usedTokens`. Agents that never send it leave `usage` undefined;
   the panel treats that as "nothing to show," not an error or a zero.

3. A small, hand-maintained context-window table, scoped to models Silo
   already names (`packages/extension-host/src/extension-host/agents/catalog/claude.ts`
   already enumerates Claude's model ids) — fills `maxTokens` only where
   confidently known. No max means no percentage; show the raw token count
   alone rather than inventing a denominator.

4. UI: a small ring/meter in `.acp-chat__controls`
   (`AcpChatPanel.tsx`), next to the existing config-option pills — modeled
   on Paseo's `ContextWindowMeter` (muted below 70%, amber 70–90%, red past
   90%; a tooltip with the exact counts). Rendered only when `usage` is
   present on the latest update — absent entirely for agents that never
   report it, not a permanent placeholder.

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

## Decision

Not yet — draft.
