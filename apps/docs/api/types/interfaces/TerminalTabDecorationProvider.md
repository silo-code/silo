# ~~Interface: TerminalTabDecorationProvider~~

Defined in: [packages/sdk/src/terminal-service.ts:48](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L48)

## Deprecated

Prefer [TerminalService.bindIndicator](TabAdornmentMethods.md#bindindicator). Terminal-only
trailing-indicator provider kept as a shim over the adornment registry.

## Properties

### ~~id~~

```ts
id: string;
```

Defined in: [packages/sdk/src/terminal-service.ts:50](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L50)

Unique id — conventionally `"<extension-id>.tab-decoration"`.

## Methods

### ~~provide()~~

```ts
provide(terminalId): 
  | TabIndicatorContribution
  | null;
```

Defined in: [packages/sdk/src/terminal-service.ts:55](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L55)

Called synchronously for each terminal tab during render. Return `null`
to contribute nothing for this terminal.

#### Parameters

##### terminalId

`string`

#### Returns

  \| [`TabIndicatorContribution`](../type-aliases/TabIndicatorContribution.md)
  \| `null`
