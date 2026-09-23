# Interface: AgentSessionUsage

Defined in: [packages/sdk/src/agents-service.ts:779](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L779)

**`Beta`**

Session context/cost state from a `usage_update` — the protocol's own
`used` / `size` naming. **Sender-optional**: many agents never emit this,
and those that do report `used` and `size` differently (recon), so a
missing [AgentSessionUpdate.usage](AgentSessionUpdate.md#usage) on a given update is normal, not
an error — never synthesize a reading when the agent hasn't sent one.

## Properties

### used

```ts
readonly used: number;
```

Defined in: [packages/sdk/src/agents-service.ts:781](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L781)

**`Beta`**

Tokens currently consumed in the session context.

***

### size

```ts
readonly size: number;
```

Defined in: [packages/sdk/src/agents-service.ts:783](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L783)

**`Beta`**

Total token capacity for the session.

***

### cost?

```ts
readonly optional cost?: object;
```

Defined in: [packages/sdk/src/agents-service.ts:785](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L785)

**`Beta`**

Cumulative session cost, when the agent reports one.

#### amount

```ts
readonly amount: number;
```

#### currency

```ts
readonly currency: string;
```

ISO 4217 currency code, e.g. `"USD"`.
