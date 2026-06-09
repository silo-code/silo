# Interface: TerminalRecord

Defined in: [packages/sdk/src/domain-types.ts:25](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L25)

A terminal tab record in a workspace.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/domain-types.ts:26](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L26)

***

### sessionId

```ts
sessionId: string;
```

Defined in: [packages/sdk/src/domain-types.ts:27](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L27)

***

### kind

```ts
kind: TerminalKind;
```

Defined in: [packages/sdk/src/domain-types.ts:28](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L28)

***

### title

```ts
title: string;
```

Defined in: [packages/sdk/src/domain-types.ts:29](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L29)

***

### customName?

```ts
optional customName?: string;
```

Defined in: [packages/sdk/src/domain-types.ts:36](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L36)

A user-assigned name (via the tab's "Rename…" menu). When set, it wins over
the PTY-derived [TerminalRecord.title](#title) and stays put until the user
renames again or the terminal is closed. Cleared by renaming to an empty
string, which hands the title back to PTY auto-derivation.

***

### cwd?

```ts
optional cwd?: string;
```

Defined in: [packages/sdk/src/domain-types.ts:38](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L38)

Working directory override. Falls back to ws.folder when absent.

***

### lastActiveAt?

```ts
optional lastActiveAt?: string;
```

Defined in: [packages/sdk/src/domain-types.ts:40](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L40)

ISO timestamp of the last output we observed; used to pick a workspace's "primary" terminal.
