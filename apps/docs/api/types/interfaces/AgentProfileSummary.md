# Interface: AgentProfileSummary

Defined in: [packages/sdk/src/agents-service.ts:187](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L187)

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

Defined in: [packages/sdk/src/agents-service.ts:189](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L189)

**`Beta`**

Stable id — pass it to [AgentProfilesService.launch](AgentProfilesService.md#launch).

***

### label

```ts
readonly label: string;
```

Defined in: [packages/sdk/src/agents-service.ts:192](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L192)

**`Beta`**

The user's own name for this profile, e.g. `"Claude (work)"`. Show this;
 never show or parse the id.

***

### isDefault

```ts
readonly isDefault: boolean;
```

Defined in: [packages/sdk/src/agents-service.ts:196](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L196)

**`Beta`**

True for the single profile marked default, which is what `launch()`
 starts when no `profileId` is given. False for every profile when the
 user has not chosen one.

***

### acceptsPrompt

```ts
readonly acceptsPrompt: boolean;
```

Defined in: [packages/sdk/src/agents-service.ts:203](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L203)

**`Beta`**

Whether this profile's agent can be given an **opening prompt**. A static
fact about the agent, not about any particular launch — so a picker can
grey out or annotate a profile up front instead of discovering
`"agent-takes-none"` after the user has already typed one.
