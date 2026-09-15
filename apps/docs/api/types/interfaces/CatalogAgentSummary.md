# Interface: CatalogAgentSummary

Defined in: [packages/sdk/src/agents-service.ts:309](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L309)

One Catalog Agent as an extension may read it through
[AgentsService.catalog](AgentsService.md#catalog). Read-only — detection stays sealed (ADR 0028)
and there is no way to register into the catalog.

## Properties

### id

```ts
readonly id: string;
```

Defined in: [packages/sdk/src/agents-service.ts:310](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L310)

***

### displayName

```ts
readonly displayName: string;
```

Defined in: [packages/sdk/src/agents-service.ts:311](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L311)

***

### icon?

```ts
readonly optional icon?: AgentIcon;
```

Defined in: [packages/sdk/src/agents-service.ts:312](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L312)
