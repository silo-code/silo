# Interface: CatalogAgentSummary

Defined in: [packages/sdk/src/agents-service.ts:169](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L169)

One Catalog Agent as an extension may read it through
[AgentsService.catalog](AgentsService.md#catalog). Read-only — detection stays sealed (ADR 0028)
and there is no way to register into the catalog.

## Properties

### id

```ts
readonly id: string;
```

Defined in: [packages/sdk/src/agents-service.ts:170](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L170)

***

### displayName

```ts
readonly displayName: string;
```

Defined in: [packages/sdk/src/agents-service.ts:171](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L171)

***

### icon?

```ts
readonly optional icon?: AgentIcon;
```

Defined in: [packages/sdk/src/agents-service.ts:172](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L172)
