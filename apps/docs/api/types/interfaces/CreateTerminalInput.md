# Interface: CreateTerminalInput

Defined in: [packages/sdk/src/terminal-service.ts:64](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L64)

Input for [TerminalService.create](TerminalService.md#create).

## Properties

### kind?

```ts
optional kind?: TerminalKind;
```

Defined in: [packages/sdk/src/terminal-service.ts:66](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L66)

Terminal kind — `"shell"` (default), `"claude"`, or `"pi"`.

***

### cwd?

```ts
optional cwd?: string;
```

Defined in: [packages/sdk/src/terminal-service.ts:68](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L68)

Working directory; falls back to the workspace folder when absent.

***

### workspaceId?

```ts
optional workspaceId?: string;
```

Defined in: [packages/sdk/src/terminal-service.ts:70](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L70)

Target workspace; defaults to the active workspace.
