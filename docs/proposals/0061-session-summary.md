---
status: draft
created: 2026-10-13
---

# 0061. Session summary — knowing what a Chat tab is about

## Summary

Give every Chat session a short, generated summary — two sentences, weighted
toward what happened most recently — kept current as the session runs,
persisted, and shown when a user returns to a tab they have been away from.
Generation runs on a small local model Silo downloads on demand, so a summary
costs nothing per use, works while the agent is offline, and never sends a
transcript anywhere.

## Motivation

Coming back to a Chat tab after a day or two, there is nothing to go on but the
tab title. The title is real — `claude-agent-acp` 0.75.1 and Cursor both
volunteer one through `session_info_update` (`acp-sessions-service.ts:216`) —
but it is one line written early and it does not survive a session that went
somewhere.

An earlier draft of this RFC proposed an **assembled card** instead: the
originating ask verbatim, plan state, files touched, last activity — all
mechanically extracted, no model. Building that card against a real session
disproved it. The fields were accurate and still did not say what the session
was _about_: the opening question described the first five minutes, and nothing
in the card conveyed the reversals, the conclusions, or where the work actually
stood. Structured fields can report what a session touched; they cannot report
what it decided.

What is wanted is a couple of sentences a person can read cold. For this
session, that is:

> Compared Silo's ACP chat panel against T3 Code and established that almost
> nothing Silo lacks is actually blocked by ACP, then drafted three RFCs — a
> pinned plan panel (0059), session transfer to another agent (0060), and a
> session digest for stale tabs (0061). Most recently 0061's premise collapsed:
> Dave wants a short generated paragraph weighted toward recent intent, not an
> assembled fact card, which makes a small bundled model a v1 requirement
> rather than a deferred phase.

No arrangement of extracted fields produces that paragraph. Generation is the
feature, not an enhancement on top of one.

## Design

### The output is specified, and short

- **Two sentences**, roughly 75 words. A hard ceiling, enforced after
  generation — a summary that needs scrolling has failed at its job.
- **Recency-weighted.** The second sentence should describe where things stand
  _now_, including a late reversal that invalidates what came before. This is
  the requirement that makes the feature useful and the one a naive "summarize
  this conversation" prompt gets wrong.
- **Plain prose**, no headings or lists, so it can render inline on a tab, in a
  tooltip, or in a session picker without reformatting.

### Rolling, incremental generation

The summary is maintained, not computed from scratch. On each idle boundary,
the model is given the **previous summary plus the turns since it was written**,
and returns the new summary.

This is the design's load-bearing choice, and it solves the problem that would
otherwise sink local generation: input stays bounded no matter how long the
session runs, so a model with a few thousand usable tokens of context is
sufficient for a transcript of any size. It is also recency-weighted by
construction — recent turns arrive verbatim while older ones are already
compressed — rather than by prompt instruction.

A session resumed after its summary was written simply continues the roll from
there.

### A local model, downloaded on demand

Silo ships no model in the installer and downloads one the first time a user
enables the feature. The installer stays as it is (current releases are
9–13 MB; the smallest models that write usable prose start around 230 MB, so
bundling means a 20× increase for everyone including those who never use this).

A local model is the right fit here on the merits, not only on size:

- **Cost shape.** This runs per tab, on every idle, forever. Spending
  subscription tokens or API credits to re-summarize idle sessions is the wrong
  thing to be paying for.
- **Availability.** It must work when the agent is gone — rate-limited, exited,
  or days dead. That is the normal case for a stale tab, not an edge case.
- **Privacy.** The transcript never leaves the machine. For an app whose users
  point agents at private repositories, that is worth stating plainly.
- **Quality bar.** Two sentences of description, from bounded input, that
  nobody acts on directly. This is within reach of a small instruction-tuned
  model in a way that long-context synthesis is not.

Model selection is an implementation decision, not settled here. The
requirements are: runs acceptably on CPU, instruction-tuned, a few hundred
megabytes quantized. Candle is the likely runtime — pure Rust, cross-compiles
to our targets without a C++ toolchain.

Users who already run a local model keep that option: a locally-backed Agent
Profile (pi, or any ACP adapter fronting Ollama) can serve as the generator
instead of the downloaded model.

### Before the model exists, and when it fails

The feature degrades to what Silo can state without generating: the agent's
volunteered title, the originating ask, and last activity. That is the earlier
draft's card, demoted to its correct role — a fallback, not the product.

A user who declines the download keeps the fallback permanently and is told so
once, not nagged.

### Where it renders

The dormant tab, before resuming. The same string is the natural content for a
tab tooltip and for the resume dialog's session list, but this RFC commits only
to the panel — the rest should follow the summary existing.

### Storage

Per workspace, under the panel's extension storage, keyed by session id: the
summary string, the transcript position it was generated through, and a
timestamp. A few hundred bytes. Evicted with the session it describes.

### Tests

Per `silo-testing`, the deterministic parts are pure functions and are tested
without a model: selecting the turns since the last summary position, assembling
the generator input, enforcing the length ceiling, choosing the fallback when no
model is available, and advancing the stored position. Generation quality itself
is not unit-testable and should not be faked with assertions over model output.

### Documentation

`docs/domain-language.md` needs the term — "summary", "title" and "digest" are
three different things here. A downloaded model is a genuinely new kind of
artifact for Silo and its storage location, update policy and removal belong in
the docs alongside extension installs.

## Alternatives considered

**The assembled card.** This RFC's own earlier draft. Disproved by building it:
accurate fields, no answer to "what is this about."

**Ask an agent to generate it.** Costs subscription tokens on a recurring
background job, fails when the agent is unreachable — which is the normal state
of a stale tab — and sends the transcript to a vendor. Remains available as a
user-chosen generator for anyone who prefers it.

**Prompt the live session.** Pollutes the transcript the user is reading and
consumes the context window. Never correct for this feature.

**One pass over the whole transcript.** Needs long context, costs more every
time the session grows, and makes recency a prompt instruction rather than a
property of the input. The rolling design is cheaper and more accurate.

**Bundle the model in the installer.** A 20× size increase imposed on every
user for an optional feature. Download-on-demand gets the same capability
without the tax.

## Open questions

- Which model, and the floor that still produces acceptable two-sentence
  summaries. Needs evaluation against real transcripts before the RFC leaves
  `draft`.
- Idle threshold before a roll — immediately on idle, or on a longer timer.
- Whether the summary is user-editable, and whether an edit survives the next
  roll.

## Decision

_Pending._
