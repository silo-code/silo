---
status: accepted
date: 2026-07-29
---

# 0028. Sealed agent detection and honest resume (no cwd inference)

## Context

`ctx.agents` reports per-terminal coding-agent activity and, after an unclean
backend death, a resume hint. Two design pressures conflicted early:

1. Extensions (and first-party UI) want a single shared answer — not each
   recomputing OSC/output classifiers.
2. A wrong exact resume command (`claude --resume <wrong-id>`) is worse than
   a vague reminder — directory/recency heuristics look precise and fail silently
   when two sessions share a cwd.

RFC 0018 sealed detection in the host and forbade silent session-id inference.
The landed surface also split "agent is idle" (`activity`) from "a human should
look" (`needsAttention` + `acknowledge`), after an earlier `waiting`/`done`
activity split proved redundant.

## Decision

1. **Detection is sealed.** There is no public `registerAgent` / detector /
   resume-resolver API. Known CLIs live in the host agent catalog; extensions
   only read `ctx.agents`.
2. **Exact resume requires an explicit identity source** — an opt-in
   SessionStart hook (Settings → Agents) or an agent's own session registry
   (e.g. Grok). Without that, Silo attaches an honest, session-id-less hint.
3. **`activity` vs `needsAttention` are separate.** `idle` describes the agent;
   `needsAttention` is sticky UX cleared only by `acknowledge`. The host does
   not auto-acknowledge on focus.

## Amendment — declared identity is accepted (RFC 0038, 2026-09-08)

RFC 0038 adds a second kind of Agent Session — a **Chat session**, an Agent
Client Protocol child that states its identity and status at `initialize`.
Accepting that _declared_ identity does **not** reopen this ADR:

- Sealing exists to prevent **divergent classifiers** — several consumers
  inferring "is it working?" from ambiguous OSC signals and disagreeing. A Chat
  session has no classifier; the agent reports turn boundaries and a typed stop
  reason directly, so there is nothing to diverge.
- There is still no public `registerAgent` / detector / resume-resolver API.
  Which CLIs can be run as a Chat agent stays a **curated catalog fact**
  (`AgentDefinition.acpLaunch`), set by the same run-it recon as every other
  catalog field.
- Decision 2 is unchanged: exact resume still requires an explicit identity
  source. For a Chat session that source is `session/new` returning an id (no
  hook needed); `session/load` is per-agent optional, so the model carries an
  explicit "cannot be restored" state.

So the sealed boundary holds: identity for a Terminal session is **observed**,
for a Chat session it is **declared**, and `AgentProfile.assumedAgentId` stays
a user **assertion** that never becomes either.

## Consequences

- Adding a CLI means a catalog entry (+ optional installer), not a public
  extension registration surface — keeps answers consistent across consumers.
- Exact resume stays opt-in and fail-closed (corrupt settings are not rewritten).
- Extension authors must call `acknowledge` themselves if their UI should clear
  attention on view.

## Alternatives considered

- **Public detector registration** — deferred; would reintroduce divergent
  classifiers and a larger public Interface for little gain while the set of
  agents is still host-curated.
- **Cwd/recency session inference** — rejected; silent wrong resumes.
- **Encoding attention into `activity` (`waiting`/`done`)** — rejected; no
  information `needsAttention` didn't already carry.

## References

- [RFC 0018](../proposals/0018-ctx-agents-surface.md) · [RFC 0019](../proposals/0019-agent-hook-shell-runtime.md)
- ADR 0042 (host-internal catalog layout and runtime policy — detection
  boundary here is unchanged)
- [`ctx.agents` API](../../apps/docs/api/agents/) · [Agent sessions guide](../../apps/docs/guide/agent-sessions.md)
