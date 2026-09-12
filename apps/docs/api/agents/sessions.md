# ctx.agents.sessions <Badge type="warning" text="beta" />

Connect to a **Chat session** and drive it — the counterpart to
[`ctx.agents.profiles`](/api/agents/profiles) for the `chat` launch arm.
Where `profiles.launch()` _starts a terminal and walks away_,
`sessions.connect()` _holds a live connection_: an
[Agent Client Protocol](https://agentclientprotocol.com) child speaking
structured JSON-RPC over piped stdio, which an extension can prompt, watch, and
cancel.

```ts
ctx.agents.sessions: AgentSessionsService
```

**Sourced from user-authored profiles only.** There is no "connect to this
command" — an extension names a Chat profile the user defined on
**Settings → Agents**; it cannot point Silo at an arbitrary binary to spawn
with pipes.

**Gated on the `chatAgents` setting** (RFC 0038, off by default): every
`connect()` rejects while it is off.

The same session appears in [`ctx.agents`](/api/agents/) as an `AgentInfo` with
`kind: "chat"` and the handle's `id` — so the Agents navigator, attention
badges, and status all work for it with no extra wiring, exactly as for a
Terminal session.

## Example

### Drive one turn and render the stream

```ts
const session = await ctx.agents.sessions.connect("claude-chat");

const offUpdate = session.onUpdate((u) => {
  if (u.kind === "agent_message_chunk" && u.text) {
    appendBubble(u.messageId, u.text); // consecutive chunks share messageId
  }
});

const offPermission = session.onPermission((req) => {
  // The agent is blocked until you answer. This is NOT a safety boundary —
  // an agent can touch the filesystem without asking.
  req.respond(req.options[0].optionId);
});

const result = await session.prompt([
  { type: "text", text: "Summarise what this repo does." },
]);
ctx.log.info(`turn ended: ${result.stopReason}`);

ctx.subscriptions.push(offUpdate, offPermission, {
  dispose: () => session.dispose(),
});
```

### Cancel a runaway turn

```ts
const turn = session.prompt([{ type: "text", text: "Refactor everything." }]);
// ...user hits stop:
session.cancel();
const { stopReason } = await turn; // "cancelled" — the promise resolves, not rejects
```

## Reveal: let Silo focus your UI

`ctx.agents.reveal(id)` is the kind-agnostic "bring this agent into view" verb
— the Agents navigator, a command, a notification all call it without knowing
whether the session is a terminal tab or a transcript. Silo can activate the
session's workspace on its own; only you know how to focus **your** UI, so pass
it at connect time:

```ts
const session = await ctx.agents.sessions.connect(profileId, {
  reveal: () => apiRef.current.setActive(), // a dock panel focusing its tab
});
```

It is called after an `await`, possibly more than once, so read the handle you
need through a ref rather than closing over one render's props. Omit it and
`reveal(id)` still activates the workspace — which is all Silo can honestly do
for a surface it does not own.

## Content blocks

A prompt is **structured blocks**, never a shell string — the entire
quoting/escaping risk surface of a Terminal session's opening prompt does not
exist here.

| Block                                   | Meaning                                                            |
| --------------------------------------- | ------------------------------------------------------------------ |
| `{ type: "text", text }`                | A run of plain text. `$HOME`, backticks, newlines — all literal.   |
| `{ type: "resource_link", uri, name? }` | A pointer to a file (usually a `file://` path) the agent may read. |

Images and embedded binary context are deferred behind what the agent
advertises at connect time.

## The update stream

`onUpdate` delivers each Agent Client Protocol `session/update`, lightly
normalized to `{ kind, text?, messageId?, raw }`. **Tolerate `kind` values you
don't recognize** — agents emit different subsets and vendors add their own.
Switch on the kinds you render (`agent_message_chunk`, `agent_thought_chunk`,
`tool_call`, `tool_call_update`, `plan`, …) and ignore the rest; the full
Agent Client Protocol object is on `raw`.

`messageId` groups a run of streaming chunks into one bubble — **synthesized by
Silo when the agent omits it**, which real agents do, so you never have to mint
ids yourself.

## Resume

`AgentSessionHandle.canResume` (and `AgentInfo.canResume`) is `true` when the
agent advertises `session/load`. The agent process is a piped child of Silo and
does **not** survive the app closing — but the agent keeps the transcript on
its side, so [`ctx.agents.resume(id)`](/api/agents/) spawns a fresh process and
loads the conversation back. Full restore-on-mount wiring lands in a later
phase.

## Reasons `connect()` rejects

- the `chatAgents` setting is off;
- no profile has that id;
- the profile is a **Terminal** profile, not a Chat one;
- there is no target workspace;
- the agent needs authentication — its `session/new` failed (a non-empty
  `authMethods` list does **not** by itself mean auth is required);
- the agent reported a startup or business error — the rejection carries its
  own message.

## See also

- [`AgentSessionsService`](/api/types/interfaces/AgentSessionsService)
- [`AgentSessionHandle`](/api/types/interfaces/AgentSessionHandle)
- [`AgentSessionConnectOptions`](/api/types/interfaces/AgentSessionConnectOptions)
- [`AgentPromptBlock`](/api/types/type-aliases/AgentPromptBlock)
- [`AgentPromptResult`](/api/types/interfaces/AgentPromptResult)
- [`AgentStopReason`](/api/types/type-aliases/AgentStopReason)
- [`AgentSessionUpdate`](/api/types/interfaces/AgentSessionUpdate)
- [`AgentPermissionRequest`](/api/types/interfaces/AgentPermissionRequest)
- [`AgentPermissionOption`](/api/types/interfaces/AgentPermissionOption)
- [`ctx.agents`](/api/agents/) — the shared activity/status view both session kinds feed
- [`ctx.agents.profiles`](/api/agents/profiles) — start a Terminal session instead
- RFC 0038 — Agent Sessions (Terminal and Chat)
