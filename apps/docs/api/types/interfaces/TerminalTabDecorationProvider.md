# Interface: TerminalTabDecorationProvider

Defined in: [packages/sdk/src/terminal-service.ts:39](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L39)

A decoration provider for terminal tabs. Register via
[TerminalService.registerTabDecoration](TerminalService.md#registertabdecoration).

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/terminal-service.ts:41](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L41)

Unique id — conventionally `"<extension-id>.tab-decoration"`.

## Methods

### provide()

```ts
provide(terminalId): TerminalTabDecoration | null;
```

Defined in: [packages/sdk/src/terminal-service.ts:47](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L47)

Called synchronously for each terminal tab during render. Return `null`
to contribute nothing for this terminal. When multiple providers are
registered, the first non-null result wins.

#### Parameters

##### terminalId

`string`

#### Returns

[`TerminalTabDecoration`](TerminalTabDecoration.md) \| `null`
