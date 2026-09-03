---
status: implemented
created: 2026-09-01
---

# 0034. Control API — a return channel for the `silo` command

## Summary

A request/response control channel into a running Silo instance, so a command
can answer its caller: stdout, a real exit code, and a stable `--json` envelope.
Before this, the CLI was a one-way forwarder — argv went in, `exit 0` came out,
and the result landed in the webview's console.

This is the **Control** execution mode ADR 0047 named but left unbuilt. It
shipped with three consumers: `silo status`, `silo ws list`, and a converted
`silo agent run` that returns the terminal id it created.

Implemented in this repo: `apps/desktop/src-tauri/src/commands/control/`
(transport, envelope, registry, client, disk-read, host-answered `status`),
`apps/desktop/src/control/` (webview op handlers), and
`crates/pty-host/src/paths.rs` (the runtime-base resolver, made public).

## Motivation

ADR 0047 decided the CLI's primary consumer is coding agents. An agent driving a
fire-and-forget CLI cannot tell success from silence, cannot learn the id of a
thing it just created, cannot read live state, and cannot fail a script —
`silo … || handle_error` never fires.

The cost of deferring was worse than the gap: every command shipped in the
meantime would be shaped for silence and would gain its answer later as a
breaking change.

ADR 0012 had already proved the mechanism — a loopback HTTP RPC that operates
the live app — but is dev-only and compiled out of release precisely because
nobody had answered whether a control surface belongs in a shipped build. That
question was this proposal's real content, and its answer is **ADR 0049**.

## Final design

A **Unix domain socket / Windows named pipe** in ADR 0022's ephemeral runtime
tier, one newline-delimited JSON request and one response per connection,
answered by the running instance and printed by the short-lived CLI process with
a real exit code.

**Transport.** `<runtime-base>/silo-ctl/<ns>/control.sock` on Unix (directory
`0700`, socket `0600`), `\\.\pipe\silo-control-<ns>` on Windows. The namespace
is the existing `SILO_PTY_NS` value, so Silo Dev and a release install can never
address each other. Authorization is the file mode — there is no token, and no
TCP port is opened in any build. The listener binds during startup rather than
on webview-ready, so socket presence means "the process is alive".

**The client runs before Tauri init**, in `main.rs` immediately after the
existing `local_flag_response` check — the same seam ADR 0047 established for
Local mode. That is what keeps a Control command from touching
`tauri-plugin-single-instance`, focusing a window, or waking a cold instance.
Both `silo` shims `exec` the app binary, so the process sending a request and
the one answering it are the same build; there is nothing to negotiate, which is
why the request carries no version field and why the client can synthesize a
complete envelope from its own build.

**The envelope**, on the wire and on `--json` stdout:

```jsonc
{ "v": 1, "ok": true,  "data": {}, "silo": { "version": "…", "identity": "…" } }
{ "v": 1, "ok": false, "error": { "code": "not-found", "message": "…" }, "silo": {…} }
```

`v` versions the envelope as a whole and changes only on a breaking envelope
change; per-command `data` shapes grow additively. One serializer owns both
success and failure, so no op can invent a response shape.

**Error codes are a closed vocabulary** with a fixed exit-code mapping:

| Code           | Exit | When                                                            |
| -------------- | ---- | --------------------------------------------------------------- |
| _(success)_    | 0    | The op ran and answered.                                        |
| _(unassigned)_ | 1    | Deliberately unused, so a crash stays distinguishable.          |
| `invalid-args` | 2    | Syntactic usage error. Client-side; never sent on the wire.     |
| `not-running`  | 3    | No instance listening on this identity's socket.                |
| `not-found`    | 4    | A named workspace, profile, or terminal does not exist.         |
| `denied`       | 5    | Op not in the allowlist.                                        |
| `timeout`      | 6    | The instance did not answer, or become ready, in time.          |
| `failed`       | 7    | The op ran and could not complete — the environment, not a bug. |
| `internal`     | 70   | Silo malfunctioned: host error, unparseable reply, socket I/O.  |

`failed` and `internal` are separate from the start because "your profile's
command isn't installed" must never share a code with "Silo is broken", and a
closed vocabulary means splitting them later would be exactly the breaking
change this proposal exists to avoid.

**The operation allowlist** is a static table; an unknown op is `denied` before
anything reaches the webview:

| Op          | Tier   | Answered by | Backing command               |
| ----------- | ------ | ----------- | ----------------------------- |
| `status`    | read   | host        | `silo status`                 |
| `ws.live`   | read   | webview     | `silo ws list` (live overlay) |
| `agent.run` | mutate | webview     | `silo agent run`              |

**`status` is answered host-side**, never round-tripping to the webview, and
reports a **readiness** flag the webview sets when its dispatcher registers.
That is what makes a wedged app diagnosable — it still answers, saying
`webview: "starting"` — and it is what `--launch` polls. Waiting on readiness
rather than on socket existence is load-bearing: the socket binds at process
start, so every cold launch spends its first seconds alive-but-not-serving, and
a boolean probe there duplicates the app instead of waiting for it.

**`silo ws list` is Disk-read with a Control overlay.** The client reads
`<config>/workspaces/*.json` itself and that listing _is_ the answer, with or
without a running app; `ws.live` then annotates each row with open/soft-closed
and which is active. The response records **whether the overlay was applied**,
so "not open" never looks like "unknown because nothing was running". It takes
no `--launch` — a Disk-read command starting a desktop app is what fail-fast
exists to forbid.

**Cold behavior is fail-fast**: no instance listening exits `not-running`, and
`--launch` opts into starting the app and waiting for readiness.

## Decisions worth keeping

1. **A socket, not promoted loopback HTTP.** A listening TCP port in a release
   build is what ADR 0012's gate exists to prevent, and OS file permissions are
   a stronger and simpler authorization story than a token the CLI would have to
   read from disk as the same user anyway.
2. **The allowlist is closed and every op is labelled `read` or `mutate`.** Both
   tiers are reachable over one socket — there is a single principal behind a
   `0600` file, so a second runtime gate would restrict the user from themselves.
   The label is what makes the surface auditable.
3. **No op may require user confirmation.** ADR 0047 rule 7 says an agent cannot
   answer a modal, so an op that would ask is _not admitted to the registry_.
   Shipping a `--yes` flag and a `confirms` column no op sets would be an
   untested path with no caller. Admitting the first such op is an amendment to
   this proposal and to ADR 0047, not a flag added in advance.
4. **Extensions never reach the channel.** This is a host↔CLI surface: no `ctx`
   member, no SDK export, and the handlers live in `apps/desktop/src/control/`
   beside the existing CLI handlers rather than in any extension package.
5. **The envelope is versioned on the response only**, because both halves are
   the same executable. Its audience is third-party `--json` consumers.

## Breaking changes

**`silo agent run` no longer launches Silo when nothing is running.** It exits
`not-running` (3); `--launch` restores the old behavior explicitly. Taken
deliberately while the command had no established users, because the alternative
is a CLI whose cold behavior varies per verb — the thing an agent cannot learn
once and rely on. The `PendingLaunchArg` cold-launch arm was removed for this
command only; `silo <path>`, `install`, and `uninstall` keep theirs.

**`ws` is now a live reserved noun.** `silo ws` and unknown `ws` verbs report
usage instead of opening a folder, matching `agent`. `./ws` and `silo -- ws`
still open a folder of that name.

**`silo agent run` now conforms to ADR 0047 rule 5.** A cwd inside no workspace
is `not-found` rather than a silent workspace create — the divergence ADR 0047
recorded is fixed.

## Requirements that still matter

- A Control invocation never goes through `tauri-plugin-single-instance` and
  never focuses or raises the window as a side effect.
- `--json` puts the envelope on stdout and **nothing else**; a human-mode
  failure writes nothing to stdout, so `x=$(silo …)` captures an empty string
  rather than an error message. Diagnostics go to stderr.
- `invalid-args` vs. `not-found` is **syntactic vs. referential**: the client
  rejects only what it can judge alone. Whether a syntactically valid name
  exists is always the instance's answer.
- Every error code maps to a distinct non-zero exit code, and exit 1 stays
  unassigned. The mapping lives in one place and is exhaustively tested.
- An op that names a workspace, profile, or terminal that does not exist fails
  `not-found` — never a silent create, never a fallback target.
- A failed `agent run` leaves no half-created terminal: every refusal happens
  before anything is created.
- Requests are correlated by a host-side monotonic id, never by the client's,
  so one client cannot address another's pending entry.

## Known limitations

- **The socket file outlives the process.** The listener runs on a detached
  thread, so process exit never unwinds it and `Drop` never unlinks the path —
  on every exit path, not just a crash. This is deliberate: an exit hook would
  cover only a graceful quit, leaving takeover to handle a crash regardless. The
  leftover path is inert — the next bind connect-probes, unlinks the corpse and
  rebinds, and a client reaching it meanwhile gets `not-running`. Verified live.
- **The Windows pipe is not owner-only.** It takes `CreateNamedPipeW`'s default
  DACL — creator and administrators full control, **Everyone read**. Another
  local user cannot write a request and so cannot drive an op, but the pipe is
  not owner-exclusive the way the Unix socket is. Setting an explicit security
  descriptor is the fix, deferred to a change that can be tested on Windows.
- **A prompt is delivered or refused, never approximated.** `--prompt` rides
  RFC 0033 phase 3's transport. The handler does not reimplement any of it: it
  resolves the profile, the `--ws` target and the launch cwd, then delegates to
  the same service `ctx.agents.profiles` is built from, so the precheck, the
  dialect decision and the activate/focus have one owner and the CLI and an
  extension cannot drift on them. Every prompt refusal maps to `failed` — which
  agent the profile resolves to, whether that agent's CLI takes a prompt, and
  whether Silo knows the shell's exact quoting rule are all facts about the
  environment, never malfunctions.
- **`agent run` does not report whether the agent's command actually started.**
  The launch line is typed into a shell at drain time, so a `command not found`
  surfaces in the terminal after the response is already written. The caller
  gets the terminal id — a real handle it can watch — rather than a guess.

## Deferred

**Convergence with ADR 0012's automation RPC.** They overlap but are not the
same surface: automation taps source-of-truth internals (the Monaco event
timeline, focus state) for tests and is compiled out of release. Converging buys
one transport and one auth story; it risks widening the release surface to reach
test-only taps, and the repo's `verifier-gui` workflow depends on the existing
server. Left open, not answered.

Also out of scope and still owned elsewhere: bare `silo agent run`'s interactive
picker and `silo agent list` (RFC 0033 phase 9 — unblocked by this change),
extension-contributed commands (RFC 0005 / RFC 0006), `term` verbs, and any `ws`
verb beyond `list`.

## Related decisions

- [ADR 0049](../decisions/0049-control-api-transport-and-authorization.md) — the
  Control API's transport and authorization model: the OS-gated socket, the
  closed allowlist, why no token, why no consent mechanism, why ADR 0012 stays
  separate.
- [ADR 0047](../decisions/0047-cli-command-grammar.md) — the CLI grammar this
  builds the Control mode of; see its 2026-09-03 amendment.
- [ADR 0022](../decisions/0022-on-disk-storage-layout.md) — the runtime tier the
  socket lives in, its identity keying, and the `$TMPDIR` reap case.
- [ADR 0012](../decisions/0012-dev-automation-rpc.md) — the dev-only automation
  server, and the round-trip-through-the-webview pattern this reuses.
- [RFC 0033](./0033-agent-profiles/proposal.md) — Agent Profiles; owns prompt
  delivery (phase 3) and the CLI read-back half (phase 9).
