# Interface: SubscribeOutputOptions

Defined in: [packages/sdk/src/terminal-service.ts:59](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L59)

Options for [TerminalService.subscribeOutput](TerminalService.md#subscribeoutput) and
[TerminalService.subscribeOsc](TerminalService.md#subscribeosc).

## Properties

### includeReplay?

```ts
optional includeReplay?: boolean;
```

Defined in: [packages/sdk/src/terminal-service.ts:73](https://github.com/silo-code/silo/blob/main/packages/sdk/src/terminal-service.ts#L73)

Deliver the scrollback the session host replays when re-attaching to a
terminal, in addition to live output. Defaults to `false`.

Leave it off for anything that reads output as *activity* — "the agent is
working", "something just happened", a notification — because replayed
bytes would fire all of it for events that are already over.

Turn it on for anything that needs the terminal's *history*: rendering the
scrollback, or identifying which program is running in a terminal you have
only just attached to. Each chunk then arrives with an
[OutputOrigin](OutputOrigin.md) saying which kind it is.
