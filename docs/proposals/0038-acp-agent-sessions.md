---
status: draft # draft | accepted | implemented | rejected | superseded-by NNNN
created: 2026-09-07
---

# 0038. Agent Sessions — Terminal and Chat

## Summary

Silo runs a coding agent exactly one way: type a command into a PTY and let the
agent draw its own TUI ([RFC 0033](./0033-agent-profiles.md)). This proposes a
second way — speaking the
[Agent Client Protocol](https://agentclientprotocol.com) (ACP) to an agent
subprocess over piped stdio, so Silo receives structured events and renders the
conversation itself.

A user picks this per profile, as **Interface: Terminal or Chat**. "ACP" is a
wire protocol and stays out of the UI, the same way Silo says _terminal_ and not
_PTY_.

The load-bearing change is **not** the Chat panel. It is promoting **Agent
Session** to the entity `ctx.agents` is keyed on, with two kinds beneath it —
a **Terminal session** (the agent draws itself; Silo infers what is happening)
and a **Chat session** (the agent reports what is happening; Silo draws it).
Every current weakness in `ctx.agents` — inferred activity, hook-gated session
ids, no way to know an agent is blocked on the user — is a consequence of only
having the first kind.

Groundwork is done and recorded in [`docs/acp-recon.md`](../acp-recon.md): a
working piped-stdio transport in Rust, four agents driven end to end, a working
panel in the center dock, and a verified restart story. This proposal is about
what of that becomes product, and in what order.

> **Two registries.** This document says **ACP Registry** for
> `agentclientprotocol/registry` (co-governed by Zed and JetBrains) and
> **Extension Registry** for `silo-code/extensions-registry` behind
> registry.getsilo.dev. The bare word "registry" is never used.

## Motivation

### The observation surface is guessing

`ctx.agents` reports `working` / `idle` / `error` by watching OSC titles and
spinner frames, and only knows an agent's real session id if the user installed
an opt-in hook ([RFC 0018](./0018-ctx-agents-surface.md),
[RFC 0019](./0019-agent-hook-shell-runtime.md)).
[RFC 0020](./0020-agent-hook-activity-channel.md) proposes fixing this by
promoting hooks to an authoritative channel — still `draft`, because doing it
well per agent is hard.

ACP simply answers. `session/new` returns a session id with no hook.
`session/update` reports tool calls as they happen. A turn ends with a typed
stop reason. `session/request_permission` supplies the `blocked` state RFC 0020
wants, for free. **For observability the Chat session is the reference shape and
the Terminal session is the lossy approximation of it** — which is the right way
round to define the model, and the opposite of how it would look if ACP were
bolted onto a terminal-shaped record.

### An extension cannot drive an agent at all

Everything an extension can do with agents today is read-only plus "launch one
and walk away" (`ctx.agents.profiles.launch`). It cannot send a follow-up, watch
a tool call, or answer a permission prompt, because there is nothing on the
other end but bytes. RFC 0031's Start Task, RFC 0035's composer, and any
bring-your-own-UI extension all stop at the same wall.

### Prompt delivery stops being dangerous

RFC 0033 phase 3 is the most safety-critical code in the agent stack: quoted
heredocs, a separate `fish` arm, line-editor sanitization, shell-dialect
refusals, and a **2 KiB** ceiling measured against a plugin-heavy zsh — all
because the prompt is _typed into a shell_. ACP takes structured content blocks.
That entire risk surface does not exist for a Chat session, and images and file
references come along for free.

### Half the agents on a typical machine already speak it

Probed against eight installed CLIs (2026-09-08), spawning each claimant rather
than grepping `--help`: `cursor-agent`, `opencode`, `gemini` and `copilot` all
speak ACP **built in**, no adapter, nothing to install. `claude`, `codex` and
`pi` need a small adapter. Only `grok` has no path.

ACP is also co-governed by Zed and JetBrains, with clients across Zed, JetBrains,
Neovim, Emacs and VS Code. Silo not speaking it is increasingly a gap rather
than a choice.

### Why RFC 0033's rejection does not settle this

RFC 0033 rejected "an agent-agnostic runner" because it is a large surface that
_we_ would own and that would break on every upstream release. That reasoning is
sound and no longer applies: ACP moves normalization to the agents and their
adapters. The same rejection also said that if wanted, it belongs in an
**extension** — close to what this proposes, with the connection in the host and
the UI above it.

## Design

### The entity: Agent Session

```
Agent Session          ← what ctx.agents is keyed on
├── Terminal session   ← a PTY; identity via detection (ADR 0028)
└── Chat session       ← an ACP child; identity declared at `initialize`
```

`AgentInfo.terminalId` stops being the identity and becomes an optional
attribute. Most of the record survives untouched and two fields improve
(`sessionId` needs no hook; `activity` stops being inferred). Two break:

- **`terminalId` is used as a verb, not just data.** `agents-panel-view.ts`
  resolves `ws.terminals.find(t => t.id === a.terminalId)` and clicking a row
  calls `ctx.terminals.focus()`. Making it optional just pushes an
  `if (terminalId)` branch into every consumer. It needs a host-owned
  `reveal(id)` that dispatches to "focus that terminal tab" or "focus that Chat
  panel" without the caller knowing which.
- **`resumeCommand` is a shell string by definition.** Replaced by a neutral
  capability flag plus `resume(id)`.

**The promise is observation parity, not capability parity.** An extension
reading `ctx.agents` sees one shape regardless of what drives the agent.
Capabilities differ per agent and are advertised, the way LSP does it.

### Keep RFC 0033's addressing; replace only its launching

`AgentProfile` today bundles two separable concerns:

1. **Addressing** — an id a human types, a label, a default flag, a
   `core.newAgent.<id>` command, a `+` menu entry, `silo agent run --profile`.
2. **Launching** — a shell command string, a config dir, prompt delivery, shell
   dialect.

Concern 1 is transport-agnostic and is the durable idea in 0033 — its own title
is "naming how you start an agent". Concern 2 is entirely terminal-specific and
fused in only because there was one way to start anything.

So: **one profile list, one `+` menu, one command namespace, two launch arms.**

```
AgentProfile {
  id, label, default?, assumedAgentId?      // addressing — unchanged
  launch:
    | { interface: "terminal", command: string, configDir? }   // a shell line
    | { interface: "chat",     command: string, args: string[], env?,
        sessionConfig? }                                       // see below
}
```

The arms differ honestly rather than sharing a field whose meaning changes.
`command` is a _shell string_ on the Terminal arm precisely so aliases and shims
resolve through a login shell; the Chat arm execs a pipe-connected child with a
path plus an args array, where that reasoning does not apply. This is also the
shape Zed converged on independently (`Custom { command, args, env }` vs
`Registry {}`, sharing only session config).

### Discovery: one list, not two

**"Which ACP servers are installed" is not a scannable question** — there is no
on-disk convention or manifest. It does not need to be: whether an agent speaks
ACP is a **static catalog fact**, exactly like `promptDelivery` and
`configDirEnvVar` already are. Compose it with the binary detection Silo already
does, and **Found on this machine** serves both paths:

```
Cursor        Terminal · Chat
OpenCode      Terminal · Chat
Gemini        Terminal · Chat
Copilot       Terminal · Chat
Claude Code   Terminal · Chat (adapter downloads on first use)
Codex         Terminal · Chat (adapter downloads on first use)
pi            Terminal · Chat (adapter downloads on first use)
Grok          Terminal
```

Cost: **one new catalog field**, `acpLaunch` — built-in args, an adapter
package, or none. A row that cannot offer Chat simply does not, and the user
never meets the word "ACP".

This is an argument for keeping the catalog **curated** rather than driving
discovery off the ACP Registry: the ACP Registry cannot tell you that _this
machine's_ `claude` means the adapter will work. `grok` shows why the entry must
be established by running the agent — its `--help` mentions ACP as an _output
format_, so a `--help` scan would list it and it would fail at runtime.

### Detection stays sealed; declared identity is accepted

[ADR 0028](../decisions/0028-sealed-agent-detection.md) seals detection: no
public `registerAgent`. That is right, and this does not reopen it. Sealing
exists to prevent **divergent classifiers** — several consumers inferring "is it
working?" from ambiguous OSC signals and disagreeing. A Chat session has no
classifier; the agent states its identity and status at `initialize`.

Accepting a _declared_ identity therefore does not reintroduce the failure
sealing was built to prevent. ADR 0028 needs an amendment saying so — and its own
text licenses it, having deferred public registration as "little gain **while the
set of agents is still host-curated**".

Note this is a **third provenance**, alongside 0033's observed `agentId` and
asserted `assumedAgentId`. The glossary needs it.

### Auth

Two mechanisms exist (ACP Registry `AUTHENTICATION.md`): **Agent Auth**, where
the agent runs a local HTTP server, opens the browser and stores its own
credentials — the client does nothing — and **Terminal Auth**, where the client
relaunches the agent with setup args that _replace_ its normal args/env.

Across 32 probed agents: 16 browser-only, 12 terminal-only, 3 mixed. Terminal
auth is the minority overall but covers **Claude, OpenCode and pi**.

Three facts shape the design:

- **`authMethods` being non-empty does not mean auth is required.** It is a menu
  of what is available. The signal is `session/new` **failing**.
- **An installed, logged-in CLI carries its adapter.** `claude-agent-acp` reuses
  the existing Claude Code login — verified by pointing `CLAUDE_CONFIG_DIR` at an
  empty directory and watching `session/new` succeed anyway. For the agents most
  likely to be used first, onboarding has **no auth step at all**.
- **Whether an adapter honours the config dir is per-agent, and the line above
  is not the general rule.** The same probe run against `codex-acp` (2026-09-11)
  goes the other way: with `CODEX_HOME` pointed at an empty directory,
  `initialize` still succeeds but `session/new` returns `Authentication
required`, while the ambient logged-in `~/.codex` succeeds — so that adapter
  reads the directory it is given. Two adapters, two answers, from the identical
  experiment. `configDirEnvVar` says which variable an agent uses, never that
  its ACP adapter respects it; that has to be probed per agent and recorded in
  the catalog entry.
- **Auth style is not declared in the ACP Registry** (`agent.schema.json` has no
  auth fields). It is discoverable only at runtime. A client must spawn first.

**Terminal auth is an advantage here, not a wart.** ACP hands over literal argv,
and Silo already has a first-class PTY host — so "Sign in" runs the agent's own
login command in a real Silo terminal. Conductor built a mini-terminal inside a
settings page to do this; Silo has one already. Their connection card
(Connected · Provider · Plan · Account) is the piece worth matching, and none of
it comes from ACP — it requires per-agent knowledge, which is one more argument
for the curated catalog.

### Session config defaults (phase 6)

An agent advertises its own session controls — mode, model, reasoning effort,
whatever it has — as `configOptions` on `session/new`, and accepts writes to
them via `setConfigOption`. The list is **self-describing and agent-specific**:
Silo hard-codes no per-provider schema, and the UI renders whatever comes back.
A Chat panel already exposes them for the live session.

What it could not do is remember them. Every new session started at whatever
the agent's own default was, so a preference like "always start Codex on
read-only" had to be re-set by hand each time. `sessionConfig` is that memory: an
opaque `configOptions` id → value map on the profile's Chat arm, applied after
`session/new`.

Four constraints, each of which is the interesting part:

- **Fresh sessions only.** A resumed session already carries whatever the agent
  had when it was last open; re-applying a profile default over it would
  silently undo a mid-conversation change the user made deliberately.
- **Validated against what the agent actually advertised, per connection.** A
  stored id the agent no longer offers, or a value no longer in its choice list,
  is skipped rather than written blindly — and dropped from the profile the next
  time the editor sees the real list. Agents change their options between
  versions; a stale entry must decay, not error.
- **Opaque on both sides.** Silo stores strings it does not interpret. That is
  what lets this work for an agent nobody has written a schema for, and it is
  the same bet `configOptions` itself makes.
- **A wrong value is inert, not dangerous.** Nothing is blocked on a key
  matching; an unrecognised one is simply never applied.

The options are discovered by **probing**: spawning the agent briefly and
reading what `session/new` advertises. This is unavoidable rather than chosen —
`configOptions` exists nowhere else in the protocol, so there is no way to offer
the user a list without creating a session first. Results are cached per launch
line so reopening the editor does not respawn the agent.

**The probe is the one place Silo spawns an agent outside the sessions
service**, which means its child is not in the agent registry and nothing else
will ever reap it — precisely the trap listed below ("ten orphaned
`cursor-agent` processes in one afternoon"), re-entered through a new door.
Three bounds keep it shut: a **timeout** (ACP requests have none of their own,
so an agent that starts and never answers `initialize` would otherwise leave a
child alive until Silo exits — and the timer must both kill the child and
independently settle the caller, rather than relying on disposal to unblock it);
a **debounce**, because the probe key folds in the command, args, env and config
dir, all of which change per keystroke while someone types a command; and a
**generation guard**, so a slow probe resolving after the user has typed on
cannot overwrite newer state.

An unauthenticated agent therefore cannot be probed at all — `session/new` is
both the only source of the options and the auth signal (see **Auth** above).
That is a real limit of this design, not a defect to fix: the remedy is to sign
in. A later phase could instead harvest `configOptions` from a live session,
which every working Chat panel already receives, and skip the probe entirely for
any profile that has ever connected.

### The transport

A long-lived child with **piped** stdio and newline-delimited JSON-RPC. A PTY is
actively wrong: it echoes input, applies line discipline, and mangles at
canonical-mode boundaries — it would look fine on small frames and silently
corrupt large ones, the exact failure class RFC 0033 phase 3 exists to avoid.
`ctx.process.spawn` is a PTY and `exec` is one-shot buffered, so this is new
Rust regardless of every other decision here.

Proven in the spike, with tests: a **1 MiB** frame round-trips byte-exact as one
line; stderr drains on its own thread into a bounded ring so an agent that dies
before `initialize` can say why; real agents initialize over it.

### Restart: the conversation survives, the process does not

**Verified on both agents by `SIGKILL`ing the process and asking for a fact from
before the kill.** The agent keeps the transcript on its side, so a fresh process
plus `session/load(sessionId)` restores context, and prior turns replay as
`session/update` notifications before the load resolves.

So restart survival is **persist the id and reload it**, not a rewrite of the
session-host daemon. Teaching the daemon to own piped children stays on the table
for a strictly larger promise — keeping an agent _working_ across a restart — and
should not be conflated with this. `session/load` is per-agent optional, so the
model needs an explicit "cannot be restored" state.

### What Silo owes the agent, and the honest limit

An ACP client implements methods too: `fs/read_text_file`, `fs/write_text_file`,
and `terminal/create` · `terminal/output` · `terminal/wait_for_exit` ·
`terminal/kill` · `terminal/release`. Silo's detached PTY host makes it unusually
well placed to be the terminal provider, and a tool call can render a live
terminal inline in the transcript.

**But the client is not a safety boundary, and the proposal must say so
plainly.** In the spike, Claude asked permission to write a file and honoured the
denial; **Cursor wrote the file with no permission request and without calling
`fs/write_text_file` at all** — it used the OS directly. Those methods are things
an agent _may_ route through the client; nothing compels it. A polished approval
dialog implying Silo gates file writes would mislead users. Only a sandbox gates
anything, which is why Zed built Seatbelt/Bubblewrap confinement. Decline those
capabilities in phase 1, or expose them and state the limit in the UI — either
way a conscious decision.

### Phases

| Phase                                | Scope                                                                                                                                                                                                                                                     |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1 — Model + transport**            | `Agent Session` as the `ctx.agents` identity; `reveal()` / `resume()` verbs; the `AgentProfile` launch union; the `acpLaunch` catalog field; the piped-stdio Rust command family with stderr capture. Domain-language change + ADR 0028 amendment. No UI. |
| **2 — `ctx.agents.sessions`**        | `@beta` SDK surface: connect, prompt, cancel, the typed update stream, permission plumbing. Sourced from user-authored profiles only.                                                                                                                     |
| **3 — The Chat panel**               | One bundled transcript: streaming text, tool-call rows, inline permission, cancel. Deliberately not plan / modes / slash-commands / history.                                                                                                              |
| **4 — Persistence**                  | Persist the session id; `session/load` on mount; the "cannot be restored" state.                                                                                                                                                                          |
| **5 — Discovery, onboarding & auth** | The unified **Found on this machine** list; the Settings → Agents connection card; "Sign in" running the agent's own login in a Silo terminal; adapter fetch-on-first-use.                                                                                |
| **6 — Session config defaults**      | `sessionConfig` on the profile's Chat arm: per-profile starting values for the agent's own `configOptions`, applied on a fresh `session/new`, discovered by a bounded probe. See above.                                                                   |

### Things any ACP client must handle (learned the hard way)

- **`messageId` is optional and agents omit it.** Cursor sends
  `{ sessionUpdate, content }` and nothing else. A client that groups chunks by
  id must synthesize one per run of consecutive same-kind chunks, or a sentence
  arrives as one message per token.
- **Unknown methods must be non-fatal.** `claude-acp` calls a non-spec
  `_auth/status_update` on the client; answering `-32601` is fine.
- **Identity can be absent.** Cursor returns `agentInfo: null`.
- **A non-auth business failure at `session/new` is real.** Gemini initializes
  cleanly, then fails with a vendor-deprecation message. The error path needs
  free text, not a closed enum.
- **Agent processes must be reaped.** Ten orphaned `cursor-agent` processes
  accumulated in one afternoon of the spike.
- **Switching agents is a teardown, not a prop change** — connection and session
  state is keyed by agent id.

## Alternatives considered

- **Do nothing.** Silo's differentiator is every project alive at once with its
  terminals and agents intact; a user running Claude Code in a Silo terminal
  already has that. The counter is that the _observability_ gap is real and
  independent of the UI — RFC 0020 exists because of it — and ACP closes it with
  a standard instead of per-agent hooks.
- **ACP as an activity channel only — speak the protocol, ship no UI.** The
  smallest version that delivers the model benefits. Rejected as the _end state_
  because it leaves extensions unable to drive an agent, but it is close to what
  phases 1–2 are on their own.
- **Build the Chat panel first.** The fastest demo and the wrong order: it puts
  Silo in a feature race with Zed on their strongest ground (~2.4 MB of Rust in
  `agent_ui` alone, roughly twice Silo's entire extension host) while leaving the
  model unfixed.
- **A separate list/settings page for Chat agents.** Rejected: it makes the user
  pick a _world_ before picking an agent, duplicates every addressing affordance,
  and adds a second vocabulary to the glossary.
- **A `mode: "cli" | "ui"` flag on `AgentProfile`.** Rejected in favour of the
  launch union — with a flag, half the record is conditionally dead, and
  `command` means two incompatible things.
- **Driving discovery off the ACP Registry instead of the catalog.** Rejected:
  it cannot know what is installed locally, cannot map `claude` → adapter, and
  cannot be trusted about `grok`.
- **Ship Chat agents as Silo extensions.** Zed tried exactly this and deprecated
  it in v1.5.0 in favour of the ACP Registry. Note the scope: that is about agent
  _distribution_, not a bring-your-own-UI extension, which stays in.
- **Daemon-owned piped children for restart survival.** Deferred, not rejected —
  `session/load` gets the conversation back far more cheaply. The daemon remains
  the only route to an agent that keeps _working_ across a restart.
- **`@acp-components` as the shipping UI.** The spike's panel is built on it
  (MIT, v0.1.0, one author) and it earned its place for a PoC. Not a foundation:
  it pins state to a module-level singleton store — one `activeSessionId` for the
  whole webview, so multiple panels collide — and adds a second state library
  plus an i18n stack.
- **Naming it "ACP" in the UI.** Rejected: Silo names features after what they
  are, not their transport — it says _terminal_, not _PTY_. "Native UI" was also
  considered and rejected: the agent's own TUI has the better claim to being
  native, and any `X UI` vs `CLI` pairing implies the terminal path has no
  interface.

## Decision

Not yet decided — `draft`. Open questions:

1. **Is the model change worth it on its own?** Phases 1–2 pay for themselves
   through `ctx.agents` even if no Chat panel ever ships.
2. **What is the sandbox posture** for `terminal/create` and `fs/*`, given that
   declining them protects the user no more than exposing them does?
3. **Does this supersede [RFC 0020](./0020-agent-hook-activity-channel.md), or
   coexist** with it for Terminal sessions?
4. **What happens to [RFC 0035](./0035-agent-prompt-composer.md)** — a host-owned
   prompt composer is most of what a transcript already is.
5. **Do we vendor adapters?** Conductor ships its own binaries; `claude-agent-acp`
   is `license: proprietary` and npx-distributed, and Silo ships no Node runtime.

   _Narrowed 2026-09-08._ Vendoring is still open, but two sub-questions are
   settled by use. **The catalog must hold a resolvable spec, pinned.**
   `acpLaunch.package` records a short name (`claude-agent-acp`) that npx
   cannot resolve — the real spec is `@agentclientprotocol/claude-agent-acp`,
   verified at `0.75.1` — so an agent's Chat launch is not composable from the
   catalog as it stands, and expecting a user to supply the difference is what
   made a Chat profile authorable-but-broken. The version is **pinned rather
   than floated**: this adapter changed its own advertised behaviour twice
   inside one sprint (`session/set_config_option`, then `session_info_update`),
   so a float would convert each such change into a silent breakage instead of
   a bump with a `lastVerified` date, like every other catalog fact. And
   whichever way vendoring goes, **`launch.env` needs a first-class authoring
   path** — a second account is selected by `configDirEnvVar`, so without one
   the adapter agents are single-account only.
