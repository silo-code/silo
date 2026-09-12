# Interface: CatalogAgentSummary

Defined in: [packages/sdk/src/agents-service.ts:293](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L293)

One Catalog Agent as an extension may read it through
[AgentsService.catalog](AgentsService.md#catalog). Read-only — detection stays sealed (ADR 0028)
and there is no way to register into the catalog.

## Properties

### id

```ts
readonly id: string;
```

Defined in: [packages/sdk/src/agents-service.ts:294](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L294)

***

### displayName

```ts
readonly displayName: string;
```

Defined in: [packages/sdk/src/agents-service.ts:295](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L295)

***

### icon?

```ts
readonly optional icon?: AgentIcon;
```

Defined in: [packages/sdk/src/agents-service.ts:296](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L296)
