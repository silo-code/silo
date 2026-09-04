# ~~Interface: TerminalTabDecorationProvider~~

Defined in: [packages/sdk/src/terminal-service.ts:96](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L96)

## Deprecated

Prefer [TerminalService.bindIndicator](TabAdornmentMethods.md#bindindicator). Terminal-only
trailing-indicator provider kept as a shim over the adornment registry.

## Properties

### ~~id~~

```ts
id: string;
```

Defined in: [packages/sdk/src/terminal-service.ts:98](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L98)

Unique id — conventionally `"<extension-id>.tab-decoration"`.

## Methods

### ~~provide()~~

```ts
provide(terminalId): 
  | TabIndicatorContribution
  | null;
```

Defined in: [packages/sdk/src/terminal-service.ts:103](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L103)

Called synchronously for each terminal tab during render. Return `null`
to contribute nothing for this terminal.

#### Parameters

##### terminalId

`string`

#### Returns

  \| [`TabIndicatorContribution`](../type-aliases/TabIndicatorContribution.md)
  \| `null`
