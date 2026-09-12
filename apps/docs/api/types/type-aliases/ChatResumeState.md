# Type Alias: ChatResumeState

```ts
type ChatResumeState = 
  | "dormant"
  | "live"
  | "resuming"
  | "resumed"
  | "journal-only"
  | "unavailable";
```

Defined in: [packages/sdk/src/agents-service.ts:240](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L240)

**`Beta`**

Where a **Chat** Agent Session stands in Chat session resurrection (RFC
0042) — bringing its transcript, and the ability to keep talking, back after
its process died with the app.

- `"dormant"` — known only from persistence: the conversation exists and its
  panel is recorded, but nothing has connected to it this run and no agent
  process is alive. This is what a Chat session in a workspace you have not
  visited since launching looks like — listing it is the point, and opening
  it is what starts the reconnect. Its `activity` is always `"idle"`.
- `"live"` — an ordinary, uninterrupted connection (a plain `session/new`
  this run; never went through the resume machinery).
- `"resuming"` — a restore is in flight: `session/resume` or `session/load`
  is being probed and called.
- `"resumed"` — reconnected: `session/resume` (no replay, the transcript
  comes from the **transcript journal**) or `session/load` (replay,
  reconciled against the journal) succeeded.
- `"journal-only"` — the agent could do neither; the transcript is the
  journal alone and the session cannot be prompted in place — the panel's
  own "Continue in a new session" action is the way forward.
- `"unavailable"` — no session id and no journal; nothing to show.
