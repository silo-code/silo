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

**Needs the `"agents"` permission** — declare it in your extension's
`silo.permissions` (it is shown at install, like `fs:read`). Every `connect()`
throws without it.

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
  // `req.toolCall` is the call it wants to make, in the same shape the update
  // stream carries — so you can show the diff before they answer.
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

## Being the place a Chat profile opens

A profile whose `interface` is `"chat"` cannot be launched into a terminal, so
the gestures that start an agent — a dock's **+** menu, the profile's
`core.newAgent.<id>` command — need a panel to open instead. Declare
[`chatProfileHost`](/api/registration/register-dock-panel-kind) on your dock
panel kind and Silo opens yours, passing `params.profileId`:

```tsx
ctx.registerDockPanelKind({
  id: "acme.chat",
  component: AcmeChatPanel, // reads params.profileId, calls connect()
  chatProfileHost: true,
});
```

Without it your panel still works — the user just has to reach it your way
rather than through the profile list.

## Content blocks

A prompt is **structured blocks**, never a shell string — the entire
quoting/escaping risk surface of a Terminal session's opening prompt does not
exist here.

| Block                                        | Meaning                                                                                                                                  |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `{ type: "text", text }`                     | A run of plain text. `$HOME`, backticks, newlines — all literal.                                                                         |
| `{ type: "resource_link", uri, name? }`      | A pointer to a file (usually a `file://` path) the agent may read. Always allowed — no capability gate.                                  |
| `{ type: "resource", uri, text, mimeType? }` | The file's own text **inlined** into the prompt. Only send this when `session.promptCapabilities.embeddedContext` is `true` — see below. |

Images are deferred behind a probe of what each agent actually accepts for
one (RFC 0040 open question 3 — no agent has been sent one yet).

## The update stream

`onUpdate` delivers each Agent Client Protocol `session/update` as an
[`AgentSessionUpdate`](/api/types/interfaces/AgentSessionUpdate). **Tolerate
`kind` values you don't recognize** — agents emit different subsets and vendors
add their own. Switch on the kinds you render and ignore the rest.

**Everything a transcript must draw is a modelled field.** You do not read the
wire format to build a Chat UI:

| `kind`                                                               | What to read                                                                                                       |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `agent_message_chunk` / `agent_thought_chunk` / `user_message_chunk` | `text` — or `content` for a block that isn't text ([`AgentContentBlock`](/api/types/interfaces/AgentContentBlock)) |
| `tool_call` / `tool_call_update`                                     | `toolCall` — [`AgentToolCall`](/api/types/interfaces/AgentToolCall)                                                |
| `plan`                                                               | `plan` — the whole list of [`AgentPlanEntry`](/api/types/interfaces/AgentPlanEntry)                                |

`messageId` groups a run of streaming chunks into one bubble — **synthesized by
Silo when the agent omits it**, which real agents do, so you never have to mint
ids yourself.

### Tool calls

A `tool_call` opens a call; a `tool_call_update` changes one already open and
**carries only what changed** — usually just `{ toolCallId, status }`. So key
your rows by `toolCall.toolCallId` and patch the fields that are present. Every
field but the id is optional, and an absent one means _unchanged_, never _empty_:

```ts
session.onUpdate((u) => {
  if (u.kind !== "tool_call" && u.kind !== "tool_call_update") return;
  const call = u.toolCall;
  if (!call) return;
  upsertRow(call.toolCallId, {
    title: call.title, // present on the opening call, and on a relabel
    kind: call.kind, // "read" | "edit" | "execute" | … | a vendor's own
    status: call.status, // "pending" | "in_progress" | "completed" | "failed"
    files: call.locations?.map((l) => l.path),
    body: call.content, // text blocks, diffs, terminal pointers
  });
});
```

An update whose opening `tool_call` never arrived is a real shape — render it
rather than dropping it. `rawInput` / `rawOutput` are the agent's own tool
arguments and result: protocol-carried, but **vendor-shaped by definition**, so
they are typed `unknown` and each agent's shape differs.

### The plan

A `plan` update carries the agent's plan **in full** — the agent reissues the
whole list every time — so replace what you are showing rather than appending:

```ts
if (u.kind === "plan" && u.plan) setPlan(u.plan); // may be empty
```

### What `raw` is for

`raw` is the **escape hatch**, not the way to render a transcript. It holds the
untouched protocol object, and is there for the kinds deliberately left
unmodelled: `usage_update` (token counts, reported differently by every agent)
and vendor extensions such as `claude-agent-acp`'s `_meta`. Three more —
`current_mode_update`, `session_info_update`, and `available_commands_update` —
are already surfaced as `configOptions`, `AgentInfo.title`, and `commands`
(RFC 0040), so you should not need `raw` for them either.

**`raw` tracks the protocol, not this SDK's semver.** A field inside it can
change shape, or vanish, when an agent or its adapter changes — no SDK major
required. Read it defensively; and if you find yourself needing it for something
every Chat UI must render, that is a gap in this surface worth reporting.

Silo's own Chat panel is the proof this holds: it reads no `raw` field at all.

## Session controls (mode, model, …)

The agent advertises its session-level controls at connect — a Cursor session
carries a **mode** and a **model** entry, a Claude session its permission
**mode** — and the handle surfaces them as one list:

```ts
for (const opt of session.configOptions) {
  if (opt.type !== "select") continue; // tolerate a shape you don't render
  renderSelect(opt.name, opt.currentValue, opt.options);
}

// change one — the host dispatches on opt.category
await session.setConfigOption("model", "claude-opus-4");

// reflect a mode the agent moved on its own
const off = session.onConfigOptionsChanged(() =>
  rerender(session.configOptions),
);
```

`configOptions` is **self-describing**, and so is the write — render one control
per entry and you get whatever the agent offers with no per-agent code, whatever
the category. `setConfigOption` goes through the protocol's generic
`session/set_config_option`; Silo keeps `session/set_mode` / `session/set_model`
only as a fallback for an agent that does not implement it. Claude's "effort"
(`category: "thought_level"`) has no typed method anywhere in the protocol and
sets fine through the generic path.

It **rejects**, with nothing written, on an unknown id or a value outside that
entry's options — and with the agent's own message when the agent refuses.
**Not every advertisement is settable:** `claude-agent-acp` lists a `fast` entry
its own handler answers `-32603 Unknown config option` for. Treat a rejected
`setConfigOption` as "stop offering this control" — the bundled panel drops it
from the composer.

## Commands (and skills) — RFC 0040

The agent advertises its slash commands live, from the moment the session
connects — before any prompt, for both agents probed:

```ts
for (const cmd of session.commands) {
  renderPaletteRow(cmd.name, cmd.description, cmd.input?.hint);
}

const off = session.onCommandsChanged(() => rerender(session.commands));
```

**Empty until the agent's first `available_commands_update`.** Both agents
probed send one at connect (`claude-agent-acp@0.75.1` at ~2.3s, `pi-acp@0.0.33`
at ~12.5s, behind its startup banner) — but nothing in the protocol requires
one, ever, so `connect()` does not wait for it. `input` is normalised for you:
Claude sends `input: null` for a command that takes no argument, pi omits the
key entirely, and `AgentCommand.input` only ever sees `undefined` for both.

**Skills arrive in this same list — there is no `session.skills`.** ACP has no
separate skills concept. The two agents probed mark them differently: pi
prefixes the name (`skill:code-review`), Claude does not mark them at all
outside a `(user)` / `(project)` suffix buried in `description`'s prose.
Splitting them back into a second list would mean pattern-matching a label
neither agent is contractually bound to keep — so render one palette, not two.

**There is no `runCommand()`.** Invocation is what `prompt` already does:

```ts
await session.prompt([{ type: "text", text: "/" + command.name }]);
```

Silo's own Chat panel is the proof this is enough: its `/` palette inserts the
name into the composer and sends it through the ordinary path.

## Prompt capabilities — what the agent will accept

```ts
const caps = session.promptCapabilities; // { image, audio, embeddedContext }
showAttachAffordance(caps.embeddedContext); // or `caps.image`, once modelled
```

Read once from `initialize` and fixed for the session's life — unlike
`commands`, there is no change event for it. A field the agent's `initialize`
omitted reads `false`, not `undefined`: both `codex-acp` and
`claude-agent-acp` omit `audio` entirely (recon 2026-09-09), so treating an
absent field as "not accepted" is the only reading that does not push a `??
false` onto every consumer.

Gate a `"resource"` prompt block on `embeddedContext` specifically —
`"resource_link"` is a pointer the agent may or may not read, always allowed,
and not gated on anything here. Silo's own Chat panel deliberately leaves its
existing file-attach affordance (`resource_link`) ungated for this reason; it
would gate a future embedded-content or image affordance the same way once one
exists.

## Attaching a file

`resource_link` blocks carry files into a turn. Pair `ctx.ui.pickFile` with a
`file://` URI:

```ts
const path = await ctx.ui.pickFile({ defaultPath: workspaceFolder });
if (path) {
  await session.prompt([
    { type: "resource_link", uri: `file://${path}`, name: basename(path) },
    { type: "text", text: "Review this." },
  ]);
}
```

## Resume — Chat session resurrection

The agent process is a piped child of Silo and does **not** survive the app
closing — but the _session_ does (RFC 0042). `AgentSessionHandle.canResume`
(and `AgentInfo.canResume`) is `true` when the agent advertises `session/resume`
or `session/load`; [`ctx.agents.resume(id)`](/api/agents/) spawns a fresh
process and reconnects the conversation through whichever the agent
advertises.

To restore your own panel's session across a restart, persist
`AgentSessionHandle.sessionId` (e.g. in a recorded panel's `DockPanelState` —
[RFC 0041](/api/registration/register-dock-panel-kind)) and pass it back as
`resume` on your next `connect()`:

```ts
const session = await ctx.agents.sessions.connect(profileId, {
  cwd,
  resume: savedSessionId ? { sessionId: savedSessionId } : undefined,
});

// Paint prior turns before subscribing — the transcript journal, read from
// disk. Empty for a brand-new session.
let transcript = session.journal.reduce(applyUpdate, emptyTranscript);
session.onUpdate((u) => (transcript = applyUpdate(transcript, u)));

// Persist the identity to restore next time.
saveSessionId(session.sessionId);
```

`connect()` probes `session/resume` (fast, no replay — the transcript comes
from `journal` alone) and `session/load` (replay, reconciled against the
journal) **separately**, preferring `resume`, and never rejects just because
the target has gone stale: a vanished session falls all the way through to a
fresh `session/new`. Check `session.resumeOutcome`:

| `resumeOutcome`  | Meaning                                                                                                                           |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `"new"`          | An ordinary `session/new` — nothing to restore, or the target had gone stale.                                                     |
| `"resumed"`      | Reconnected over `session/resume` or `session/load`.                                                                              |
| `"journal-only"` | The agent could do neither. `journal` is the whole transcript; `prompt()` rejects. Offer "Continue in a new session" — see below. |

**`session/load` may adopt a new session id** (observed on `claude`) — always
read `session.sessionId` back after `connect()` resolves and persist _that_,
not the id you passed in.

### Showing the right title while reconnecting

`initialize` alone can take several seconds (an adapter's own SDK bootstrap
dominates it) — well before `resume`/`load` even starts. Pass the last title
this session showed and `connect()` registers it immediately, so your tab (and
the workspace row, and the Agents navigator) show it right away instead of
the plain profile label for however long reconnecting takes:

```ts
const session = await ctx.agents.sessions.connect(profileId, {
  cwd,
  resume: { sessionId: savedSessionId },
  title: savedTitle, // what AgentInfo.title last was, persisted alongside sessionId
});
```

Ignored without `resume` — a fresh session has no prior title to show early.
It **outlives the handshake**: it stays the session's title once the connection
is up, until the agent volunteers a real one of its own (a title update). The
agent's product name from `initialize` does _not_ replace it — that is the
fallback for a session that never had a title, not a substitute for one this
conversation already earned.

### Sessions Silo lists before anything connects

A Chat session's agent process dies with the app; the session does not. Silo
remembers each one's identity and lists it in the Agents navigator on the next
launch with `chatResumeState: "dormant"` — the conversation exists, its panel is
recorded, and nothing is running behind it yet. This is what a session in a
workspace the user has not visited this run looks like, and it is why they can
find it at all: revealing one activates its workspace and its tab, at which
point your panel mounts and its `connect({ resume })` takes over.

A dormant entry is always `activity: "idle"`, and its `title` / `agentId` are
whatever they last were. Nothing is asked of an extension to get this — it
follows from persisting `sessionId` in your panel's state, exactly as the
restore flow above already requires.

### Continuing a `"journal-only"` session

There is no live agent to prompt, but the conversation is not lost: reconnect
with `startFresh` to start a new agent process while continuing to write into
the same transcript journal —

```ts
const session = await ctx.agents.sessions.connect(profileId, {
  cwd,
  resume: { sessionId: savedSessionId, startFresh: true },
});
saveSessionId(session.sessionId); // the *new* id — same as any other connect
```

Persist `session.sessionId` afterward, exactly as after a plain `connect()` —
**not** `savedSessionId`. Keeping the original id instead means every future
restore keeps retrying an id the agent has already shown it can't resume,
forever, even while the new conversation itself works fine turn after turn.
The journal is carried into the new id's file for you, so nothing is lost by
moving on from it.

## Reasons `connect()` rejects

- the extension did not declare the `"agents"` permission;
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
- [`AgentSessionRestore`](/api/types/interfaces/AgentSessionRestore)
- [`ChatResumeState`](/api/types/type-aliases/ChatResumeState)
- [`AgentPromptBlock`](/api/types/type-aliases/AgentPromptBlock)
- [`AgentPromptResult`](/api/types/interfaces/AgentPromptResult)
- [`AgentStopReason`](/api/types/type-aliases/AgentStopReason)
- [`AgentSessionUpdate`](/api/types/interfaces/AgentSessionUpdate)
- [`AgentToolCall`](/api/types/interfaces/AgentToolCall)
- [`AgentToolCallContent`](/api/types/interfaces/AgentToolCallContent)
- [`AgentToolCallLocation`](/api/types/interfaces/AgentToolCallLocation)
- [`AgentPlanEntry`](/api/types/interfaces/AgentPlanEntry)
- [`AgentContentBlock`](/api/types/interfaces/AgentContentBlock)
- [`AgentSessionConfigOption`](/api/types/interfaces/AgentSessionConfigOption)
- [`AgentSessionConfigChoice`](/api/types/interfaces/AgentSessionConfigChoice)
- [`AgentCommand`](/api/types/interfaces/AgentCommand)
- [`AgentPromptCapabilities`](/api/types/interfaces/AgentPromptCapabilities)
- [`AgentPermissionRequest`](/api/types/interfaces/AgentPermissionRequest)
- [`AgentPermissionOption`](/api/types/interfaces/AgentPermissionOption)
- [`ctx.agents`](/api/agents/) — the shared activity/status view both session kinds feed
- [`ctx.agents.profiles`](/api/agents/profiles) — start a Terminal session instead
- RFC 0038 — Agent Sessions (Terminal and Chat)
