# Interface: AgentProfilesService

Defined in: [packages/sdk/src/agents-service.ts:339](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L339)

**`Beta`**

Read the user's **Agent Profiles** and start one, optionally with an opening
prompt — exposed as `ctx.agents.profiles` (RFC 0033).

A profile is a way to *start* a terminal, not a way to talk to an agent:
what comes up is a PTY running a real agent CLI, exactly as if the user had
typed the command themselves. There is no agent-agnostic messaging layer
here and there is not meant to be one.

There is deliberately no `pick()` — build one from `list()` and
`ctx.ui.showMenu`, which is the shared chrome — and no `get()`, which is
`list().find()`.

## Example

```ts
// Let the user choose a profile, then start it on a task.
const profiles = ctx.agents.profiles.list();
const chosen = await ctx.ui.showMenu(
  profiles.map((p) => ({ id: p.id, label: p.label })),
);
if (chosen) {
  const result = ctx.agents.profiles.launch({
    profileId: chosen,
    prompt: "Fix the failing test in src/foo.test.ts",
  });
  if (!result.ok) ctx.ui.notify("warn", `Couldn't start it: ${result.refusal}`);
}
```

## Methods

### list()

```ts
list(): readonly AgentProfileSummary[];
```

Defined in: [packages/sdk/src/agents-service.ts:345](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L345)

**`Beta`**

Every Agent Profile the user has defined, in the order they appear in
Settings. The returned array is **read-only and deeply frozen**; it is
recomputed when the profile list changes, not on every call.

#### Returns

readonly [`AgentProfileSummary`](AgentProfileSummary.md)[]

***

### launch()

```ts
launch(options?): LaunchAgentProfileResult;
```

Defined in: [packages/sdk/src/agents-service.ts:353](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L353)

**`Beta`**

Start a profile in a terminal. Returns the created terminal's id, or a
typed refusal — see [LaunchAgentProfileResult](../type-aliases/LaunchAgentProfileResult.md).

A refused prompt creates nothing at all: no terminal record, no workspace
activation, no focus change.

#### Parameters

##### options?

[`LaunchAgentProfileOptions`](LaunchAgentProfileOptions.md)

#### Returns

[`LaunchAgentProfileResult`](../type-aliases/LaunchAgentProfileResult.md)
