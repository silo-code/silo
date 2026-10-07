# Interface: CatalogAgentSummary

Defined in: [packages/sdk/src/agents-service.ts:343](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L343)

One Catalog Agent as an extension may read it through
[AgentsService.catalog](AgentsService.md#catalog). Read-only — detection stays sealed (ADR 0028)
and there is no way to register into the catalog.

## Properties

### id

```ts
readonly id: string;
```

Defined in: [packages/sdk/src/agents-service.ts:344](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L344)

***

### displayName

```ts
readonly displayName: string;
```

Defined in: [packages/sdk/src/agents-service.ts:345](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L345)

***

### icon?

```ts
readonly optional icon?: AgentIcon;
```

Defined in: [packages/sdk/src/agents-service.ts:346](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L346)
