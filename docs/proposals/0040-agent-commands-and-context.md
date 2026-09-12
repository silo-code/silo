---
status: draft
created: 2026-09-09
---

# 0040. Commands, skills, and context in the Agent Session surface

## Summary

An agent advertises its slash commands — and, in both agents probed, its
**skills** flattened into the same list — over the wire, live, from the moment a
session connects. Silo currently drops that notification on the floor: nothing in
`ctx.agents.sessions` exposes it, so an extension building a Chat UI cannot offer
a command palette, a `/` autocomplete, or a skill picker. The same is true of
what the agent will accept _as_ context: `promptCapabilities` says whether it
takes images or embedded resources, and Silo reads none of it.

This proposes modelling both — `session.commands` alongside the existing
`session.configOptions`, and a `session.promptCapabilities` snapshot — so a Chat
UI can be built without reading `raw`.

## Motivation

### The recon (2026-09-09)

Run against a real agent over piped stdio, not read from a spec.
`available_commands_update` arrives as a `session/update` notification **before
any prompt is sent**:

| agent                                          | commands at connect | latency after `session/new` |
| ---------------------------------------------- | ------------------- | --------------------------- |
| `pi-acp@0.0.33`                                | 13                  | ~12.5s (after its banner)   |
| `@agentclientprotocol/claude-agent-acp@0.75.1` | 70                  | ~2.3s                       |

The payload shape is identical in both:

```jsonc
{
  "sessionUpdate": "available_commands_update",
  "availableCommands": [
    {
      "name": "compact",
      "description": "Manually compact the session context",
      "input": { "hint": "optional custom instructions" },
    },
    {
      "name": "skill:code-review",
      "description": "Review the changes since …",
    },
  ],
}
```

`{ name, description?, input? }`, where `input` is `{ hint: string }` or absent.
Claude sends `input: null` explicitly where pi omits the key — the same field,
two spellings of "none", which the model has to absorb rather than push onto
every consumer.

### Skills are commands, and the agents disagree about how to say so

This is the finding worth designing around. **ACP has no separate skills
concept.** Both agents flatten skills into `availableCommands`, and they mark
them differently:

- **pi** prefixes the name: `skill:code-review`, `skill:grilling` — 5 of its 13.
- **Claude** does not prefix at all. Its 70 entries put `code-review` beside
  `compact`, distinguished only by a trailing `(user)` / `(project)` marker
  **inside the description prose**.

So a UI that wants a skill picker separate from a command palette cannot get one
from the protocol. It could pattern-match `skill:` and parse `(user)` out of a
description — which is exactly the kind of vendor-sniffing the sprint's own trap
list forbids ("never branch on 'agent X does/doesn't do Y'"), and it would break
the first time either agent changed its labelling.

The honest surface is therefore **one list, not two**, with the SDK saying
plainly that skills arrive inside it and that separating them is not something
the protocol supports today. A `kind: "command" | "skill"` field would be Silo
inventing a distinction it cannot reliably compute.

### Invocation is already possible; discovery is not

There is no `session/execute_command` method. A command is invoked by putting
`/name args` in an ordinary `session/prompt` text block — which
`AgentSessionHandle.prompt` already does. **The gap is entirely discovery**: an
extension can send `/compact` today, it just has no way to know the command
exists, what it does, or whether it takes an argument.

That asymmetry is why this is a small proposal rather than a large one.

### Context: what the agent will accept

`initialize` returns `promptCapabilities`, and the two agents differ:

| agent              | `image` | `audio`  | `embeddedContext` |
| ------------------ | ------- | -------- | ----------------- |
| `pi-acp`           | true    | false    | **false**         |
| `codex-acp`        | true    | (absent) | true              |
| `claude-agent-acp` | true    | (absent) | true              |

Two things to notice. `audio` is **absent**, not `false`, from two of three — so
the field has to be read as optional-and-defaulting-to-false, not as a required
boolean. And pi genuinely differs on `embeddedContext`, so this is a real
branch a UI must respect, not a formality.

`AgentPromptBlock` today models `"text"` and `"resource_link"` only, with a
TSDoc note that images "are deferred — the agent advertises what it accepts at
connect time, and this union grows behind that." That advertisement is the thing
this proposal surfaces. Without it a Chat UI has two bad options: never offer an
attachment, or offer one and let it fail at prompt time against an agent that
does not take it.

Note the distinction the protocol draws, which the SDK should keep:
`resource_link` is a _pointer_ the agent may choose to read (always allowed);
`resource` is _embedded content_ inlined into the prompt, and only an agent with
`embeddedContext: true` accepts it.

### One correction to an existing doc

`AgentSessionHandle.onUpdate` says it "fires only between `prompt` and its
resolution, plus a replay of prior turns right after `resume`". The probe found
**pi emits an `agent_message_chunk` at connect, before any prompt** — its startup
banner. A consumer that trusts the current wording drops it. The sentence needs
fixing regardless of the rest of this proposal.

## Design

### `session.commands` — a live snapshot, like `configOptions`

```ts
/**
 * One command the agent advertises. **Skills arrive in this list too** — the
 * protocol has no separate concept, and the two agents probed mark them
 * differently (pi prefixes `skill:`; Claude does not mark them at all outside
 * description prose). Do not try to split them.
 */
export interface AgentCommand {
  /** What to send after `/` to invoke it. */
  readonly name: string;
  /** One-line summary for a palette row. */
  readonly description?: string;
  /**
   * Present when the command takes a free-text argument; `hint` is the
   * agent's own placeholder. Absent means it takes none — normalised, since
   * Claude sends `input: null` where pi omits the key.
   */
  readonly input?: { readonly hint?: string };
}

export interface AgentSessionHandle {
  // …existing…

  /** Commands the agent advertises, live. Empty until the agent has sent its
   *  first `available_commands_update` — which both agents probed do at
   *  connect, before any prompt, but none is required to. */
  readonly commands: readonly AgentCommand[];

  /** Fires when {@link commands} is replaced. */
  onCommandsChanged(listener: () => void): Disposable;
}
```

Deliberately the shape of `configOptions` / `onConfigOptionsChanged`: a live
snapshot plus a change signal, re-read on fire. One pattern for "things the
agent told us about itself", not two.

**No `runCommand()` method.** Invocation is `prompt([{ type: "text", text:
"/compact" }])`, which already works. Adding a second door would imply Silo
validates or routes commands, and it does neither.

### `session.promptCapabilities` — what the agent accepts

```ts
export interface AgentPromptCapabilities {
  /** Image content blocks are accepted. */
  readonly image: boolean;
  /** Audio content blocks are accepted. */
  readonly audio: boolean;
  /**
   * Embedded `resource` blocks — file *content* inlined into the prompt — are
   * accepted. A `resource_link` (a pointer the agent may read itself) is
   * always allowed and is not gated on this.
   */
  readonly embeddedContext: boolean;
}
```

Read at `initialize`, fixed for the session's life. A UI gates its attachment
affordance on it rather than offering one that fails at prompt time.

`AgentPromptBlock` grows the members this unlocks — at minimum `resource` for
`embeddedContext`, and an image block — each documented as requiring its
capability. That is where the existing "this union grows behind that" note has
been pointing.

### What is deliberately not modelled

- **`kind: "command" | "skill"`.** Cannot be computed without vendor-sniffing;
  see above. If ACP later marks skills on the wire, this surface grows a field
  and no consumer breaks.
- **`usage_update`** (`{ used, size }`, seen from Claude only). A real thing a
  UI might draw, but one agent is not a pattern — it stays readable on `raw`
  until a second agent sends it. Recorded here so the next probe knows to look.
- **A command palette.** This is a data surface. What a Chat UI does with 70
  commands is the extension's design problem, and the whole point of RFC 0039 is
  that we get to iterate on that outside a Silo release.

## Alternatives considered

**Leave it on `raw`.** An extension can read `update.raw.availableCommands`
today. Rejected for the reason Session 3.8 already settled: `raw` tracks the
protocol, not semver, and anything _every_ Chat UI must render belongs in the
modelled surface. Command discovery is not garnish — it is how a user finds what
an agent can do.

**Model skills separately from commands.** A `session.skills` list beside
`session.commands`, populated by stripping pi's `skill:` prefix and parsing
Claude's `(user)` suffix. Rejected: it is vendor-sniffing dressed as a model, it
would bake two agents' current labelling into the SDK, and the trap list already
names this mistake.

**Add `session.runCommand(name, arg?)`.** A typed invocation path. Rejected as
redundant — it would compile to the same `prompt` call, while implying a
validation Silo does not perform.

**Wait for ACP to standardise skills.** Defensible, and it would leave a Chat UI
with no command discovery for however long that takes. The list is already on the
wire and already useful; modelling it now costs one interface.

## Decision

Not yet decided — `draft`.

Open questions for review:

1. **Should `commands` be empty-until-arrival, or should `connect()` wait for the
   first `available_commands_update`?** Both agents send one at connect, but pi
   took ~12.5s (behind its startup banner) and nothing in the protocol requires
   it at all. Waiting would make `connect()` hang on an agent that never sends
   one. Leaning empty-until-arrival, with the change signal doing the work.
2. **Does `promptCapabilities` belong on the handle, or on `AgentInfo`?** It is a
   property of the agent, not the session, but a consumer meets it through the
   handle. Leaning the handle, for the same reason `configOptions` lives there.
3. **Which `AgentPromptBlock` members land now?** `resource` is clearly needed
   for `embeddedContext`. An image block needs a probe of what each agent
   actually accepts — no agent has been sent one yet, and this surface's rule is
   that the check is a run, not a read of the docs.
