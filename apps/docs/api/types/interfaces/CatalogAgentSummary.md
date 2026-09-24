# Interface: CatalogAgentSummary

Defined in: [packages/sdk/src/agents-service.ts:325](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L325)

One Catalog Agent as an extension may read it through
[AgentsService.catalog](AgentsService.md#catalog). Read-only — detection stays sealed (ADR 0028)
and there is no way to register into the catalog.

## Properties

### id

```ts
readonly id: string;
```

Defined in: [packages/sdk/src/agents-service.ts:326](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L326)

***

### displayName

```ts
readonly displayName: string;
```

Defined in: [packages/sdk/src/agents-service.ts:327](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L327)

***

### icon?

```ts
readonly optional icon?: AgentIcon;
```

Defined in: [packages/sdk/src/agents-service.ts:328](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L328)
