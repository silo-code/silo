# Interface: CatalogAgentSummary

Defined in: [packages/sdk/src/agents-service.ts:220](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L220)

One Catalog Agent as an extension may read it through
[AgentsService.catalog](AgentsService.md#catalog). Read-only — detection stays sealed (ADR 0028)
and there is no way to register into the catalog.

## Properties

### id

```ts
readonly id: string;
```

Defined in: [packages/sdk/src/agents-service.ts:221](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L221)

***

### displayName

```ts
readonly displayName: string;
```

Defined in: [packages/sdk/src/agents-service.ts:222](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L222)

***

### icon?

```ts
readonly optional icon?: AgentIcon;
```

Defined in: [packages/sdk/src/agents-service.ts:223](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L223)
