# Interface: AgentPermissionOption

Defined in: [packages/sdk/src/agents-service.ts:920](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L920)

**`Beta`**

One choice offered by an [AgentPermissionRequest](AgentPermissionRequest.md) — pass its
[AgentPermissionOption.optionId](#optionid) to [AgentPermissionRequest.respond](AgentPermissionRequest.md#respond).

## Properties

### optionId

```ts
readonly optionId: string;
```

Defined in: [packages/sdk/src/agents-service.ts:921](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L921)

**`Beta`**

***

### name

```ts
readonly name: string;
```

Defined in: [packages/sdk/src/agents-service.ts:924](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L924)

**`Beta`**

Label to show on the button, e.g. `"Allow"`, `"Allow for this session"`,
 `"Reject"`.

***

### kind

```ts
readonly kind: string;
```

Defined in: [packages/sdk/src/agents-service.ts:928](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L928)

**`Beta`**

The protocol's coarse category for the option, e.g. `"allow_once"`,
 `"allow_always"`, `"reject_once"` — for styling a set of buttons
 consistently. Tolerate unknown values.
