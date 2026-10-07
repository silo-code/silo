# Interface: CatalogAgentSummary

Defined in: [packages/sdk/src/agents-service.ts:356](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L356)

One Catalog Agent as an extension may read it through
[AgentsService.catalog](AgentsService.md#catalog). Read-only — detection stays sealed (ADR 0028)
and there is no way to register into the catalog.

## Properties

### id

```ts
readonly id: string;
```

Defined in: [packages/sdk/src/agents-service.ts:357](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L357)

***

### displayName

```ts
readonly displayName: string;
```

Defined in: [packages/sdk/src/agents-service.ts:358](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L358)

***

### icon?

```ts
readonly optional icon?: AgentIcon;
```

Defined in: [packages/sdk/src/agents-service.ts:359](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L359)
