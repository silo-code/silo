# Interface: CreateTerminalInput

Defined in: [packages/sdk/src/terminal-service.ts:65](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L65)

Input for [TerminalService.create](TerminalService.md#create).

## Properties

### ~~kind?~~

```ts
optional kind?: TerminalKind;
```

Defined in: [packages/sdk/src/terminal-service.ts:74](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L74)

Terminal kind. Defaults to `"shell"`.

#### Deprecated

Pass `"shell"` (or omit). The `"claude"` / `"pi"` values are
kept for compatibility (RFC 0033): they create a `"shell"` terminal and, if
a matching Agent Profile exists, launch it — otherwise the bare command is
typed. Start agents via an Agent Profile instead.

***

### cwd?

```ts
optional cwd?: string;
```

Defined in: [packages/sdk/src/terminal-service.ts:76](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L76)

Working directory; falls back to the workspace folder when absent.

***

### workspaceId?

```ts
optional workspaceId?: string;
```

Defined in: [packages/sdk/src/terminal-service.ts:78](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L78)

Target workspace; defaults to the active workspace.
