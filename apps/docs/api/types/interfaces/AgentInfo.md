# Interface: AgentInfo

Defined in: [packages/sdk/src/agents-service.ts:63](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L63)

**`Beta`**

Live agent-activity and resume-identity state for one **Agent Session**
(RFC 0038), computed once by the host and shared across every subscriber —
never recomputed per-extension. Returned by [AgentsService.getState](AgentsService.md#getstate)
and [AgentsService.getByTerminalId](AgentsService.md#getbyterminalid); delivered to
[AgentsService.subscribe](AgentsService.md#subscribe) listeners on every change.

## Properties

### id

```ts
readonly id: string;
```

Defined in: [packages/sdk/src/agents-service.ts:72](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L72)

**`Beta`**

Stable id for this Agent Session — the key [AgentsService.reveal](AgentsService.md#reveal),
[AgentsService.resume](AgentsService.md#resume), and [AgentsService.acknowledge](AgentsService.md#acknowledge) take.
For a Terminal session this is the terminal record id; for a Chat session
it is the session handle's id. Prefer this over
[AgentInfo.terminalId](#terminalid) for anything that should not care which kind
of session it is.

***

### terminalId?

```ts
readonly optional terminalId?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:80](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L80)

**`Beta`**

The terminal record id backing this session, when there is one — the same
id [AgentsService.getByTerminalId](AgentsService.md#getbyterminalid) and `ctx.terminals` take.
Present for every `kind: "terminal"` session; absent for a `kind: "chat"`
session, which has no PTY. A consumer that needs a terminal-tab id should
check [AgentInfo.kind](#kind) first, or use [AgentsService.reveal](AgentsService.md#reveal).

***

### workspaceId

```ts
readonly workspaceId: string;
```

Defined in: [packages/sdk/src/agents-service.ts:82](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L82)

**`Beta`**

The workspace this session belongs to.

***

### title

```ts
readonly title: string;
```

Defined in: [packages/sdk/src/agents-service.ts:108](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L108)

**`Beta`**

The session's display label — host-computed, the same string for either
kind, and the one a consumer should render. A status row, a navigator row
and the session's own dock tab all showing this field is what keeps them
from drifting.

It is a three-step fallback, and the two kinds are exact parallels:

| step               | Terminal                            | Chat                              |
| ------------------ | ----------------------------------- | --------------------------------- |
| the agent's words  | the OSC window title                | `session_info_update.title`       |
| the user's name    | `TerminalRecord.customName`   | *(no rename gesture yet)*         |
| fallback           | the terminal's derived name         | declared agent name → profile label |

The user's name wins where they set one; otherwise the agent's own words
win, with agent **status markers stripped** (Claude's spinner, Cursor's
trailing ` - Working …`) — the status is already structured state on this
same record, so repeating it in the label is noise.

Not every agent volunteers a title, and whether a given one does is its
own choice — and its adapter's, version to version. A session that never
gets one sits on the fallback, exactly as a terminal tab does for a CLI
that writes no OSC title. Silo does not paper over that by inventing a
summary from the first prompt.

***

### kind

```ts
readonly kind: AgentSessionKind;
```

Defined in: [packages/sdk/src/agents-service.ts:119](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L119)

**`Beta`**

Which kind of Agent Session this is — `"terminal"` or `"chat"`. See
[AgentSessionKind](../type-aliases/AgentSessionKind.md). `ctx.agents` reports the same fields for both;
this exists for the rare consumer that genuinely needs a PTY tab id or a
transcript panel.

(This field was the vestigial `TerminalKind` before RFC 0038 — always
`"shell"` and read by nothing — and carries the session discriminator
now.)

***

### isAgent

```ts
readonly isAgent: boolean;
```

Defined in: [packages/sdk/src/agents-service.ts:125](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L125)

**`Beta`**

Whether this terminal currently hosts an agent — true if it was created
as one, or an agent-specific signal was observed in it (e.g. typing
`claude` into a plain shell).

***

### activity

```ts
readonly activity: AgentActivity;
```

Defined in: [packages/sdk/src/agents-service.ts:127](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L127)

**`Beta`**

Current classified activity.

***

### needsAttention

```ts
readonly needsAttention: boolean;
```

Defined in: [packages/sdk/src/agents-service.ts:135](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L135)

**`Beta`**

Sticky "finished, go look" flag: set when the agent goes idle in a
terminal that wasn't the active one at that moment, and cleared only by
[AgentsService.acknowledge](AgentsService.md#acknowledge). Never set at all if the terminal
*was* already active the instant the agent went idle — being watched
live counts as already seen, no acknowledgment needed.

***

### attentionSince?

```ts
readonly optional attentionSince?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:137](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L137)

**`Beta`**

ISO timestamp of when `needsAttention` was set; undefined when not pending.

***

### workingSince?

```ts
readonly optional workingSince?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:139](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L139)

**`Beta`**

ISO timestamp of when the current `"working"` phase started; undefined otherwise.

***

### stale

```ts
readonly stale: boolean;
```

Defined in: [packages/sdk/src/agents-service.ts:148](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L148)

**`Beta`**

Soft, time-gap-based, **self-clearing** signal: this restored `working`/
`needsAttention` duration followed a gap long enough that it can't be
fully trusted — the agent may have finished without it being observed.
The next live signal clears it automatically. Distinct from
`activity === "dead"`, which is a hard, structural, non-self-resolving
fact — see [AgentActivity](../type-aliases/AgentActivity.md).

***

### sessionId?

```ts
readonly optional sessionId?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:158](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L158)

**`Beta`**

Exact session identifier for the agent running in this terminal, when one
could be determined. Present only when an opt-in `SessionStart` hook has
reported it (see the Settings → Agents page); absent otherwise — Silo
never *infers* a session id by directory/recency, since that can silently
resolve to the wrong session. Populated live once the hook fires (not
deferred to death), then persisted, so a consumer reacting to
`activity === "dead"` can read it back.

***

### resumeCommand?

```ts
readonly optional resumeCommand?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:167](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L167)

**`Beta`**

A ready-to-show (and copy/paste) resume hint. Either an exact
`"claude --resume 01abc..."` (when [AgentInfo.sessionId](#sessionid) was
resolved via a hook) or an honest, session-id-less
`"was running claude in ~/foo"` note (when it wasn't). Attached the first
time the terminal's agent is detected and persisted, so it is available
both live and at `activity === "dead"`.

***

### canResume

```ts
readonly canResume: boolean;
```

Defined in: [packages/sdk/src/agents-service.ts:188](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L188)

**`Beta`**

Whether this session can be resumed **through Silo** — i.e. whether
[AgentsService.resume](AgentsService.md#resume) will do something for this id.

- Terminal session: `true` once an exact session id was resolved (a
  Settings → Agents hook, or an agent's native session file), which is
  also when [AgentInfo.resumeCommand](#resumecommand) becomes exact rather than an
  honest note. `resume()` is still a no-op for a Terminal session in this
  release — the user runs `resumeCommand` themselves; the flag is the
  forward-looking capability signal RFC 0038 replaces the shell-string
  `resumeCommand` contract with.
- Chat session: `true` when the agent advertises `session/load`, so a
  fresh process can reload the transcript after the old one died.

- Chat session: `true` when the agent advertises **either**
  `sessionCapabilities.resume` or `agentCapabilities.loadSession` (RFC
  0042) — the two are distinct capabilities (see [ChatResumeState](../type-aliases/ChatResumeState.md))
  but either is enough for [AgentsService.resume](AgentsService.md#resume) to bring the
  conversation back.

***

### agentName?

```ts
readonly optional agentName?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:197](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L197)

**`Beta`**

Human-readable agent name, e.g. `"Claude Code"` or `"Codex CLI"`. Tells
you *which* agent CLI is running in this terminal, independent of
whether an exact session id was ever resolved — populated as soon as a
known agent leader is detected at all (same moment
[AgentInfo.resumeCommand](#resumecommand) is first attached), not deferred until
[AgentInfo.sessionId](#sessionid) is available.

***

### agentId?

```ts
readonly optional agentId?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:205](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L205)

**`Beta`**

Stable catalog key for the agent, e.g. `"claude"` or `"codex"` — unlike
[AgentInfo.agentName](#agentname) (a display string meant for showing to the
user), this is meant for an extension's own code to switch or compare
on, and won't change if the display name is ever reworded. Populated at
the same moment and lifecycle as `agentName`.

***

### chatResumeState?

```ts
readonly optional chatResumeState?: ChatResumeState;
```

Defined in: [packages/sdk/src/agents-service.ts:211](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L211)

**`Beta`**

For a `kind: "chat"` session, where it stands in **Chat session
resurrection** (RFC 0042) — absent for a `kind: "terminal"` session, which
has no such lifecycle. See [ChatResumeState](../type-aliases/ChatResumeState.md).
