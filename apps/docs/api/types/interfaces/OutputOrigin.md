# Interface: OutputOrigin

Defined in: [packages/sdk/src/terminal-service.ts:41](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L41)

Where a chunk of terminal output came from in time.

A terminal session outlives the app, so re-attaching to one replays the
session host's recent scrollback — bytes that are byte-for-byte identical to
live output but describe things that already happened, sometimes long ago.
Treating them as live is what makes a reattached agent terminal announce a
turn that finished before the app started.

## Properties

### replay

```ts
replay: boolean;
```

Defined in: [packages/sdk/src/terminal-service.ts:49](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L49)

`true` when the chunk is scrollback the session host is replaying on
attach, `false` when the session produced it just now.

Only ever `true` for a subscription that opted in with
[SubscribeOutputOptions.includeReplay](SubscribeOutputOptions.md#includereplay).
