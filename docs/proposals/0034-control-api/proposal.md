---
status: accepted
created: 2026-09-01
---

# 0034. Control API — a return channel for the `silo` command

## Planning scope

This proposal is **one phase**: the whole Control API, planned and implemented
as a single change. There is no phase table — `requirements.md`, `design.md`,
and `tasks.md` cover everything this proposal commits to.

The baseline is what ships today: `tauri-plugin-single-instance` forwards a
second process's `argv` + `cwd`, the app focuses and emits `cli:open`, and the
CLI exits 0 (ADR 0047's **Forward** mode). `silo --help` / `--version` already
answer **Locally** in `main.rs` before Tauri init — that is the seam this
proposal reuses for the client half.

## Summary

A **request/response control channel** into a running Silo instance, so a
command can answer its caller: stdout, a real exit code, and a stable `--json`
envelope. Today the CLI is a one-way forwarder — argv goes in, `exit 0` comes
out, and the result lands in the webview's console. This proposal builds the
channel, its transport and authorization, and the envelope every command shares.
It is the **Control** execution mode named by ADR 0047 and the blocker on
RFC 0033's phase 9.

## Motivation

ADR 0047 decided the CLI's primary consumer is coding agents. An agent driving a
fire-and-forget CLI cannot:

- tell success from silence — `exit 0` means "argv was delivered", not "it
  worked";
- learn the id of a thing it just created, so it can act on it next;
- read live state (is this agent idle? which terminal is that?), which is the
  half ADR 0022's on-disk config tier deliberately does **not** cover;
- fail a script. `silo … || handle_error` can never fire.

The cost of not designing this now is worse than the gap itself: every command
shipped in the meantime is shaped for silence, and gains its answer later as a
breaking change. ADR 0047's rule — _a command whose value is its answer is never
shipped as a Forward that pretends_ — only holds if there is a real design to
point at.

ADR 0012 already proved the mechanism (a loopback HTTP RPC that operates the
live app) and is **dev-only, compiled out of release**, precisely because
exposing a control surface in a shipped build was not a question anyone had
answered. That question is this proposal's real content.

## Proposed solution

A **Unix domain socket / Windows named pipe** in ADR 0022's tier 3, one
newline-delimited JSON request and one response per connection, answered by the
running instance and printed by the short-lived CLI process with a real exit
code.

Four pieces:

1. **The transport.** An OS-gated socket in the ephemeral runtime tier,
   namespaced by build identity exactly as the PTY host already is, so Silo Dev
   and a release install are separate targets. Authorization is file mode, not a
   token — nothing a browser, a page, or DNS rebinding can reach.
2. **The envelope.** One `ok` / `data` / `error` / `silo` shape shared by every
   command, versioned as a whole, with a closed error-code vocabulary that maps
   to exit codes so a script works without parsing JSON.
3. **The operation allowlist.** A closed registry of named ops, each labelled
   read or mutate. An unknown op is `denied` — the channel is never a passthrough
   to arbitrary host capability. Extensions cannot reach it; they have `ctx`.
4. **First consumers**, proving both tiers: `silo status` (new, read),
   `silo ws list [--json]` (new, read — the live half disk cannot answer), and
   converting the shipped `silo agent run` from Forward to Control so it returns
   the terminal id it created (mutate).

Cold behavior is **fail-fast**: no instance listening exits non-zero with a
distinguishable `not-running` code. `--launch` opts into starting the app and
waiting. A read must never boot a desktop app as a side effect.

## Decisions

The six questions this proposal opened are closed as follows. The reasoning that
outlives the change belongs in an ADR written during implementation (see
`tasks.md`); this section records the choice.

1. **Transport: Unix socket / Windows named pipe**, not promoted loopback HTTP.
   The security section below is the reason: a listening TCP port in a release
   build is the thing ADR 0012 was gated to avoid, and OS file permissions are a
   stronger, simpler authorization story than a capability token the CLI must
   read from disk anyway.
2. **The allowlist is closed, and every op is labelled `read` or `mutate`.**
   Both tiers are reachable over the same socket — the OS gate is the only
   principal boundary, so a second runtime gate would be theatre. The label is
   what makes the surface auditable and is what the no-prompt rule keys off.
3. **Cold behavior: fail fast**, with `--launch` opting into launch-and-wait.
4. **The dev automation RPC (ADR 0012) does not converge here** — and this
   proposal does not decide whether it ever should. It stays dev-only and
   untouched; the question is left open deliberately rather than answered by
   this change. See "Deferred" below.
5. **Error codes are a closed vocabulary with a fixed exit-code mapping**
   (`invalid-args`, `not-running`, `not-found`, `denied`, `timeout`,
   `internal`). Specified in `design.md`.
6. **The envelope is versioned as a whole** by a top-level integer that only
   changes on a breaking envelope change; per-command `data` shapes are
   documented per verb and evolve additively.

## Scope

**In:**

- The socket/named-pipe listener in the desktop app, its identity-namespaced
  path, permissions, and stale-socket recovery.
- The client half in the `silo` binary, dispatched before Tauri init alongside
  the existing `--help` / `--version` local path.
- The shared envelope, the error-code vocabulary, and the exit-code mapping.
- The operation registry and its request round-trip through the webview.
- `--json`, `--launch`, and the request timeout.
- Consumers: `silo status`, `silo ws list [--json]`, and moving
  `silo agent run` to Control so it returns the created terminal's id.
- The CLI guide and the domain glossary, updated in the same change.

**Out:**

- Bare `silo agent run`'s interactive picker and `silo agent list` — RFC 0033
  phase 9 owns both. This proposal delivers the request/response primitive the
  picker needs; it does not build the picker.
- Extension-contributed commands (`silo ext <id> <cmd>`) — RFC 0005 / RFC 0006.
- `term` verbs, and any `ws` verb beyond `list`.
- Any non-loopback, cross-machine, or container-crossing access.
- Extension access to the channel. This is a CLI↔host surface.
- Converging or retiring ADR 0012's automation RPC.

**Implementation repo:** this one — `apps/desktop/src-tauri` (listener, client,
parser), `apps/desktop/src` (webview-side operation handlers), `crates/pty-host`
(promoting the runtime-base path helper it already owns), `apps/docs` (CLI
guide).

## Security

A control channel that can open workspaces and launch agent profiles is, by
construction, **arbitrary command execution as the user** — an agent profile is
a shell command line. Any local process that can reach the channel inherits
that. What keeps that acceptable:

- The transport is not reachable by anything the user did not run: a `0600`
  socket inside a `0700` directory in the per-user runtime tier. No port, no
  network surface, no DNS-rebinding target.
- The operation set is an **allowlist**, not "whatever the host can do". An
  unrecognized op is refused, so growing the host's capabilities never silently
  grows the channel's.
- ADR 0047's no-prompt rule holds over the channel: an op that would normally
  ask the user cannot silently proceed because it arrived here. It fails with
  `denied` unless the invocation carried an explicit `--yes`. The existing
  "explicit CLI install implies consent" carve-out is about _consent_, not about
  silence, and does not generalize.
- Extensions never reach the channel.

The residual risk is real and stated plainly: any local process running as the
user can drive the editor and spawn agents through this socket. That is the same
authority that process already has to run those commands itself, which is why
the OS-gated transport is the whole of the defense and a token would add nothing.

## Deferred

- **Convergence with ADR 0012's automation RPC.** They overlap but are not the
  same surface: automation taps source-of-truth internals (the Monaco event
  timeline, focus state) for tests and is compiled out of release. Converging
  buys one transport and one auth story; it risks widening the release surface
  to reach test-only taps, and the repo's `verifier-gui` workflow depends on the
  existing server. Left open, not answered.

## Alternatives considered

- **Promoted loopback HTTP** (ADR 0012's server, taken out of dev-only, with the
  `X-Silo-Automation`-style header, a loopback `Host` check, and a capability
  token in the config tier). Rejected for the release surface it creates; kept
  in the record because the implementation exists and would have been reused.
- **Stay one-way; let callers poll the filesystem.** What happens today by
  default. It cannot answer live state, cannot return an id, and pushes every
  agent into scraping app-state files that ADR 0022 explicitly marks as not for
  hand-editing.
- **A file-based reply drop** (write a response JSON to a temp path the CLI
  polls). No new listening surface, and it is genuinely simpler — but it needs
  its own correlation, cleanup, and timeout handling, and it cannot support an
  interactive picker.
- **Make the CLI a real client of the app's state by reading everything from
  disk.** Covers enumeration (that is exactly ADR 0047's Disk-read mode) and
  fundamentally cannot cover live state or mutation-with-result.
- **Ship a separate long-running daemon** that both the GUI and the CLI talk to.
  Larger change than the problem justifies while the GUI is the only writer.
- **A second runtime gate separating read from mutate** (e.g. an env switch or a
  per-tier socket). Rejected: there is only one principal on the other side of a
  `0600` socket, so the gate would restrict the user from themselves. The
  read/mutate label stays as documentation and as the hook for the no-prompt
  rule.
