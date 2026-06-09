# Interface: CreateTerminalInput

Defined in: [packages/sdk/src/terminal-service.ts:12](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L12)

Input for [TerminalService.create](TerminalService.md#create).

## Properties

### kind?

```ts
optional kind?: TerminalKind;
```

Defined in: [packages/sdk/src/terminal-service.ts:14](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L14)

Terminal kind — `"shell"` (default), `"claude"`, or `"pi"`.

***

### cwd?

```ts
optional cwd?: string;
```

Defined in: [packages/sdk/src/terminal-service.ts:16](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L16)

Working directory; falls back to the workspace folder when absent.

***

### workspaceId?

```ts
optional workspaceId?: string;
```

Defined in: [packages/sdk/src/terminal-service.ts:18](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L18)

Target workspace; defaults to the active workspace.
