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
5. **Where the harness lives.** `spikes/` is not an existing convention here and
   would not be a pnpm workspace package (globs are `apps/*`, `packages/*`,
   `examples/extensions/*`). RFC 0033's recon discipline argues for keeping a
   re-runnable probe somewhere; this needs a call.
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
