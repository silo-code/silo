# Interface: AgentSessionsService

Defined in: [packages/sdk/src/agents-service.ts:1192](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1192)

**`Beta`**

Connect to a **Chat session** and drive it — exposed as
`ctx.agents.sessions` (RFC 0038 phase 2). The counterpart to
[AgentProfilesService](AgentProfilesService.md) for the `chat` launch arm: where `profiles`
*starts a terminal and walks away*, this *holds a live connection* an
extension can prompt, watch and cancel.

**Sourced from user-authored profiles only.** There is deliberately no
"connect to this command" — an extension cannot point Silo at an arbitrary
binary to spawn with pipes. The user defines a Chat profile on
Settings → Agents; an extension names it.

Needs the **`"agents"` [Permission](../type-aliases/Permission.md)**, declared in the extension's
`silo.permissions` and granted at install: [connect](#connect) throws without it.

## Example

```ts
const session = await ctx.agents.sessions.connect("claude-chat");
const off = session.onUpdate((u) => {
  if (u.kind === "agent_message_chunk") appendToTranscript(u.messageId, u.text);
});
const result = await session.prompt([{ type: "text", text: "Explain this repo." }]);
ctx.log.info(`turn ended: ${result.stopReason}`);
ctx.subscriptions.push(off, { dispose: () => session.dispose() });
```

## Methods

### connect()

```ts
connect(profileId, options?): Promise<AgentSessionHandle>;
```

Defined in: [packages/sdk/src/agents-service.ts:1212](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1212)

**`Beta`**

Spawn the agent for the named Chat profile, run the Agent Client Protocol
`initialize` + `session/new` handshake, and resolve with a live
[AgentSessionHandle](AgentSessionHandle.md).

Rejects when: the extension lacks the `"agents"` permission; no profile has
that id; the profile is a Terminal profile, not a Chat one; there is no
target workspace; the agent needs authentication (its `session/new`
failed); or the agent reported a startup error (the rejection carries its
message).

With [AgentSessionConnectOptions.resume](AgentSessionConnectOptions.md#resume), `connect()` still never
rejects merely because the target has gone stale — it falls all the way
through to a fresh `session/new` (RFC 0042); see [AgentSessionHandle.resumeOutcome](AgentSessionHandle.md#resumeoutcome).

#### Parameters

##### profileId

`string`

— an [AgentProfileSummary.id](AgentProfileSummary.md#id) whose profile uses the
`chat` launch arm.

##### options?

[`AgentSessionConnectOptions`](AgentSessionConnectOptions.md)

#### Returns

`Promise`\<[`AgentSessionHandle`](AgentSessionHandle.md)\>

***

### readJournal()

```ts
readJournal(sessionId, options?): Promise<readonly AgentSessionUpdate[]>;
```

Defined in: [packages/sdk/src/agents-service.ts:1230](https://github.com/silo-code/silo/blob/main/packages/sdk/src/agents-service.ts#L1230)

**`Beta`**

Read a session's **transcript journal** (RFC 0042) without connecting —
for painting a restored panel *before* `connect({ resume })` resolves,
which itself also pays for the `session/resume` / `session/load` network
round trip. This is the "paint from journal" half of the restore flow;
`connect()` is the "reconnect the agent" half, and the two run
independently on purpose.

Resolves `[]` for a session that never wrote a journal entry, or an
unknown id — never rejects on a merely-missing journal. Needs the
`"agents"` [Permission](../type-aliases/Permission.md), same as [connect](#connect).

#### Parameters

##### sessionId

`string`

— an [AgentSessionHandle.sessionId](AgentSessionHandle.md#sessionid).

##### options?

###### workspaceId?

`string`

#### Returns

`Promise`\<readonly [`AgentSessionUpdate`](AgentSessionUpdate.md)[]\>
