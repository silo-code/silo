---
status: draft
created: 2026-10-09
---

# 0060. Transferring a Chat session to another agent

## Summary

Let a user move a Chat session's work to a different agent without starting
over: Silo assembles a **handoff** from what it already knows about the
session, has a user-chosen agent write the narrative half, and opens a new
session against the destination agent with that handoff as its opening
context. Silo bundles no model of its own for this; the narrative half is written by an
agent the user chooses, or by the local model [RFC
0061](./0061-session-summary.md) introduces.

## Motivation

The common failure is mundane: a session hits its limit mid-task. Today the
only recovery is to open a new session against another agent and re-explain the
work from memory, which loses the parts a user is least able to reconstruct —
which files were already touched, which approaches were tried and abandoned,
where the plan stood.

Silo is unusually well placed to fix this because it already holds the
material. The transcript is structured, not a blob: `MessageEntry`,
`ToolEntry`, `PlanEntry` and `NoticeEntry`, with the working checkout on
`AgentInfo.cwd` (RFC 0052) and delegation history from RFC 0057. The agent that
ran the session is not the only thing that knows what happened.

This needs no new protocol support. It works identically on every agent we
support, now and later, because none of it asks the agent for a capability —
see "Uniformity" below.

## Design

### The handoff has two halves, and only one needs a model

**Assembled** — derived from the transcript, deterministically, with no
generation at all:

- the originating task (the session's first user message, verbatim),
- the working checkout (`AgentInfo.cwd`),
- files read and written, from `ToolEntry`,
- the plan and each step's status (RFC 0059),
- commands run,
- delegated subagent work and its outcomes (RFC 0057).

This half cannot hallucinate which files were edited, and it is available even
when the source agent is unreachable.

**Generated** — the narrative the structure can't carry: what was decided and
why, what was tried and rejected, what the next step was meant to be. This is
the smaller half and the only part that needs a model.

### Generation never runs in the working session

The narrative is written in a **throwaway session**, fed the assembled handoff
— never by prompting the session being transferred. Prompting the live
session pollutes the transcript the user is reading and consumes the context
window, which is worst exactly when a transfer is wanted. Because the assembled
half carries the facts, the session's own context is not needed to write the
narrative anyway.

### The summarizer is a configured agent, chosen by the user

The generating agent is an **Agent Profile** (RFC 0033), picked by the user and
remembered. The default is any configured profile _other than the session being
transferred_.

That default is the whole point and the decision this RFC most wants on record.
The obvious design — ask the session to summarize itself — fails precisely when
the feature is needed, because a session that has exhausted its context or its
rate limit is in no position to write anything. Silo holds the transcript, so
it can hand it to a different agent entirely. Summarizing from what we already
have, rather than on the way out, is the correct shape.

### Silo ships no model, and does not download one in v1

Silo today has **no model dependency of any kind** — no inference crate, no API
client — and ships to macOS, Windows and Linux (`targets: "all"`). The size
argument is concrete: current installers are 9–13 MB (11–12 MB DMG, 9 MB
Windows setup, 13 MB deb/rpm). The smallest models that write usable prose are
roughly 230 MB (SmolLM2-360M Q4), 350 MB (Qwen2.5-0.5B Q4) and 700 MB (Llama
3.2 1B Q4). Bundling the smallest of those is a **20× installer increase**,
which is a different product, not a feature.

The runtime side is more tractable than the payload: Candle is pure Rust and
cross-compiles without a C++ toolchain, so native inference would fit the build
setup better than llama.cpp bindings. The multiplier is our six-plus release
targets, not the language.

On-device generation is already available with no code from us: a locally-backed
profile (pi against a local model, or any ACP adapter fronting Ollama) _is_ an
on-device summarizer the moment it is configured.

Two paths stay explicitly open as **later phases**, neither a prerequisite:

- **Download-on-demand** — ship nothing, fetch a small model on first use.
  [RFC 0061](./0061-session-summary.md) proposes exactly this for session
  summaries and should land first; if it does, a transfer's narrative half can
  reuse that model rather than spending an agent turn on it.
- **Apple Foundation Models** — on-device, no download, macOS-only. An
  opportunistic enhancement where available, never a requirement, and never
  something a cross-platform feature depends on.

The reason neither is in v1 is sequencing, not feasibility: we do not yet know
that the generated half earns a subsystem. The assembled half is the part with
proven value.

### Delivery

ACP accepts synthetic **user** context only — there is no system or developer
channel (confirmed against a second implementation's ACP capability record).
The handoff is therefore delivered as the opening user message of the new
session, clearly demarcated as a handoff rather than disguised as something the
user typed.

The destination is a new Chat session against the chosen profile in the same
working checkout. **The source session is not closed or destroyed** — a
transfer that loses the original on failure is worse than no transfer. Both
sessions get a `NoticeEntry` recording the transfer and its counterpart.

### Standalone summaries belong to RFC 0061

An earlier draft folded "summarize this session" into this RFC as the same seam
surfaced directly. It moved out: the re-orientation summary has different
requirements (short, recency-weighted, generated continuously, available while
the agent is offline) and is specified in
[RFC 0061](./0061-session-summary.md). A transfer may reuse 0061's generator
for its narrative half, but it does not own it.

### Uniformity

Nothing above is gated on an agent capability. Assembly is Silo's own data;
generation is an ordinary prompt; delivery is an ordinary first message. Every
agent in the catalog gets this on day one, including ones added later.

The one honest asymmetry: where an agent offers a native compaction or summary
command, we already learn about it through `available_commands_update` (RFC 0040) and could prefer it over our own prompt. That is an enhancement, not a
prerequisite, and it should not shape the base design.

### Failure modes

- **No second profile configured.** Offer the assembled half alone — it is
  genuinely useful without the narrative — and say why the rest is missing.
- **Generation fails or is refused.** Same degradation. The transfer still
  happens; the handoff is thinner.
- **Source agent unreachable.** No effect on assembly. This is the case the
  design exists for.

### Tests

Per `silo-testing`, assembly is a pure function from a transcript fixture to a
handoff record, tested without React: files-touched extraction across tool
shapes, plan-state capture, delegation inclusion, the empty-transcript case,
and summarizer-profile selection including the "only one profile configured"
case and the refusal to default to the session being transferred.

### Documentation

`docs/domain-language.md` has no term for this. "Handoff", "transfer" and
"summary" are each doing work here and at least one needs a glossary entry
before the code picks a spelling by accident. Whether any of this reaches `ctx`
is deferred — the first version is a Chat panel feature, and a public surface
should follow real usage rather than precede it.

## Alternatives considered

**Ask the source agent to summarize itself.** The obvious design, and it fails
exactly when needed. Kept as a non-default option, since a healthy session does
know its own work best.

**Bundle a small model.** Rejected above: a new cross-platform subsystem and a
large payload, for a job a configured agent already does.

**Use ACP `session/fork`.** Wrong semantics. Fork continues the _same_ agent;
this is about leaving it. (Worth tracking separately — the adapter ships
`fork-session.js` and our coverage doc has `fork` as v1-unstable.)

**Design a `ctx` surface first.** Premature. Build the feature, learn the
shape, then decide what an extension should be able to do with it.

## Decision

_Pending._
