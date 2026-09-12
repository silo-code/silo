# Interface: AgentPermissionOption

Defined in: [packages/sdk/src/agents-service.ts:754](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L754)

**`Beta`**

One choice offered by an [AgentPermissionRequest](AgentPermissionRequest.md) — pass its
[AgentPermissionOption.optionId](#optionid) to [AgentPermissionRequest.respond](AgentPermissionRequest.md#respond).

## Properties

### optionId

```ts
readonly optionId: string;
```

Defined in: [packages/sdk/src/agents-service.ts:755](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L755)

**`Beta`**

***

### name

```ts
readonly name: string;
```

Defined in: [packages/sdk/src/agents-service.ts:758](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L758)

**`Beta`**

Label to show on the button, e.g. `"Allow"`, `"Allow for this session"`,
 `"Reject"`.

***

### kind

```ts
readonly kind: string;
```

Defined in: [packages/sdk/src/agents-service.ts:762](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L762)

**`Beta`**

The protocol's coarse category for the option, e.g. `"allow_once"`,
 `"allow_always"`, `"reject_once"` — for styling a set of buttons
 consistently. Tolerate unknown values.
