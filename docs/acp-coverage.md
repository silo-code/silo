# ACP coverage

Which [Agent Client Protocol](https://agentclientprotocol.com) features Silo
uses, and which are available but unused.

Silo hand-rolls its ACP client — there is no `@agentclientprotocol/sdk`
dependency — so nothing bumps a version to signal that the protocol moved. This
file is the record instead. Regenerate it with the `silo-acp-watch` skill; the
`git diff` is the delta since last time.

Background: [RFC 0038](proposals/0038-acp-agent-sessions.md),
[`acp-recon.md`](acp-recon.md), [`acp-process-ownership.md`](acp-process-ownership.md).

## Top 5 to tackle

_Hand-written, ranked by user-visible value per unit of work. Re-judged on
each regeneration — see the detail under [Analysis](#analysis)._

| #   | Feature                    | Why it's worth it                                                             | Size | Gate                             |
| --- | -------------------------- | ----------------------------------------------------------------------------- | ---- | -------------------------------- |
| 1   | **Elicitation**            | Agent asks a real structured question instead of a yes/no permission prompt   | M    | None — build it                  |
| 2   | **Agent file read/write**  | Agent sees unsaved editor buffers, not just disk; one audited path for access | L    | RFC (host-mediated fs is new)    |
| 3   | **Sign-in**                | Unblocks any agent needing auth; RFC 0038 phase 5 already committed to it     | M    | None — design exists             |
| 4   | **`config_option_update`** | Fixes a real staleness bug: non-mode options changed agent-side never refresh | S    | None — smallest win here         |
| 5   | **Agent terminals**        | Agent-run commands become inspectable Silo terminals instead of opaque output | L    | RFC (panel vs. inline undecided) |

Ranking logic: elicitation and sign-in are self-contained and need no new
architecture, so they come first despite not being the biggest. Agent file
access is the highest-value item on the list but needs a decision recorded
before any code. `config_option_update` is out of order on value alone — it's
here because it's a genuine bug and an afternoon's work. Agent terminals are
last of the five only because the design question is the hard part.

Deliberately **not** on the list: `session/delete` (real but minor),
`mcpCapabilities` and `additionalDirectories` (unused on purpose), and
everything in the `v2 draft` tier (unreachable — see the end of Analysis).

## Analysis

_Hand-written. Why a given gap is or isn't worth closing. Survives
regeneration._

The generated table lists 20 unused v1-stable names. They are not 20 pieces of
work — they cluster into five, in rough order of what they'd change for a user.

**Agent-driven file reads and writes** (`fs/read_text_file`,
`fs/write_text_file`, `ClientCapabilities.fs`). Silo advertises
`fs: { readTextFile: false, writeTextFile: false }` and declines the whole
prefix via `DECLINED_METHOD_PREFIXES` in `acp-jsonrpc.ts`, so agents fall back
to their own disk access. Honouring these would route agent file access through
the host — the same path extensions take through `ctx`, with Silo's unsaved
editor buffers visible to the agent rather than just what's on disk. This is
the largest gap and the one with the clearest product story.

**Agent-driven terminals** (`terminal/create`, `terminal/output`,
`terminal/kill`, `terminal/release`, `terminal/wait_for_exit`,
`ClientCapabilities.terminal`). Declined by the same prefix list. Silo already
owns a session host and a terminal surface, so the pieces exist; the question
is whether an agent-spawned command should appear as a real terminal panel or
as an inline block in the Chat transcript. That's a design decision, not just
plumbing — worth an RFC before any code.

**Sign-in** (`authenticate`, `logout`, `AgentCapabilities.auth`,
`ClientCapabilities.auth`). Already owed: RFC 0038 phase 5 commits to the
connection card and "Sign in" and has not shipped. The protocol side is small;
the UI is the work.

**Elicitation** (`elicitation/create`, `elicitation/complete`,
`ClientCapabilities.elicitation`) — the agent asking a structured question
rather than a permission yes/no. Stable since schema v1 1.21.0. Silo has a
permission-request path to model it on, and the SDK sheet/modal kit to render
it. Mid-sized, self-contained, no architectural decision needed.

**Session deletion** (`session/delete`, `SessionCapabilities.delete`). Silo
lists and resumes sessions but never deletes one, so a user clearing out old
chats has no protocol-level way to do it. Small.

Two leftovers worth noting but not grouping:

- `config_option_update` — the read-back half of `session/set_config_option`.
  Silo writes config options, and reflects an agent-side _mode_ change via
  `current_mode_update`, but has no handling for the generic update, so any
  other option changed agent-side can leave a bound Select stale. Smallest
  real bug on the list.
- `AgentCapabilities.mcpCapabilities` and `SessionCapabilities.additionalDirectories`
  — Silo does no MCP-over-ACP and passes a single working checkout. Both are
  genuinely unused rather than accidentally missed; leave them.

**v2 is not in scope.** Silo already offers `protocolVersion: 2`
(`acp-jsonrpc.ts`) and every catalog adapter negotiates back down to 1, so
nothing in the `v2 draft` tier is reachable yet. Revisit when an adapter in the
version table accepts 2.

**Vendor extensions are outside this table entirely.** Everything below is
generated from the ACP schema, so a capability an adapter carries in its own
`_meta` namespace is invisible here no matter how useful it is.
`claude-agent-acp` has a substantial one — it calls it **AIR**, under
`_meta.jetbrains.air` — gating `asyncTasks` (background shells and subagents as
a task lifecycle: `async_task_spawned` / `_progress` / `_state_update`),
`nativeSubagentSessions` (each subagent as its own addressable session), and
`sessionFailure`.

**Silo advertises `nativeSubagentSessions`** (RFC 0057,
[ADR 0057](decisions/0057-advertising-a-vendor-protocol-extension.md)) — the
one vendor extension it opts into, sent as `_meta.jetbrains.air` on both
`initialize` and `session/new`. It supplies the identified per-subagent
terminal state the ACP schema has no equivalent for, which is what lets the
Chat panel report _which_ delegated agent finished. The extension's own update
kinds (`subagent_spawned` / `subagent_state_update`) are read only in
`chat-delegated-work.ts`; the canonical replacement (ACP PR #1992's
consolidated `subagent_update`, merged 2026-09-30, absent from the published
SDK and the adapter's runtime) lands there when it arrives. `asyncTasks` and
`sessionFailure` are **not** advertised — advertising a capability nothing
consumes only puts unread frames on the stream.

The adapter also sends one unnamespaced extra Silo relies on: a per-turn
`usage_update` stamped with `_meta["_claude/origin"]`, the only authoritative
turn-end signal for a turn the host never prompted (see
`chat-turn-signals.ts`). Recorded frames and the designs built on them are in
[RFC 0055](proposals/0055-chat-async-tasks.md) and
[RFC 0057](proposals/0057-subagent-sessions.md). Check the adapter's `dist/`
for drift — nothing here will tell you when a vendor extension moves.

<!-- acp-coverage:generated:start -->

_Generated by `silo-acp-watch` on 2026-10-02 against schema v1 1.24.1 / v2 2.0.0-alpha.7. Do not hand-edit below this line._

## Unused, and available today

Every v1-stable name Silo's client does not reference. These are the
features the protocol commits to and Silo is not using.

| Surface             | Name                     |
| ------------------- | ------------------------ |
| AgentCapabilities   | `auth`                   |
| AgentCapabilities   | `mcpCapabilities`        |
| ClientCapabilities  | `auth`                   |
| ClientCapabilities  | `elicitation`            |
| ClientCapabilities  | `session`                |
| SessionCapabilities | `additionalDirectories`  |
| SessionCapabilities | `delete`                 |
| agentMethods        | `authenticate`           |
| agentMethods        | `logout`                 |
| agentMethods        | `session/delete`         |
| clientMethods       | `elicitation/complete`   |
| clientMethods       | `elicitation/create`     |
| clientMethods       | `fs/read_text_file`      |
| clientMethods       | `fs/write_text_file`     |
| clientMethods       | `terminal/create`        |
| clientMethods       | `terminal/kill`          |
| clientMethods       | `terminal/output`        |
| clientMethods       | `terminal/release`       |
| clientMethods       | `terminal/wait_for_exit` |
| sessionUpdates      | `config_option_update`   |

## Adapter versions

| Adapter                                 | Pinned in catalog | Latest on npm |
| --------------------------------------- | ----------------- | ------------- |
| `@agentclientprotocol/claude-agent-acp` | 0.75.1            | 0.85.1        |
| `@agentclientprotocol/codex-acp`        | 1.10.0            | 2.1.1         |
| `pi-acp`                                | 0.0.33            | 0.0.34        |

## Full coverage

### Agent methods — what Silo can call

| Name                        | Tier      | Silo   |
| --------------------------- | --------- | ------ |
| `authenticate`              | v1 stable | **no** |
| `initialize`                | v1 stable | yes    |
| `logout`                    | v1 stable | **no** |
| `session/cancel`            | v1 stable | yes    |
| `session/close`             | v1 stable | yes    |
| `session/delete`            | v1 stable | **no** |
| `session/list`              | v1 stable | yes    |
| `session/load`              | v1 stable | yes    |
| `session/new`               | v1 stable | yes    |
| `session/prompt`            | v1 stable | yes    |
| `session/resume`            | v1 stable | yes    |
| `session/set_config_option` | v1 stable | yes    |
| `session/set_mode`          | v1 stable | yes    |
| `auth/login`                | v2 draft  | **no** |
| `auth/logout`               | v2 draft  | **no** |

### Client methods — what an agent can ask Silo to do

| Name                         | Tier      | Silo   |
| ---------------------------- | --------- | ------ |
| `elicitation/complete`       | v1 stable | **no** |
| `elicitation/create`         | v1 stable | **no** |
| `fs/read_text_file`          | v1 stable | **no** |
| `fs/write_text_file`         | v1 stable | **no** |
| `session/request_permission` | v1 stable | yes    |
| `session/update`             | v1 stable | yes    |
| `terminal/create`            | v1 stable | **no** |
| `terminal/kill`              | v1 stable | **no** |
| `terminal/output`            | v1 stable | **no** |
| `terminal/release`           | v1 stable | **no** |
| `terminal/wait_for_exit`     | v1 stable | **no** |

### Session updates — what an agent streams to Silo

| Name                        | Tier        | Silo   |
| --------------------------- | ----------- | ------ |
| `agent_message_chunk`       | v1 stable   | yes    |
| `agent_thought_chunk`       | v1 stable   | yes    |
| `available_commands_update` | v1 stable   | yes    |
| `config_option_update`      | v1 stable   | **no** |
| `current_mode_update`       | v1 stable   | yes    |
| `plan`                      | v1 stable   | yes    |
| `session_info_update`       | v1 stable   | yes    |
| `tool_call`                 | v1 stable   | yes    |
| `tool_call_update`          | v1 stable   | yes    |
| `usage_update`              | v1 stable   | yes    |
| `user_message_chunk`        | v1 stable   | yes    |
| `compaction_summary_chunk`  | v1 unstable | **no** |
| `compaction_update`         | v1 unstable | **no** |
| `notice`                    | v1 unstable | **no** |
| `plan_removed`              | v1 unstable | **no** |
| `plan_update`               | v1 unstable | **no** |
| `session_message`           | v1 unstable | **no** |
| `session_message_chunk`     | v1 unstable | **no** |
| `subagent_update`           | v1 unstable | **no** |
| `agent_message`             | v2 draft    | **no** |
| `agent_thought`             | v2 draft    | **no** |
| `state_update`              | v2 draft    | **no** |
| `terminal_output_chunk`     | v2 draft    | **no** |
| `terminal_update`           | v2 draft    | **no** |
| `tool_call_content_chunk`   | v2 draft    | **no** |
| `user_message`              | v2 draft    | **no** |

### `agentCapabilities`

| Name                  | Tier        | Silo   |
| --------------------- | ----------- | ------ |
| `auth`                | v1 stable   | **no** |
| `loadSession`         | v1 stable   | yes    |
| `mcpCapabilities`     | v1 stable   | **no** |
| `promptCapabilities`  | v1 stable   | yes    |
| `sessionCapabilities` | v1 stable   | yes    |
| `nes`                 | v1 unstable | **no** |
| `positionEncoding`    | v1 unstable | **no** |
| `providers`           | v1 unstable | **no** |
| `session`             | v2 draft    | **no** |

### `sessionCapabilities`

| Name                    | Tier        | Silo   |
| ----------------------- | ----------- | ------ |
| `additionalDirectories` | v1 stable   | **no** |
| `close`                 | v1 stable   | yes    |
| `delete`                | v1 stable   | **no** |
| `list`                  | v1 stable   | yes    |
| `resume`                | v1 stable   | yes    |
| `fork`                  | v1 unstable | **no** |
| `mcp`                   | v2 draft    | **no** |
| `prompt`                | v2 draft    | **no** |

### `promptCapabilities`

| Name              | Tier      | Silo |
| ----------------- | --------- | ---- |
| `audio`           | v1 stable | yes  |
| `embeddedContext` | v1 stable | yes  |
| `image`           | v1 stable | yes  |

### `clientCapabilities` — what Silo advertises

| Name                | Tier        | Silo   |
| ------------------- | ----------- | ------ |
| `auth`              | v1 stable   | **no** |
| `elicitation`       | v1 stable   | **no** |
| `fs`                | v1 stable   | yes    |
| `session`           | v1 stable   | **no** |
| `terminal`          | v1 stable   | yes    |
| `nes`               | v1 unstable | **no** |
| `plan`              | v1 unstable | **no** |
| `positionEncodings` | v1 unstable | **no** |
| `subagents`         | v1 unstable | **no** |

<!-- acp-coverage:generated:end -->
