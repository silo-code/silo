# Interface: TerminalTabDecorationProvider

Defined in: [packages/sdk/src/terminal-service.ts:59](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L59)

A decoration provider for terminal tabs. Register via
[TerminalService.registerTabDecoration](TerminalService.md#registertabdecoration).

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/terminal-service.ts:61](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L61)

Unique id — conventionally `"<extension-id>.tab-decoration"`.

## Methods

### provide()

```ts
provide(terminalId): TerminalTabDecoration | null;
```

Defined in: [packages/sdk/src/terminal-service.ts:67](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L67)

Called synchronously for each terminal tab during render. Return `null`
to contribute nothing for this terminal. When multiple providers are
registered, the first non-null result wins.

#### Parameters

##### terminalId

`string`

#### Returns

[`TerminalTabDecoration`](TerminalTabDecoration.md) \| `null`
