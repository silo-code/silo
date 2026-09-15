# Interface: AgentSessionConfigOption

Defined in: [packages/sdk/src/agents-service.ts:925](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L925)

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

Defined in: [packages/sdk/src/agents-service.ts:927](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L927)

**`Beta`**

Stable id — pass it to [AgentSessionHandle.setConfigOption](AgentSessionHandle.md#setconfigoption).

***

### name

```ts
readonly name: string;
```

Defined in: [packages/sdk/src/agents-service.ts:929](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L929)

**`Beta`**

Label for the control, e.g. `"Mode"`, `"Model"`.

***

### description?

```ts
readonly optional description?: string;
```

Defined in: [packages/sdk/src/agents-service.ts:931](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L931)

**`Beta`**

A longer explanation, when the agent gave one.

***

### category

```ts
readonly category: string;
```

Defined in: [packages/sdk/src/agents-service.ts:937](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L937)

**`Beta`**

The protocol category that decides how a write is delivered — `"mode"`,
`"model"`, or a vendor's own. [AgentSessionHandle.setConfigOption](AgentSessionHandle.md#setconfigoption)
rejects a category with no verified writer.

***

### type

```ts
readonly type: string;
```

Defined in: [packages/sdk/src/agents-service.ts:942](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L942)

**`Beta`**

The control shape. Only `"select"` is modelled today; treat any other
value as "do not render".

***

### currentValue

```ts
readonly currentValue: string;
```

Defined in: [packages/sdk/src/agents-service.ts:949](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L949)

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

Defined in: [packages/sdk/src/agents-service.ts:951](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L951)

**`Beta`**

The choices, in the agent's order.
