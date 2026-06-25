# Interface: OscEvent

Defined in: [packages/sdk/src/terminal-service.ts:18](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L18)

A parsed OSC (Operating System Command) escape sequence emitted by a
terminal program. Delivered by [TerminalService.subscribeOsc](TerminalService.md#subscribeosc).

Common codes:
- `0` — set window/tab title (e.g. Claude Code encodes busy/idle state here)
- `7` — working directory (`file://host/path`)
- `9` — iTerm2 notifications (attention, progress)
- `133` — shell prompt markers (semantic shell integration)

## Properties

### code

```ts
code: number;
```

Defined in: [packages/sdk/src/terminal-service.ts:20](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L20)

The numeric OSC code (the integer before the first semicolon).

***

### payload

```ts
payload: string;
```

Defined in: [packages/sdk/src/terminal-service.ts:22](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L22)

The raw payload string after the code and its separating semicolon.
