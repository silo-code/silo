# Interface: AgentSessionConfigOption

Defined in: [packages/sdk/src/agents-service.ts:893](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L893)

**`Beta`**

One session-level control the agent advertised at connect — the Agent Client
Protocol `session/new` `configOptions` list (recon 2026-09-08). It is
**self-describing and subsumes** the older `modes` / `models` fields: Cursor
advertises a `"mode"` entry and a `"model"` entry, Claude a single `"mode"`
entry (its permission mode), and a vendor may add its own.

The write path is **generic too**:
[AgentSessionHandle.setConfigOption](AgentSessionHandle.md#setconfigoption) goes through the protocol's
`session/set_config_option`, so a category Silo has never heard of still
works — Claude's `"thought_level"` (Effort) has no typed method anywhere in
the protocol and sets fine. Silo keeps `session/set_mode` /
`session/set_model` only as a fallback for an agent that does not implement
the generic setter.

Render one control per entry and **skip an entry whose [type](#type) you do
not recognise** — the same tolerance rule [AgentSessionUpdate](AgentSessionUpdate.md) follows
for unknown `kind`s. Do not assume every advertised entry is settable: an
adapter may list an id its own handler rejects, so treat a failed
[AgentSessionHandle.setConfigOption](AgentSessionHandle.md#setconfigoption) as "stop offering this one".

## Properties

### id

```ts
readonly id: string;
```

Defined in: [packages/sdk/src/agents-service.ts:895](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L895)

**`Beta`**

Stable id — pass it to [AgentSessionHandle.setConfigOption](AgentSessionHandle.md#setconfigoption).

***

### name

```ts
readonly name: string;
```

Defined in: [packages/sdk/src/agents-service.ts:897](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L897)

**`Beta`**

Label for the control, e.g. `"Mode"`, `"Model"`.

***

### description?

```ts
readonly optional description?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:899](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L899)

**`Beta`**

A longer explanation, when the agent gave one.

***

### category

```ts
readonly category: string;
```

Defined in: [packages/sdk/src/agents-service.ts:905](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L905)

**`Beta`**

The protocol category that decides how a write is delivered — `"mode"`,
`"model"`, or a vendor's own. [AgentSessionHandle.setConfigOption](AgentSessionHandle.md#setconfigoption)
rejects a category with no verified writer.

***

### type

```ts
readonly type: string;
```

Defined in: [packages/sdk/src/agents-service.ts:910](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L910)

**`Beta`**

The control shape. Only `"select"` is modelled today; treat any other
value as "do not render".

***

### currentValue

```ts
readonly currentValue: string;
```

Defined in: [packages/sdk/src/agents-service.ts:917](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L917)

**`Beta`**

The currently-selected [AgentSessionConfigChoice.value](AgentSessionConfigChoice.md#value). Kept
current when the agent moves it itself (an ACP `current_mode_update`), so
a bound control always reflects reality — subscribe with
[AgentSessionHandle.onConfigOptionsChanged](AgentSessionHandle.md#onconfigoptionschanged).

***

### options

```ts
readonly options: readonly AgentSessionConfigChoice[];
```

Defined in: [packages/sdk/src/agents-service.ts:919](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L919)

**`Beta`**

The choices, in the agent's order.
