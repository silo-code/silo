# Interface: CreateTerminalInput

Defined in: [packages/sdk/src/terminal-service.ts:76](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L76)

Input for [TerminalService.create](TerminalService.md#create).

## Properties

### kind?

```ts
optional kind?: TerminalKind;
```

Defined in: [packages/sdk/src/terminal-service.ts:78](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L78)

Terminal kind — `"shell"` (default), `"claude"`, or `"pi"`.

***

### cwd?

```ts
optional cwd?: string;
```

Defined in: [packages/sdk/src/terminal-service.ts:80](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L80)

Working directory; falls back to the workspace folder when absent.

***

### workspaceId?

```ts
optional workspaceId?: string;
```

Defined in: [packages/sdk/src/terminal-service.ts:82](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L82)

Target workspace; defaults to the active workspace.
