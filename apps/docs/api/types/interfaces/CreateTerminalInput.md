# Interface: CreateTerminalInput

Defined in: [packages/sdk/src/terminal-service.ts:65](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L65)

Input for [TerminalService.create](TerminalService.md#create).

## Properties

### kind?

```ts
optional kind?: TerminalKind;
```

Defined in: [packages/sdk/src/terminal-service.ts:67](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L67)

Terminal kind — `"shell"` (default), `"claude"`, or `"pi"`.

***

### cwd?

```ts
optional cwd?: string;
```

Defined in: [packages/sdk/src/terminal-service.ts:69](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L69)

Working directory; falls back to the workspace folder when absent.

***

### workspaceId?

```ts
optional workspaceId?: string;
```

Defined in: [packages/sdk/src/terminal-service.ts:71](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L71)

Target workspace; defaults to the active workspace.
