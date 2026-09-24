# Interface: AgentPermissionOption

Defined in: [packages/sdk/src/agents-service.ts:888](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L888)

**`Beta`**

One choice offered by an [AgentPermissionRequest](AgentPermissionRequest.md) — pass its
[AgentPermissionOption.optionId](#optionid) to [AgentPermissionRequest.respond](AgentPermissionRequest.md#respond).

## Properties

### optionId

```ts
readonly optionId: string;
```

Defined in: [packages/sdk/src/agents-service.ts:889](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L889)

**`Beta`**

***

### name

```ts
readonly name: string;
```

Defined in: [packages/sdk/src/agents-service.ts:892](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L892)

**`Beta`**

Label to show on the button, e.g. `"Allow"`, `"Allow for this session"`,
 `"Reject"`.

***

### kind

```ts
readonly kind: string;
```

Defined in: [packages/sdk/src/agents-service.ts:896](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L896)

**`Beta`**

The protocol's coarse category for the option, e.g. `"allow_once"`,
 `"allow_always"`, `"reject_once"` — for styling a set of buttons
 consistently. Tolerate unknown values.
