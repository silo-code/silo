---
status: draft # draft | accepted | implemented | rejected | superseded-by NNNN
created: 2026-09-15
---

# 0047. YOLO mode — permission bypass as an Agent Profile property

## Summary

A Chat session's "Auto Accept" toggle — the switch that answers every
`session/request_permission` on the user's behalf — is per-panel component
state today, so it resets on every new chat. This proposes promoting the
intent behind it to a property of the **Agent Profile**: a saved agent can be
marked as one that never asks for permission, and every chat launched from it
starts that way. The response logic stays in the extension; the host only
stores and hands over one more launch-time attribute, exactly as it does for
command, model, and mode.

## Motivation

Some agents let you declare "never ask me" up front. `claude-agent-acp`
advertises a bypass mode in its `session/new` `configOptions`, so it can be
pinned in a profile's `sessionConfig` today. Cursor and Pi do not — their mode
lists are agent/plan/manual with no bypass — so the only way to stop them
asking is Silo answering for them, via the panel's toggle.

That toggle is `useState(false)` (`AcpChatPanel.tsx:822`). The practical
failure, and the reason this RFC exists: you start a Cursor chat, walk away,
and come back half an hour later to find the agent suspended on a permission
request you never intended to answer manually. Nothing is broken — you simply
had to remember to flip a switch, every single time, and didn't.

RFC 0044 and the 2026-09-15 attention-ordering fix both sharpened how visible a
blocked session is. This RFC removes the class of stall entirely for users who
never wanted to be asked in the first place.

The forgetfulness is a persistence problem, not a placement problem — see
"Alternatives considered" for why it does not argue for host-owned policy.

## Design

### One intent, two mechanisms

"This agent never asks for permission" is the durable user intent. How it is
achieved depends on the agent, and the user should not have to care:

- **Native** — the agent advertises a bypass choice in `configOptions`.
  Already expressible: `AgentProfileLaunch`'s `chat` arm carries
  `sessionConfig`, applied via `setConfigOption` after `session/new`. The
  requests are never generated.
- **Emulated** — the agent has no such choice, so the panel answers each
  request the instant it arrives.

These compose without knowing about each other. The emulated path is an
**always-armed backstop**: when the native option has already suppressed the
requests, nothing ever reaches it. No mechanism detection is required
anywhere, which is the point.

### Host: one more field on `AgentProfile`

Add to `AgentProfile` (`packages/extension-host/src/state/types.ts:364`):

```ts
/** Launch-time default for permission bypass — "YOLO mode". Seeded into a
 *  Chat panel at connect; the panel, not the host, answers requests. */
bypassPermissions?: "off" | "all";
```

An enum rather than a boolean so `"reads"` (auto-approve reads, ask for writes
and exec) can be added later without migrating persisted user data — the
lesson `loadAgentProfiles` already learned migrating the flat pre-RFC-0038
`command` shape.

Named for the intent, not the mechanism. The host stores it and hands it over.
It does **not** enforce it, does not decide which options are safe, and never
answers an agent itself. A future subscriber that ignores the field is not a
bug.

Sibling of `sessionConfig`, not an entry inside it: `sessionConfig` is
agent-side state pushed to the agent, this is Silo-side.

Surfaced in `ProfileEditorModal` alongside the other chat launch fields.

### Extension: the panel applies it

`AcpChatPanel` seeds `autoAccept` from the profile at connect, the same way it
already seeds model and mode, and keeps answering via `autoAcceptOptionId`
(`permission-options.ts`). Everything auto-approved still renders in the
transcript — the record of what happened while the user was away is the whole
reason this stays panel-side.

### The toggle is a per-chat override

Flipping it mid-session applies to that chat only and does not write back to
the profile. Consistent with every other profile field (launch-time config,
not live-editable) and with changing the model mid-chat.

Worth stating plainly in the UI copy, because it is the one asymmetry users
will notice: turning it **off** mid-chat is a temporary pause, not a change of
mind. Making it stick means editing the profile.

### Scope: per agent, not per folder

A profile marked YOLO is YOLO in every workspace. A per-folder trust dimension
(unsupervised in a scratch repo, supervised in the real one) is a plausible
future axis and would compose as a conjunction, but is explicitly **not** in
this RFC.

### Remove `agentHasBypassMode`

Today the panel hides the toggle when the agent advertises its own bypass
(`AcpChatPanel.tsx:1496`), detected by substring-matching `"bypass"` in
`configOptions` values (`permission-options.ts:62`). This RFC deletes that
hiding, for three reasons:

1. It reintroduces exactly the agent-to-agent difference the profile field
   exists to hide.
2. It cannot work where the setting now lives. The checkbox is on the profile
   editor, filled in before Silo has ever launched that agent; `configOptions`
   are only known after connecting.
3. It is vendor-string guesswork with no standard behind it — a substring
   match against opaque values, which goes wrong in both directions the moment
   a vendor renames a mode.

Showing it for an agent that has its own bypass costs nothing: the backstop
never fires, and it covers anything the native setting misses.

The checkbox **is** hidden for `interface: "terminal"` profiles. That line is
structural, not per-vendor, and knowable at edit time: a terminal agent draws
its own prompt in its own PTY and Silo is not in the loop, so there is nothing
to answer. YOLO for a terminal agent is already expressible — it is a flag in
the `command` field.

### Domain language

`docs/domain-language.md` gains the term. The concept has three vendor names
already (Cursor's "YOLO mode", Claude's `--dangerously-skip-permissions`, ACP's
bypass modes); Silo needs one, with the descriptive name in the schema.

## Alternatives considered

**Host-owned auto-accept.** The host answers permission requests itself when a
flag is set, and never surfaces them. Rejected on three grounds. It makes the
host non-neutral — deciding which tool-call options are safe is product
policy, not transport. It destroys the record: an auto-approval answered before
the panel sees it never reaches the transcript, so "what did it do for thirty
minutes" becomes unanswerable unless the host grows its own UI. And
`AgentPermissionRequest` already states the doctrine
(`packages/sdk/src/agents-service.ts:847`) — _"This is not a safety boundary…
nothing stops it touching the filesystem directly"_ — so host enforcement over
an advisory channel would manufacture something that looks like a security
control and isn't.

**Leaving it as panel state and solving forgetfulness another way** (a sticky
"last used" value, a global setting). Loses the per-agent granularity that
makes this useful: the whole point is that a given saved agent is or isn't one
you supervise.

**A shared SDK helper for the response logic.** Deferred, not rejected. The
panel is the only `onPermission` subscriber today. If a second consumer
appears, `autoAcceptOptionId` is the natural thing to promote — note
`AgentPermissionOption.kind` is typed `string` with `"allow_always"` /
`"reject_once"` only documented in prose, so every subscriber would re-derive
the same matching and hit the same edges. Reusable code, still not host policy.

**Per-folder trust instead of per-agent.** Deferred; see Scope above.

## Decision

Pending.
