# ACP recon probes

`recon-2026-09-09.mjs` — the §4.6 recon for
[`docs/acp-process-ownership.md`](../../docs/acp-process-ownership.md). Speaks
newline-delimited JSON-RPC to an ACP agent over piped stdio, no deps.

```
node recon-2026-09-09.mjs                 # all agents
node recon-2026-09-09.mjs claude,cursor   # a subset
ACP_REAL_CONFIG=1 node recon-2026-09-09.mjs claude   # use ~/.claude, not an isolated config dir
ACP_STDERR=1 node recon-2026-09-09.mjs pi            # surface the child's stderr
```

Covers: full capability dump, `session/list` / `session/close`, `session/load`
on a live session, and Spike D asserting transcript **content** replays (plant a
passphrase → SIGKILL → respawn → load → read the `session/update`s → ask for it
back). Results distilled into `acp-process-ownership.md` §5.

---

`subagent-finish-2026-10-06.mjs` — settles the open question in
[RFC 0055](../../docs/proposals/0055-chat-async-tasks.md)'s Decision section:
with **no capability advertised**, is a backgrounded subagent's completion
observable? Dispatches a `Task` with `run_in_background: true`, logs every frame
in both directions, and dwells past the subagent's finish.

```
node subagent-finish-2026-10-06.mjs
PROBE_DWELL_MS=180000 PROBE_SLEEP_SECONDS=60 node subagent-finish-2026-10-06.mjs
PROBE_AGENT=@agentclientprotocol/claude-agent-acp@latest node subagent-finish-2026-10-06.mjs
```

Defaults to the real `~/.claude` (the probe is worthless if the agent can't run
a Task) and to the adapter version `catalog/claude.ts` pins. It refuses to start
if the advertised `clientCapabilities` mention `subagents` or AIR, since a
capability-on capture cannot answer the question.

**Answer:** no second `tool_call_update` ever arrives on the dispatching
`toolCallId` — it settles `completed` ~0.4s after the hand-off and is never
named again, and the `agentId` from `async_launched` appears nowhere else. But
the completion _is_ observable without any capability, because
`run_in_background: true` does **not** detach the subagent from the ACP turn:
the subagent's own tool calls stream onto the parent session stamped
`_meta.claudeCode.parentToolUseId`, and `session/prompt` does not resolve until
the subagent is done (57.5s past the hand-off in the committed capture). Its
prose is not forwarded — the adapter gates that on `clientSupportsSubagents`.

**Both regimes occur — don't read the captures here as universal.** Two
independent Silo sessions on the same adapter version, also capability-off, did
the opposite: `session/prompt` resolved while the subagent was still working,
and the remaining child calls landed in a later agent-initiated turn (journal
`e88de454-…`, 2026-10-06 — child call at line 49, `origin: human` turn end at
52, more child calls at 53 and 59, `origin: task-notification` end at 96).
Whether the parent ends its turn after dispatching is a model decision, not a
protocol guarantee; those sessions ran opus, this probe takes the CLI default.
Anything built on this has to handle both. Pin the model and re-run to settle
which factor drives it.

`captures/` holds the run behind that paragraph, so the finding is re-readable
without a rerun. Three guards earn their keep, each after a wrong answer:

- **`session/cancel` propagates into the subagent.** Using it to force an idle
  window leaves the output file ending `[Request interrupted by user]`, so the
  subagent never finishes and "nothing reported it" is vacuous. Hence
  `PROBE_FORCE_IDLE_MS=0` by default and the `cancelKilledSubagent` check.
- **The control must read the subagent's own `assistant` reply.** A naive
  `/FINISHED/` over the output file matches the _prompt_ echoed back as the
  first `user` record, which reported success on a killed run.
- **A long turn is not a stalled agent.** Attribute tool calls by
  `parentToolUseId` before concluding the agent refused to detach.

---

`background-shell-2026-10-08.mjs` — settles the last open item in
[RFC 0055](../../docs/proposals/0055-chat-async-tasks.md) and underwrites
[RFC 0058](../../docs/proposals/0058-backgrounded-shells.md): what arrives for a
backgrounded **shell** in the main session? Runs a `Bash` with
`run_in_background: true` (not a `Task`), told explicitly not to poll it, and
dwells past the command's finish.

```
node background-shell-2026-10-08.mjs
PROBE_SLEEP_SECONDS=45 node background-shell-2026-10-08.mjs
PROBE_DWELL_MS=180000 node background-shell-2026-10-08.mjs
```

Advertises AIR `asyncTasks` alongside `nativeSubagentSessions`, and re-implements
the adapter's own gate to refuse a run that would silently be capability-off —
the same trap as the subagent probe, where a failed opt-in is indistinguishable
from an adapter that doesn't do this.

**Answers** (capture `captures/frames-bgshell-2026-10-08T21-00-50-385Z.jsonl`):

- The `backgrounded` marker **does** land on the main-session `Bash` call, on a
  frame carrying `status: "completed"` — the lie, and the thing to render past.
- Tool call and `async_task_*` lifecycle arrive on **one sessionId**, so RFC
  0057's routing is not a prerequisite. (The committed subagent capture is the
  cross-session case: the shell's call sat on the child while its lifecycle was
  published on the root, because `AsyncTaskRuntime` is per `session/new`.)
- **The turn ends 24s before the command does** — turn end `+23.0s`, terminal
  state `+46.9s`. Anything gated on session activity would hide the indicator
  for the whole window it exists for.
- The **double terminal reproduces**: `state: "stopped"` then `state:
"completed"`, same millisecond. The adapter's `finish()` documents it as a
  best-effort "level" state corrected by the authoritative "event" edge — so a
  reducer that latches the first renders a successful command as stopped.
- `async_task_spawned` carries **no `toolCallId`**; correlation first arrives on
  the following `async_task_progress`. The spawn is also the only frame carrying
  `name`, `taskType` and `canStop`, so it cannot be skipped.
