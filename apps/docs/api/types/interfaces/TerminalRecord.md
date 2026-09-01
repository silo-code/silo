# Interface: TerminalRecord

Defined in: [packages/sdk/src/domain-types.ts:36](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L36)

A terminal tab record in a workspace.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/domain-types.ts:37](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L37)

***

### sessionId

```ts
sessionId: string;
```

Defined in: [packages/sdk/src/domain-types.ts:38](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L38)

***

### kind

```ts
kind: TerminalKind;
```

Defined in: [packages/sdk/src/domain-types.ts:39](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L39)

***

### title

```ts
title: string;
```

Defined in: [packages/sdk/src/domain-types.ts:52](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L52)

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

Defined in: [packages/sdk/src/domain-types.ts:59](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L59)

A user-assigned name (via the tab's "Rename…" menu). When set, it wins over
the PTY-derived [TerminalRecord.title](#title) and stays put until the user
renames again or the terminal is closed. Cleared by renaming to an empty
string, which hands the title back to PTY auto-derivation.

***

### cwd?

```ts
optional cwd?: string;
```

Defined in: [packages/sdk/src/domain-types.ts:61](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L61)

Working directory override. Falls back to ws.folder when absent.

***

### lastActiveAt?

```ts
optional lastActiveAt?: string;
```

Defined in: [packages/sdk/src/domain-types.ts:63](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L63)

ISO timestamp of the last output we observed; used to pick a workspace's "primary" terminal.

***

### profileId?

```ts
optional profileId?: string;
```

Defined in: [packages/sdk/src/domain-types.ts:77](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L77)

The id of the Agent Profile this terminal was launched from (RFC 0033),
when Silo launched it with one. A terminal created any other way — "New
Terminal", the watermark, `core.newTerminal`, `ctx.terminals.create` — has
no `profileId`; Silo never guesses one for a hand-typed agent.

Written at launch and maintained by the host: renaming a profile's id
rewrites this, deleting the profile clears it. It is written and kept
current in phase 1 but not yet read — its first consumer is resume
composition (RFC 0033 phase 4).
