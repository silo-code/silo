# Interface: AgentProfileSummary

Defined in: [packages/sdk/src/agents-service.ts:265](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L265)

**`Beta`**

One **Agent Profile** as an extension may read it through
[AgentProfilesService.list](AgentProfilesService.md#list) — a named recipe for starting a coding
agent in a terminal, defined by the user on Settings → Agents → Profiles.
Deliberately a summary, never the host's own profile record: the command
line, its config directory, and every other launch detail stay host-owned
(RFC 0033).

## Properties

### id

```ts
readonly id: string;
```

Defined in: [packages/sdk/src/agents-service.ts:267](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L267)

**`Beta`**

Stable id — pass it to [AgentProfilesService.launch](AgentProfilesService.md#launch).

***

### label

```ts
readonly label: string;
```

Defined in: [packages/sdk/src/agents-service.ts:270](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L270)

**`Beta`**

The user's own name for this profile, e.g. `"Claude (work)"`. Show this;
 never show or parse the id.

***

### isDefault

```ts
readonly isDefault: boolean;
```

Defined in: [packages/sdk/src/agents-service.ts:274](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L274)

**`Beta`**

True for the single profile marked default, which is what `launch()`
 starts when no `profileId` is given. False for every profile when the
 user has not chosen one.

***

### acceptsPrompt

```ts
readonly acceptsPrompt: boolean;
```

Defined in: [packages/sdk/src/agents-service.ts:281](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L281)

**`Beta`**

Whether this profile's agent can be given an **opening prompt**. A static
fact about the agent, not about any particular launch — so a picker can
grey out or annotate a profile up front instead of discovering
`"agent-takes-none"` after the user has already typed one.

***

### interface

```ts
readonly interface: AgentSessionKind;
```

Defined in: [packages/sdk/src/agents-service.ts:297](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L297)

**`Beta`**

Which **interface** this profile starts the agent through — the profile's
`launch` arm, expressed in the same [AgentSessionKind](../type-aliases/AgentSessionKind.md) vocabulary
`AgentInfo.kind` uses (RFC 0038):

- `"terminal"` — [AgentProfilesService.launch](AgentProfilesService.md#launch) runs it in a PTY and
  the agent draws its own TUI.
- `"chat"` — [AgentSessionsService.connect](AgentSessionsService.md#connect) speaks the Agent Client
  Protocol to it and *you* render the conversation.

The two are driven through different services, so a picker must filter on
this rather than offer every profile to both: `launch()`ing a Chat profile
and `connect()`ing a Terminal profile both fail, and the user should never
be offered a profile that cannot work in the surface they are looking at.
