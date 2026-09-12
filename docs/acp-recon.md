# ACP recon — Agent Client Protocol as a second way to run an agent

**Status:** exploration notes. No proposal exists yet; this is the evidence a
future RFC would be built on. Nothing here is a decision.

**Why this file:** Silo runs coding agents one way — a PTY, a shell, and a TUI
([RFC 0033](./proposals/0033-agent-profiles.md)). The
[Agent Client Protocol](https://agentclientprotocol.com) (ACP) is a second way:
the editor spawns the agent as a subprocess and speaks JSON-RPC to it, rendering
the conversation itself. This file records what was found while working out
whether Silo should support it, in the same spirit as RFC 0033's per-agent recon
tables: **the check is a run, not a read of the spec.**

Everything dated 2026-09-07 unless noted.

---

## 1. What ACP is

Open standard from Zed Industries (Aug 2025), JSON-RPC 2.0 over the child
process's stdin/stdout, **newline-delimited** (not LSP-style `Content-Length`
headers). Co-governed with JetBrains since Oct 2025. Apache licensed.

Roles are inverted from what the name suggests: the **agent** is the subprocess,
the **client** is the editor. The client implements methods too — the agent calls
back into it.

| Direction      | Methods                                                                                                                                                                                                                                      |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client → Agent | `initialize`, `authenticate`, `session/new`, `session/prompt`, `session/cancel` (notification); optional `session/load`, `session/set_mode`, `logout`                                                                                        |
| Agent → Client | `session/update` (notification); `session/request_permission`; optional `fs/read_text_file`, `fs/write_text_file`, `terminal/create`, `terminal/output`, `terminal/wait_for_exit`, `terminal/kill`, `terminal/release`, `elicitation/create` |

Everything optional is negotiated in `initialize`. A turn ends with a stop
reason: `end_turn`, `max_tokens`, `max_turn_requests`, `refusal`, `cancelled`.

### Clients in the wild

Native: Zed, JetBrains. Plugin/community: Neovim (CodeCompanion, agentic.nvim,
avante.nvim), Emacs (agent-shell.el), VS Code and the VS Code–compatible IDEs
(Cursor, Windsurf, Trae), Sublime, Qt Creator, Obsidian, Unity, Visual Studio.

---

## 2. Upstream resources worth consuming rather than rebuilding

### The ACP Registry

`github.com/agentclientprotocol/registry` — the catalog behind in-editor agent
browse/install. Entry schema (`agent.schema.json`): `id`, `name`, `version`,
`description`, plus `distribution`, which is one or more of:

- `binary` — per-triple (`darwin-aarch64`, `linux-x86_64`, …) `archive` URL,
  optional `sha256`, `cmd`, `args`, `env`
- `npx` — `package` (version-pinned), `args`, `env`
- `uvx` — same shape

Consequence for a spike: **an agent does not have to be installed.** `npx
@google/gemini-cli@0.58.0 --acp` pulls the exact pinned version.

### The protocol adaptation matrix

`.protocol-matrix/latest.md` in that repo — regenerated automatically, probes
**every** registry agent for `initialize`, auth style, and advertised
capabilities. As of the 2026-09-07 run: 32 agents, 31 initialize successfully,
and **19 return `auth_required` from `session/new`**.

This is the analog of RFC 0033's hand-built `promptDelivery` /
`configDirEnvVar` tables — except maintained upstream. If Silo ships ACP support
it should read this rather than build its own per-agent recon.

Capability spread from that run (subset):

| Agent            | Version    | Dist   | Auth     | Advertised                      |
| ---------------- | ---------- | ------ | -------- | ------------------------------- |
| `claude-acp`     | 0.75.1     | npx    | terminal | loadSession, list, fork, resume |
| `codex-acp`      | 1.10.0     | npx    | agent    | loadSession, list, fork, resume |
| `opencode`       | 1.18.29    | binary | terminal | loadSession, list, fork, resume |
| `cursor`         | 2026.09.02 | binary | agent    | loadSession, list               |
| `github-copilot` | 1.541.0    | npx    | agent    | loadSession, list               |
| `goose`          | 1.49.0     | binary | agent    | loadSession, list               |
| `gemini`         | 0.58.0     | npx    | agent    | loadSession                     |
| `pi-acp`         | 0.0.33     | npx    | terminal | loadSession, list               |

Method probe totals: `session/list` supported by 20, `session/set_model` 16,
`session/resume` 10, `session/fork` 9, `session/stop` 1.

**Note the auth axis.** `terminal` auth means the client must be able to spawn a
terminal to complete the handshake. That is the first place Silo's terminals are
load-bearing in an ACP client rather than decorative.

---

## 3. Zed's client, read directly

Source read at `zed-industries/zed@main`, 2026-09-07.

### Transport (`crates/agent_servers/src/acp.rs`)

```
Child::spawn(cmd, Stdio::piped(), Stdio::piped(), Stdio::piped())
BufReader::new(stdout).lines()        // newline-delimited JSON-RPC
stderr → its own task → ring buffer
```

The stderr buffer is not incidental: `exited_load_error_with_stderr` turns
"agent died before `initialize`" into a readable error. Agents die at startup
constantly (missing node, bad auth); without captured stderr the user gets
"connection closed."

### The agent record is a discriminated union (`crates/settings_content/src/agent.rs`)

`CustomAgentServerSettings` has two variants:

|              | `Custom`                                                                         | `Registry`                                 |
| ------------ | -------------------------------------------------------------------------------- | ------------------------------------------ |
| how to start | `command: PathBuf`, `args: Vec<String>`, `env`                                   | _nothing_ — the registry entry supplies it |
| shared       | `default_mode`, `default_config_options`, `favorite_config_option_values`, `env` | same                                       |

The union splits on **how you start it** and shares **how you configure a
session**. `#[serde(alias = "extension")]` on `Registry` is the residue of a
migration: **Zed deprecated ACP-agents-as-extensions in v1.5.0** and moved them
to the registry. (That is about agent _distribution_, not UI.)

Directly relevant to Silo: `command` is a **path plus an args array**, never a
shell string. RFC 0033's `AgentProfile.command: string` exists precisely so
aliases and version-manager shims resolve through an interactive login shell.
ACP execs a pipe-connected child — there is no shell — so that field's type and
its justification both fail on the ACP side.

### "Uniform" is negotiated, not given (`crates/acp_thread/src/connection.rs`)

`AgentConnection` is ~20 methods, most optional behind `supports_load_session()`,
`supports_resume_session()`, `supports_close_session()`, `supports_logout()`,
plus `Option`-returning probes for modes, model selection, truncate, set_title,
session list, elicitations.

And `client_capabilities_for_agent()` carries per-agent special-casing through
ACP's `meta` escape hatch — a `PARAMETERIZED_MODEL_PICKER` key set only for
Cursor, a hardcoded `GEMINI_TERMINAL_AUTH_METHOD_ID`. Even the reference client
special-cases vendors.

### `terminal/create` is a _sandboxed_ terminal (`crates/acp_thread/src/terminal.rs`)

`SandboxWrap`: macOS Seatbelt, Linux Bubblewrap, Windows via bwrap-in-WSL;
network confined through an in-process allowlisting HTTP proxy; per-path write
grants with a documented symlink-TOCTOU fix on re-resolution.

So the honest comparison is: **Silo's edge is persistence** (its PTY sessions
survive app restarts; Zed's agent terminals do not), **Zed's edge is
confinement.** Silo has no sandbox — RFC 0006 is `accepted` and unbuilt.

### The UI model (`crates/acp_thread/src/acp_thread.rs`)

`AgentThreadEntry` = `UserMessage | AssistantMessage | ToolCall | Elicitation |
CompletedPlan | ContextCompaction`.

Two details matter for Silo:

- `ToolCallContent::{ContentBlock, Diff, Terminal}` — a tool call can render **a
  live terminal inline in the transcript**. That is the concrete place Silo's
  terminals would pay off.
- `ToolCallStatus::WaitingForConfirmation { options, respond_tx, … }` — a
  permission request **suspends the tool call in the thread** and answers a
  oneshot. Zed does **not** open a modal. Whoever renders the transcript renders
  the permission.

### Scale

|                                | size (top-level `src`) |
| ------------------------------ | ---------------------- |
| Zed `agent_ui`                 | ~2.4 MB Rust           |
| Zed `acp_thread`               | ~520 KB                |
| Zed `agent_servers`            | ~215 KB                |
| _Silo's entire extension host_ | ~1.2 MB TS             |
| _All Silo bundled extensions_  | ~1.0 MB TS             |

Discount Rust's verbosity and matching Zed's agent panel is still on the order of
rewriting Silo's whole extension surface. Any first phase has to be much smaller
than that.

---

## 4. Spike A — running two providers for real

**Method.** Hand-rolled probe (deliberately not the official TS SDK: the point is
to see raw frames and to prototype what the Rust side must do). Spawns the agent
with three pipes, newline-framed JSON-RPC, stderr drained separately, logs every
frame. Answers agent→client calls: **denies every permission, refuses `fs/*` and
`terminal/*`**, so we observe shape without doing work.

Flow: `initialize` → `session/new` → optionally one `session/prompt`. Prompt used
was _"Create a file called hello.txt containing the word hi, then tell me you are
done."_ in a fresh empty temp cwd — chosen to force a tool call.

Harness lives at `scratchpad/acp-probe/probe.mjs` (not yet in the repo — see
"Open questions").

### 4.1 `initialize` / `session/new`

|                       | `claude-acp` 0.75.1                                                   | `cursor` 2026.09.02                                          | `gemini` 0.58.0                |
| --------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------ |
| launch                | `npx @agentclientprotocol/claude-agent-acp`                           | local `cursor-agent acp`                                     | `npx @google/gemini-cli --acp` |
| `initialize`          | ok, 0.8 s                                                             | ok, 1.3 s                                                    | ok, 6.6 s                      |
| `agentInfo`           | name/title/version                                                    | **`null`**                                                   | name/title/version             |
| `loadSession`         | true                                                                  | true                                                         | true                           |
| `sessionCapabilities` | `additionalDirectories, close, delete, fork, list, resume, subagents` | `list`                                                       | **absent**                     |
| `promptCapabilities`  | image, embeddedContext                                                | image (audio/embedded false)                                 | image, audio, embeddedContext  |
| `authMethods`         | 2, `type: "terminal"`, each with literal CLI `args`                   | 1, no `type`                                                 | 4, no `type`                   |
| `session/new`         | ok — returns `sessionId`, `modes`, `configOptions`                    | ok — returns `sessionId`, `modes`, `models`, `configOptions` | **fails, −32000**              |
| modes offered         | `default, acceptEdits, plan, auto, bypassPermissions`                 | `agent, plan, ask`                                           | —                              |

### 4.2 A full prompt turn

`claude-acp` — 30 frames, 13.7 s, `stopReason: end_turn`:

```
session/prompt
  → available_commands_update ×2
  → usage_update, tool_call, tool_call_update ×2
  → session/request_permission          (client answers: reject)
  → tool_call_update
  → agent_message_chunk ×4
  → usage_update ×7
result: end_turn (+ usage: 41,244 tokens, model claude-opus-5)
```

`cursor` — 38 frames, ~25 s, `stopReason: end_turn`:

```
session/prompt
  → available_commands_update, session_info_update
  → agent_message_chunk ×28, agent_thought_chunk ×4
  → tool_call, tool_call_update ×3
result: end_turn   (no usage block)
```

---

## 5. Findings that change the design

**1. The client is not a safety boundary.** Claude asked permission, was denied,
and wrote nothing. **Cursor never asked, never called `fs/write_text_file`, and
wrote `hello.txt` to disk itself.** Verified on disk: Claude's temp cwd empty,
Cursor's contains the file.

`fs/*` and `session/request_permission` are things an agent _may_ route through
the client; nothing stops it using the OS directly. A Silo ACP client therefore
**cannot present itself as the thing standing between the agent and the user's
files.** Only a sandbox can do that, which is why Zed built one. This has to be
stated plainly in any proposal and in any user-facing copy.

**2. Vendor extension methods arrive unannounced.** `claude-acp` called
`_auth/status_update` on the client 3× in one run — not in the spec. The probe
answered `-32601 method not found` and the agent carried on unaffected. **A
client must tolerate unknown methods gracefully**; treating an unrecognized
request as fatal would break against a compliant agent.

**3. `session/update` variance is real but bounded.** Union of kinds seen:
`available_commands_update`, `usage_update`, `session_info_update`, `tool_call`,
`tool_call_update`, `agent_message_chunk`, `agent_thought_chunk`. No agent
emitted anything the other could not; they emit _different subsets_. Cursor emits
`agent_thought_chunk` and `session_info_update` (Claude emitted neither); Claude
emits `usage_update` (Cursor emitted none). **Nothing here breaks a uniform
observation surface** — a consumer that ignores unknown kinds and does not
require any particular one is fine.

**4. Identity is not guaranteed.** Cursor returns `agentInfo: null`. Any
display-name/version field has to tolerate absence and fall back — for Silo,
presumably to the profile label.

**5. A non-auth business failure at `session/new` is a real state.** Gemini
initializes cleanly, then fails `session/new` with −32000: _"This client is no
longer supported for Gemini Code Assist for individuals… migrate to the
Antigravity suite."_ Not `auth_required` — a vendor deprecation. The error path
between "connected" and "has a session" needs to carry an arbitrary
agent-supplied message to the user, not a fixed enum.

**6. Auth is plumbing, not a footnote.** 19 of 32 registry agents return
`auth_required` from `session/new`. `claude-acp`'s two auth methods are
`type: "terminal"` and carry literal CLI args (`--cli auth login --claudeai`) for
the client to run in a terminal.

### What this means for `ctx.agents`

The working requirement is **observation parity, not capability parity**: an
extension reading `ctx.agents` should see the same shape whether a CLI or an ACP
session is driving. Checked field by field against today's `AgentInfo`, that
holds, with two exceptions and two upgrades:

| Field                                                                                    | Under ACP                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `activity`, `needsAttention`, `workingSince`, `attentionSince`, `isAgent`, `workspaceId` | unchanged                                                                                                                                                                                                                        |
| `sessionId`                                                                              | **better** — today only exists if the user installed the opt-in hook; ACP returns it from `session/new`                                                                                                                          |
| `activity` provenance                                                                    | **better** — today inferred from OSC titles / spinner frames; ACP gives authoritative stop reasons, and `session/request_permission` gives the `blocked` state [RFC 0020](./proposals/0020-agent-hook-activity-channel.md) wants |
| `stale`                                                                                  | always false (it is a restart-gap heuristic; a connection is alive or it is not)                                                                                                                                                 |
| `agentId` / `agentName`                                                                  | works, but a third provenance — today _observed_ (ADR 0028) or _asserted_ (`assumedAgentId`); ACP is _declared at `initialize`_, and may be `null`                                                                               |
| `terminalId`                                                                             | **breaks** — required today, and there is no terminal                                                                                                                                                                            |
| `resumeCommand`                                                                          | **breaks** — a string of shell by definition                                                                                                                                                                                     |

`terminalId` is the harder of the two because it is not only read, it is used as
a **verb**: `agents-panel-view.ts` resolves `ws.terminals.find(t => t.id ===
a.terminalId)` and clicking a row calls `ctx.terminals.focus()`. Making it
optional just pushes an `if (terminalId)` branch into every consumer. The
surface needs host-owned verbs — `reveal(id)`, `resume(id)` — that dispatch to
"focus that terminal tab" or "focus that agent panel" without the caller
knowing which.

Which suggests inverting the model: **define `AgentInfo` around what ACP
provides and treat OSC/spinner detection as the lossy approximation of it**,
rather than bolting ACP onto a terminal-shaped record.

---

## 5b. Spike B — the transport, built and proven

Branch `worktree-spike-acp-transport`;
`apps/desktop/src-tauri/src/commands/acp.rs`. **A spike, not a shipped
surface** — it is registered in `lib.rs`'s invoke handler so the webview half
can be driven next, but nothing calls it.

Shape: `AcpConnection::spawn(command, args, cwd, env, on_line, on_stderr,
on_exit)` — deliberately callback-shaped rather than Tauri-shaped, so the
transport is testable headlessly and the four `#[tauri::command]` wrappers stay
trivial. Events are `acp_message:<id>` / `acp_stderr:<id>` / `acp_closed:<id>`,
matching `terminal_io.rs`'s existing per-id emit convention.

**No new crate dependencies.** `std::process` plus two threads. Worth knowing
before the cost of ACP support is estimated: the transport is the _riskiest_
piece, not the heaviest one.

### What the tests establish

| Test                                                       | Claim                                                                                                                                                |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `spawn_roundtrip_large_frame`                              | A **1 MiB** single frame round-trips **byte-exact** as one line — ~16× a 64 KiB pipe buffer, ~256× the 4 KiB canonical-mode limit a PTY truncates at |
| `frames_stay_separate_and_ordered`                         | 50 consecutive frames arrive separate and in order; no coalescing, no splitting                                                                      |
| `stderr_is_captured_when_child_dies_before_output`         | A child that writes only to stderr and exits 3 still reports both                                                                                    |
| `stderr_ring_is_bounded`                                   | The ring caps at 200 lines and keeps the **tail** — the lines nearest the failure                                                                    |
| `missing_binary_fails_at_spawn`                            | A binary not on `PATH` fails at spawn with a usable message, rather than yielding a connection that never answers                                    |
| `real_agent_initializes_over_this_transport` (`#[ignore]`) | **`cursor-agent acp` initialized for real over this transport**, `protocolVersion: 1`, full capability payload                                       |

The last one is the only one that proves anything about ACP; a `cat` loopback
proves framing and nothing else. It is `#[ignore]`d because it needs the agent
installed, network, and a logged-in account — run it with
`cargo test --lib commands::acp::tests::real_agent -- --ignored --nocapture`.

### Design notes worth carrying into a proposal

- **The host owns framing.** `BufReader::lines` accumulates across `read`
  boundaries, so a consumer never sees half a frame regardless of payload size.
  This is the single property a PTY cannot provide and it is why the transport
  has to be new code rather than a reuse of `session_host`.
- **stderr needs its own thread, not a poll on the stdout loop.** A child that
  fills the stderr pipe while the reader is blocked on stdout deadlocks, and an
  agent that writes only to stderr before dying would never be heard. (Reasoned
  from how pipes work, not observed — the tests pass with the design already in
  place.)
- **Reaping races the stderr drain.** `on_exit` waits 50 ms after stdout EOF
  before reading the ring, so lines the child wrote on its way out are included.
  Added defensively rather than in response to an observed loss; worth revisiting
  with a proper join rather than a sleep if this becomes real code.
- **`close()` drops stdin before killing.** Closing stdin is how a well-behaved
  agent is asked to exit; the kill is the backstop for one that ignores it.

### The webview half — verified in the running dev app

Driven through the automation bridge against the worktree build (2026-09-07).
`eval` cannot reach `invoke` (`withGlobalTauri` is off), so a temporary
`acpProbe` op was added to `apps/desktop/src/automation/bridge.ts` — **marked
TEMPORARY; delete it with the spike.** It spawns, subscribes to the three
events, sends one `initialize`, and returns what came back.

| Case                            | Result                                                                                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cursor-agent acp`              | `initialize` answered over the full path — TS → `invoke` → Rust → agent → `acp_message` event → TS. `protocolVersion: 1`, full capability payload |
| binary not on `PATH`            | `invoke` rejects with `failed to spawn silo-no-such-agent-binary: No such file or directory (os error 2)`                                         |
| child writes stderr and exits 3 | `acp_closed` carried `{code: 3, stderr: ["ENOENT: node not found"]}`, and the live `acp_stderr` stream carried the same line                      |

**A wart the Rust unit tests could not see.** `on_exit` removes the connection
from the registry, so `acp_stderr_tail` and `acp_close` return **`unknown
connection`** once the child has exited — which is precisely when a caller
reacting to `acp_closed` would want to ask for the post-mortem. The diagnostic
is not lost (it rides the `acp_closed` payload and the live stderr stream), but
the API invites a call that always fails at the one moment it matters. First
attempt at this test reported only `{"error":"unknown connection"}` and nothing
else, which is exactly how a real consumer would experience it.

Fix belongs in a proposal, not the spike: either keep an exited connection in a
terminal state so a post-mortem read still works, or drop `stderr_tail`
entirely and make `acp_closed` the only post-mortem path. **The lesson worth
keeping: a headless test that only exercises the happy path and the
callback-level failure missed an API-shape defect that appeared the moment a
real consumer called it in a real order.**

### What Spike B did _not_ cover

A JSON-RPC client on top — request/response correlation by `id`, and the
agent→client method handlers the Spike A probe implemented in JS
(`session/request_permission`, `fs/*`, `terminal/*`, and tolerating unknown
methods per Finding 2). That is the remaining work before an extension could
drive an agent.

## 5c. Spike C — a working agent panel in the center dock

**It works.** A real ACP agent runs in a Silo center-dock tab, streams its
turn, renders tool calls, and edits files in the workspace. Verified in the dev
app 2026-09-07: prompt → `cursor-agent` (auto-routed to Grok 4.6) → thoughts
and an `Edit` tool-call card → `hello.txt` written to the sandbox workspace
with the expected contents.

### What was built vs. borrowed

The expensive half is borrowed. [`zvzuola/acp-components`](https://github.com/zvzuola/acp-components)
(MIT, v0.1.0) supplies the protocol client and the session / streaming /
tool-call / permission state, plus `ChatView`, `ToolCallCard`,
`PermissionDialog`, `DiffView`, `PlanView`, `Markdown`. Silo owns the two parts
a real implementation must own anyway:

| Piece     | Where                                        | Note                                                                                                                                                                        |
| --------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Transport | `extension-host/.../agents/acp-transport.ts` | Wraps Spike B's `acp_*` commands as the library's `AcpTransport` (`connect()` → `Stream`). ~150 lines. In the **host**, because an extension may not import `@tauri-apps/*` |
| Panel     | `extensions-core/src/acp-chat/`              | `core.*` extension; `registerDockPanelKind` + `+`-menu entry + `core.acpChat.new` command                                                                                   |
| Theming   | `acp-chat/acp-theme.css`                     | Maps `--acp-*` → `--silo-*`                                                                                                                                                 |

Only the transcript is used. The library's `WorkbenchShell`, `Sidebar`,
`FileTree` and `CommandPalette` are pointedly unused — Silo already is all of
those.

**Why this library fits.** Its components reference only `--acp-*` custom
properties and hardcode no colors — the same discipline ADR 0017 imposes on
Silo extensions — so theming is a ~50-line variable mapping rather than a fight
with a Tailwind build. It also ships prebuilt CSS, so no `sass` in the build,
and it names "Tauri/Electron/extension/iframe" as the intended custom-transport
case.

### What the spike proves and what it doesn't

Proven: the transport carries a real conversation; the host/extension split
works; a third-party ACP UI inherits Silo's theme; an ACP agent edits files in
the active workspace.

**Not proven, and load-bearing for the RFC:**

- **Permissions never fired.** Cursor edited the file without a
  `session/request_permission`, exactly as Finding 1 predicted — so
  `PermissionDialog` is wired but has not been exercised. Re-run with
  `claude-acp`, which does ask, before drawing any conclusion about the
  permission UX.
- **`ctx.agents` was not touched.** The panel is invisible to the agent system
  — no status, no `needsAttention`. That integration is the actual subject of
  the RFC and this spike deliberately says nothing about it.
- **One session, one agent, no persistence.** No `session/load`, no reconnect
  after a restart, no multi-session.

### Finding 7 — `messageId` is optional, and omitting it shreds the transcript

The first build rendered streamed prose **one word per line** and split a
single thought into a stack of separate `THOUGHT` blocks. Root cause, confirmed
against captured frames: `cursor-agent` sends chunks as
`{ sessionUpdate, content }` with **no `messageId`**, and `@acp-components`
derives the grouping key as `messageId || randomUUID()` — so every chunk became
its own message.

`messageId` is **optional** in ACP, so this is the client's job, not an agent
bug. The transport now synthesizes a stable id per run of consecutive same-kind
chunks, breaking the run when the kind changes or a rendered block (`tool_call`,
`plan`) interrupts — which is exactly where a new bubble belongs. Kinds that
render nothing inline (`usage_update`, `available_commands_update`) do not
break a run. An agent that _does_ send ids is passed through untouched. Seven
unit tests in `acp-transport.test.ts`.

**Any ACP client has to do this.** It is worth carrying into the RFC as a named
requirement rather than rediscovering it.

### Finding 8 — the embedding app owns the scroll chain

The transcript did not scroll and the composer was pushed off the bottom of the
panel. The library's own layout is correct — `.acp-chat-view` is
`overflow: hidden` over an `overflow-y: auto` message list — but it only works
if every ancestor is height-bounded. `I18nProvider` and `AcpProvider` each
render a plain `div`, defaulting to `flex: 0 1 auto` / `min-height: auto`, so
they sized to content: the view grew to ~6500px and the list never got a height
to scroll inside. Fixed with `flex: 1 1 auto; min-height: 0` down the whole
chain. Verified after: root 842px → view 809px → list 600px, composer visible.

### Finding 9 — an agent subprocess outlives its UI unless something kills it

Ten orphaned `cursor-agent` processes accumulated during one afternoon: the
panel never called `disconnect()` on unmount, and a webview reload runs no
cleanup at all. The panel now disconnects on unmount and when switching
providers. **This is a real design constraint for the RFC**, not a spike bug —
an ACP session is a process the app is responsible for reaping, and unlike a
Silo terminal (whose whole point is surviving), an orphaned agent is pure waste
and possibly still billing.

### Finding 10 — `--silo-color-border` is `transparent` in some themes

The composer box was drawn with `border: 1px solid var(--silo-color-border)`
and rendered as nothing. In **High Contrast Dark** that token resolves to
literal `transparent` — the theme separates surfaces with background contrast
rather than lines, which is a legitimate choice and exactly what a token system
is for.

The lesson generalizes past this spike: **a design whose structure depends on a
border being visible is not theme-safe.** For a control boundary the honest
token is `--silo-color-input-border` (which themes keep visible because inputs
need an edge); `--silo-color-border` is a _hint_, and a layout must still read
correctly when it is invisible. Worth a line in the theming reference, since
nothing currently says so.

### Finding 11 — a third-party UI's own theme shadows your token mapping

The panel rendered in the library's **dark** palette under a **light** Silo
theme. The mapping was correct and still lost: `AcpProvider` renders a div
carrying `data-acp-theme`, and the library defines its whole palette on
`:root,[data-acp-theme=dark]`. Custom properties resolve from the _nearest
defining ancestor_, so that inner div shadowed everything mapped on the panel
root. Import order is irrelevant — the winning declaration has to sit on the
same element (`.acp-chat-root [data-acp-theme]`, (0,2,0) vs (0,1,0)).

The `theme` prop is also passed now, derived from
`ctx.theme.resolve(activeId).colorScheme` and **followed live**, so switching
Silo themes restyles the panel without reopening it (verified across High
Contrast Light → Solarized Dark).

**Generalizes to any embedded third-party UI**: mapping tokens on your own
wrapper is not enough if the library scopes its palette to an element it
renders inside you. Worth stating in the RFC, because bring-your-own-UI
extensions will hit exactly this.

### Chrome, after iterating in the running app

The panel now wears Silo's chrome rather than the library's: the same
`Breadcrumb` the terminal panel uses for its cwd line, and **one composer box**
holding the prompt input with a control row — harness, mode, model — inside the
same outline. The library's own chat header (duplicated the tab title) and
footer (a labelled settings strip) are hidden; its `SessionConfigPanel` is
re-rendered inside our box, with labels and help text suppressed because the
values are self-describing.

The **send button did** end up on the control row after all, without forking
`ChatView`. It lives inside the composer while the row is a sibling, so it
cannot be reordered — but both share `.acp-chat-body`, so the action cluster is
lifted out of flow and dropped onto the row, which reserves height for it. The
composer's nested borders are stripped so only the outer box remains, and send
becomes a filled accent circle.

Getting that to anchor correctly took three tries and produced a CSS lesson
worth keeping: **`backdrop-filter` establishes a containing block for
absolutely positioned descendants, even on a `position: static` element.** The
composer carries `backdrop-filter: blur(12px)`, so the cluster kept anchoring
to it and landing above the row; `position: static` alone did nothing. Only
`backdrop-filter: none` handed the positioning context back. The same is true
of `transform`, `filter`, `perspective`, `contain` and `will-change` — any of
them will quietly capture a descendant a host app is trying to reposition,
which is a recurring hazard when restyling a third-party UI rather than
forking it.

### Finding 12 — switching harness mid-panel was broken, and the transport was innocent

Claude appeared not to work while Cursor did. The transport was fine: probing
`npx @agentclientprotocol/claude-agent-acp` **through the app's own Rust
transport** initialized cleanly, so `PATH`, `npx` resolution and the pipe were
all correct. Isolating that first turned an ambiguous "Claude is broken" into a
five-minute fix.

The bug was in the panel, and it was three overlapping mistakes:

- Both harnesses were registered under one constant **agent id**, and the
  library keys connection and session state by that id — so the new connection
  inherited the old one's state.
- `SessionHost`'s "already started" ref never reset, so `createSession` was
  never called again after a switch.
- The stale `activeSessionId` kept `ChatView` rendering the dead session, which
  is why it looked like nothing happened rather than like an error.

Fixed by giving each harness its own agent id and keying the provider subtree
on the preset, so a switch tears the session down and rebuilds it.

**The generalizable part for the RFC:** an agent session is identified by more
than a label, and switching agents is a _teardown_, not a prop change. A real
implementation needs an explicit session lifecycle — connect, create, dispose —
rather than relying on a component tree to imply it.

## 5d. Spike D — `session/load` restores a conversation across a process death

**This is the finding that changes the architecture recommendation.**

> **Updated 2026-09-09.** This section proved the agent _recalls_ its context; a
> re-run in [`acp-process-ownership.md`](acp-process-ownership.md) §5.2 proved
> the harder claim — the agent **replays the transcript to the client** on
> `session/load` — for `claude`, `cursor`, `opencode` and `pi` by asserting
> message _content_, not recall. It also found `loadSession` + `session/list`
> universal across the catalog and `session/resume` on 3 of 5 (§5.1). The
> capability table in §5h below predates those methods stabilising; §5.1 is
> current. `codex` replay stays unverified (no login on the recon machine).

Earlier this document argued that ACP sessions cannot survive an app restart
without teaching the session-host daemon to own piped children. That is wrong.
The agent **process** dies with the app, but the agent keeps the transcript on
its own side, so a fresh process can `session/load` a persisted id and the
context comes back.

Tested end to end (`scratchpad/acp-probe/probe-load.mjs`, 2026-09-07) — not
"did load return ok" but _does the agent still know something it was told
before the kill_:

1. spawn → `initialize` → `session/new`
2. tell the agent a secret number
3. **`SIGKILL` the process** (what quitting the app does)
4. respawn → `initialize` → `session/load(sessionId)`
5. ask for the number back

| Agent               | `loadSession` | replayed on load                                        | recalled the number |
| ------------------- | ------------- | ------------------------------------------------------- | ------------------- |
| `claude-acp` 0.75.1 | advertised    | 2 updates (`user_message_chunk`, `agent_message_chunk`) | **yes**             |
| `cursor` 2026.09.02 | advertised    | 3 updates (+ `agent_thought_chunk`)                     | **yes**             |

Both replay the prior turns as `session/update` notifications _before_
answering the load, so a client gets the transcript back for free — no
client-side history store needed.

**Consequences for the RFC:**

- Restart survival is a **panel-layer feature** (persist the session id, load
  it on mount), not a daemon rewrite. Much cheaper than previously argued.
- The daemon-owned-children idea is still the only way to keep an agent
  _working_ across a restart — `session/load` restores the conversation, not an
  in-flight turn. That is a genuinely different, and much smaller, promise.
- It is per-agent optional. Both agents tested support it; the registry matrix
  shows `loadSession` widely advertised but not universal, so the model needs a
  "this agent cannot be restored" state rather than assuming it.

### The panel wiring is written but **not yet working**

`AcpChatPanelParams` gained `presetId` + `sessionId`, persisted through
`api.updateParameters` (which serializes into `ws.dockLayout`), and
`SessionHost` now tries `loadSession(restoreSessionId)` before falling back to
`createSession`. Falling back matters: an id can be stale, and a panel that
refuses to open because an old session vanished is worse than one that quietly
starts fresh.

**It did not restore on test.** After planting a fact and reloading the
webview, the panel came back with an empty transcript and the agent had no
recollection — so the restore branch never fired. Most likely the persisted
params did not carry `sessionId` back into `params` on remount; not isolated
further. Treat this section as _designed and typechecked, not verified_ — the
protocol claim above is the part that is proven.

### The standing risk

`@acp-components` is v0.1.0, ~49 stars, one author. Fine for answering "is this
worth the effort." **Not a foundation for the real implementation** — and the
path where a PoC dependency quietly becomes the product is exactly the one this
spike makes tempting, since it already looks like a finished feature.

## 5e. Naming — two open issues to settle before the RFC is accepted

**1. "Registry" is already taken.** This document and RFC 0038 use _registry_ for
`github.com/agentclientprotocol/registry` (the ACP Registry, co-governed by Zed
and JetBrains). Silo already uses the same bare word for
`silo-code/extensions-registry` behind registry.getsilo.dev — its **extension**
catalog. Two registries, two governance models. **Never use the word
unqualified**: it is either the **ACP Registry** or the **Extension Registry**.
Needs fixing in RFC 0038 and a glossary entry.

**2. The non-terminal agent kind needs a user-facing name.** "ACP" is a wire
protocol, and Silo does not name features after their transport — it says
_terminal_, not _PTY_. Candidate: **Chat session** beside **Terminal session**,
both being **Agent Sessions**, with the profile field reading
"Interface: Terminal / Chat". Zed's equivalent ("External Agents") does not
transfer — it distinguishes third-party agents from Zed's own built-in one, and
Silo has no built-in agent for them to be external to.

## 5f. Auth, corrected

Two mechanisms exist, defined in the ACP Registry's `AUTHENTICATION.md`:

- **Agent Auth (browser/OAuth)** — the agent runs a local HTTP server, opens the
  user's default browser, handles the callback, and stores its own credentials.
  **The client does nothing.**
- **Terminal Auth** — the client relaunches the agent with setup args that
  _replace_ its normal args/env, in an interactive terminal.

Split across the 32 probed agents: **16 browser-only, 12 terminal-only, 3 both
or with an env-var option**, 1 that failed to start.

Terminal-only: `amp-acp`, `auggie`, `autohand`, **`claude-acp`**, `dimcode`,
`github-copilot-cli`, `kilo`, `kimi`, `nova`, **`opencode`**, **`pi-acp`**,
`poolside`. Note `github-copilot` (browser) and `github-copilot-cli` (terminal)
are separate entries with different auth for what a user thinks of as one
product.

**Auth style is not declared in the registry** — `agent.schema.json` has no auth
fields at all. It is discoverable only at runtime from `initialize`'s
`authMethods`. A client cannot pre-flight it; it must spawn first.

### Two corrections worth carrying forward

**`authMethods` being non-empty does not mean authentication is required.** It
is a menu of what is _available_. `claude-acp` returns two methods and
`session/new` succeeds anyway. The signal that auth is needed is **`session/new`
failing**, not the presence of methods.

**An installed, logged-in CLI carries the adapter.** `claude-agent-acp` reuses
the existing Claude Code login — a user who already has Claude Code working does
**not** authenticate again. Probed 2026-09-08: `session/new` succeeded even with
`CLAUDE_CONFIG_DIR` pointed at an empty directory, so the credential is not
(only) in the config dir — plausibly the system keychain, though that was not
isolated. Practical consequence: for the agents most likely to be used first,
onboarding is "create a profile and go", with no auth step at all.

## 5g. Prior art — Conductor's agent settings

Conductor (`com.conductor.app`) has the best agent-onboarding page found in this
survey. Observed 2026-09-08. Worth taking three things from it:

- **A per-agent tab strip** (Claude Code · Codex · Cursor · OpenCode) — a small
  curated set, not a registry browse.
- **An embedded terminal for login.** A "Running codex login" panel streams the
  real command output inline in Settings, including the localhost OAuth URL as a
  fallback when the browser does not open, and the `--device-auth` hint for
  headless machines. **Silo is better positioned for this than Conductor** —
  they had to build a mini-terminal inside a settings page; Silo already has a
  first-class PTY host, and ACP's `type: "terminal"` auth methods hand over
  literal argv to run.
- **A connection card**: Connected · Provider · Plan · Auth · Account. This is
  the differentiator, and **none of it comes from ACP** — no `initialize`
  payload captured here carries an account or plan (`claude-acp` has an empty
  `providers` object and a vendor `_meta`; Cursor and Gemini have nothing).
  Conductor gets it by running each CLI's own status command — per-agent
  knowledge, i.e. exactly what a curated catalog is for.

They also **vendor their own binaries** (`com.conductor.app/bin/codex`) and
honour the user's `.nvmrc` to pick a Node version. Costs before copying that:
disk, an update path, and licensing — `claude-agent-acp` is `license:
proprietary` in the ACP Registry.

Framing caveat: Conductor's page is **CLI account management, not ACP
onboarding** — its auth choice is "CLI or API key". That arguably makes it more
useful, since account management is the layer both of Silo's paths share.

## 5h. One list, not two — the discovery design

**"Which ACP servers are on this machine" is not a scannable question.** There
is no on-disk convention, manifest, or install location. But it does not need to
be: whether an agent speaks ACP is a **static fact about the agent**, exactly
like `promptDelivery` and `configDirEnvVar` already are. Compose that catalog
fact with the binary detection Silo already does, and one list serves both
paths.

Probed against the eight CLIs installed on this machine (2026-09-08). The four
claiming ACP were **spawned and `initialize`d**, not merely grepped:

| CLI            | Chat mode                              |
| -------------- | -------------------------------------- |
| `cursor-agent` | built in — `acp` subcommand (verified) |
| `opencode`     | built in — `acp` subcommand (verified) |
| `gemini`       | built in — `--acp` (verified)          |
| `copilot`      | built in — `--acp` (verified)          |
| `claude`       | adapter — `claude-agent-acp` (npx)     |
| `codex`        | adapter — `codex-acp` (npx)            |
| `pi`           | adapter — `pi-acp` (npx)               |
| `grok`         | none                                   |

Half of a typical install already speaks ACP with nothing to fetch.

**`grok` is the cautionary case and vindicates the recon rule.** Its `--help`
mentions ACP — as an _output format_ ("one ACP session update per line"), not a
server mode. A naive `--help | grep acp` would list it and it would fail at
runtime. The check is a run, not a read of `--help`.

The resulting **Found on this machine** section shows one row per agent with the
modes it supports:

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

The user picks an agent they recognise, then how to run it. They never meet the
word "ACP", and a row that cannot offer Chat simply does not.

Cost: **one new catalog field** (`acpLaunch`: built-in args | adapter package |
none), established by the same run-it recon. Another argument for keeping the
catalog curated rather than driving discovery off the ACP Registry — the
registry cannot tell you that _this machine's_ `claude` implies the adapter will
work.

## 6. Constraints inside Silo

- **No transport exists.** `ctx.process.spawn` is a **PTY**; `exec` is one-shot
  buffered. Neither is a long-lived duplex pipe.
- **Do not attempt JSON-RPC over a PTY.** A PTY echoes input, applies line
  discipline, and mangles at canonical-mode boundaries — it would look fine on
  small frames and silently corrupt large ones, the exact failure class RFC 0033
  phase 3 was built to avoid.
- **An extension cannot spawn a piped-stdio child.** Extensions run in the
  webview (no Node runtime), and reaching a Tauri command directly is the
  platform ban, enforced by lint and by package visibility.

So the transport is host-side Rust regardless of where anything else lands.

---

## 7. Open questions for a proposal

1. **Record shape** — discriminated union on `AgentProfile` (one list, arms that
   genuinely differ), or a separate ACP record? Zed's union is the precedent.
2. **Sandbox posture** — decline `terminal/create` and `fs/*` in a first phase,
   or expose them unconfined and say so? Finding 1 means neither choice actually
   protects the user's files; it only changes what Silo is complicit in.
3. **Relationship to [RFC 0020](./proposals/0020-agent-hook-activity-channel.md)** —
   ACP supplies the authoritative activity channel that RFC proposes to build
   from hooks. Supersede, or coexist?
4. **Relationship to [RFC 0035](./proposals/0035-agent-prompt-composer.md)** — a
   host-owned prompt composer is most of what an ACP transcript already is.
5. **Where the Spike A harness lives.** The Rust transport (Spike B) has a
   natural home and re-runnable tests. The JS probe does not: `spikes/` is not
   an existing convention here and would not be a pnpm workspace package (globs
   are `apps/*`, `packages/*`, `examples/extensions/*`), so it is still in
   scratchpad. RFC 0033's recon discipline argues for keeping it re-runnable;
   this needs a call.
6. **Registry consumption** — read `.protocol-matrix` and the registry index
   directly, or maintain a Silo-side catalog as `AGENT_CATALOG` does today?

## 8. Reproducing

```sh
node probe.mjs claude-acp
node probe.mjs cursor --prompt "…"
node probe.mjs gemini
```

Writes `frames-<agent>.jsonl` (every frame, both directions, with ms offsets)
and `summary-<agent>.json` (capabilities, update-kind histogram, permission
requests, trailing stderr).

## References

- Spec: <https://agentclientprotocol.com> · registry:
  `github.com/agentclientprotocol/registry` · matrix:
  `.protocol-matrix/latest.md`
- Zed client: `zed-industries/zed` — `crates/agent_servers`, `crates/acp_thread`,
  `crates/settings_content/src/agent.rs`
- Zed docs: <https://zed.dev/docs/ai/external-agents> · registry announcement:
  <https://zed.dev/blog/acp-registry>
- Silo: [RFC 0033](./proposals/0033-agent-profiles.md) (agent profiles),
  [RFC 0018](./proposals/0018-ctx-agents-surface.md) (`ctx.agents`),
  [RFC 0020](./proposals/0020-agent-hook-activity-channel.md),
  [RFC 0035](./proposals/0035-agent-prompt-composer.md),
  [RFC 0006](./proposals/0006-extension-permissions-sandbox.md) (sandbox),
  [ADR 0028](./decisions/0028-sealed-agent-detection.md) (sealed detection)
