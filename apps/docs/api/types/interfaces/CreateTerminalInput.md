# Interface: CreateTerminalInput

Defined in: [packages/sdk/src/terminal-service.ts:56](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L56)

Input for [TerminalService.create](TerminalService.md#create).

## Properties

### kind?

```ts
optional kind?: TerminalKind;
```

Defined in: [packages/sdk/src/terminal-service.ts:58](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L58)

Terminal kind — `"shell"` (default), `"claude"`, or `"pi"`.

***

### cwd?

```ts
optional cwd?: string;
```

Defined in: [packages/sdk/src/terminal-service.ts:60](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L60)

Working directory; falls back to the workspace folder when absent.

***

### workspaceId?

```ts
optional workspaceId?: string;
```

Defined in: [packages/sdk/src/terminal-service.ts:62](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L62)

Target workspace; defaults to the active workspace.
