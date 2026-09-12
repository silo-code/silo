# Interface: CatalogAgentSummary

Defined in: [packages/sdk/src/agents-service.ts:247](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L247)

One Catalog Agent as an extension may read it through
[AgentsService.catalog](AgentsService.md#catalog). Read-only — detection stays sealed (ADR 0028)
and there is no way to register into the catalog.

## Properties

### id

```ts
readonly id: string;
```

Defined in: [packages/sdk/src/agents-service.ts:248](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L248)

***

### displayName

```ts
readonly displayName: string;
```

Defined in: [packages/sdk/src/agents-service.ts:249](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L249)

***

### icon?

```ts
readonly optional icon?: AgentIcon;
```

Defined in: [packages/sdk/src/agents-service.ts:250](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L250)
