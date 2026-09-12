# Interface: AgentPermissionOption

Defined in: [packages/sdk/src/agents-service.ts:530](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L530)

**`Beta`**

One choice offered by an [AgentPermissionRequest](AgentPermissionRequest.md) — pass its
[AgentPermissionOption.optionId](#optionid) to [AgentPermissionRequest.respond](AgentPermissionRequest.md#respond).

## Properties

### optionId

```ts
readonly optionId: string;
```

Defined in: [packages/sdk/src/agents-service.ts:531](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L531)

**`Beta`**

***

### name

```ts
readonly name: string;
```

Defined in: [packages/sdk/src/agents-service.ts:534](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L534)

**`Beta`**

Label to show on the button, e.g. `"Allow"`, `"Allow for this session"`,
 `"Reject"`.

***

### kind

```ts
readonly kind: string;
```

Defined in: [packages/sdk/src/agents-service.ts:538](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L538)

**`Beta`**

The protocol's coarse category for the option, e.g. `"allow_once"`,
 `"allow_always"`, `"reject_once"` — for styling a set of buttons
 consistently. Tolerate unknown values.
