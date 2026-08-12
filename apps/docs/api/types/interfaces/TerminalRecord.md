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

Defined in: [packages/sdk/src/domain-types.ts:41](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L41)

The auto-derived tab title: the window title the running program pushed via
an OSC escape sequence, else its process name, else the tmux status line.

Agent **status markers are stripped** from this (Claude's `◐`/`✳`, Codex's
braille spinner and `[ ! ]`, Cursor's trailing ` - Working …`) unless the
user turns off "Hide status glyphs in tab titles" in Settings → Agents — the
status is already available as structured state via `ctx.agents`, so the
glyph would be redundant here. Don't parse this field to detect agent
activity; use `ctx.agents`, or `ctx.terminals.subscribeOsc` for the raw
(never-stripped) sequences.

***

### customName?

```ts
optional customName?: string;
```

Defined in: [packages/sdk/src/domain-types.ts:48](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L48)

A user-assigned name (via the tab's "Rename…" menu). When set, it wins over
the PTY-derived [TerminalRecord.title](#title) and stays put until the user
renames again or the terminal is closed. Cleared by renaming to an empty
string, which hands the title back to PTY auto-derivation.

***

### cwd?

```ts
optional cwd?: string;
```

Defined in: [packages/sdk/src/domain-types.ts:50](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L50)

Working directory override. Falls back to ws.folder when absent.

***

### lastActiveAt?

```ts
optional lastActiveAt?: string;
```

Defined in: [packages/sdk/src/domain-types.ts:52](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L52)

ISO timestamp of the last output we observed; used to pick a workspace's "primary" terminal.
