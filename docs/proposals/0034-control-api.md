---
status: draft
created: 2026-09-01
---

# 0034. Control API — a return channel for the `silo` command

## Summary

A **request/response control channel** into a running Silo instance, so a
command can answer its caller: stdout, a real exit code, and a stable `--json`
envelope. Today the CLI is a one-way forwarder — argv goes in, `exit 0` comes
out, and the result lands in the webview's console. This proposal designs the
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

## Design

### What the channel must do

1. Carry a request from a short-lived CLI process to the running instance, with
   a correlation id, and carry one response back.
2. Answer within a bounded time, or fail with a distinguishable timeout.
3. Be keyed by **build identity** (ADR 0022), so Silo Dev and a release install
   are separate targets with no ambiguity — the same split the PTY namespace and
   config root already have.
4. Fail _fast and legibly_ when no instance is running, rather than launching a
   desktop app as a side effect of a read. (Proposed default: exit non-zero with
   a "not running" code; `--launch` opts into the old behavior.)

### Transport — the open call

- **Unix domain socket / Windows named pipe**, in the ephemeral runtime tier
  (ADR 0022 tier 3, already namespaced per identity for the PTY host, already
  living under `sockaddr_un`'s ~104-byte limit). Authorization is the OS: file
  mode `0600` under a per-user runtime directory. No port, nothing a browser can
  reach, no DNS-rebinding surface.
- **Loopback HTTP**, as in ADR 0012, promoted out of dev-only with the same
  `X-Silo-Automation`-style header plus loopback `Host` check, and a capability
  token written to the config tier that the CLI reads.

The socket is the better starting point _because_ of the security section below;
the HTTP option is written down because ADR 0012's implementation exists and
would be reused.

### The envelope

One shape for every command, so an agent parses one thing:

```jsonc
{
  "ok": true,
  "data": {}, // command-specific, documented per verb
  "error": { "code": "workspace-not-found", "message": "…" }, // when ok:false
  "silo": { "version": "0.61.0", "identity": "com.silo.desktop" },
}
```

Error `code`s are a closed, documented vocabulary — an agent branches on them;
`message` is for humans. Exit codes map from the same vocabulary (0 success,
distinct non-zero for not-running, not-found, denied, timeout), so a script can
work without parsing JSON at all.

### Scope, and the security problem

A control channel that can open workspaces and launch agent profiles is, by
construction, **arbitrary command execution as the user** — an agent profile is
a shell command line. Any local process that can reach the channel inherits
that. This is the part that must be settled before anything ships:

- The transport must not be reachable by anything the user did not run
  (hence: OS-gated socket over a TCP port).
- The operation set is an **allowlist**, not "whatever the host can do". A
  read-only tier (enumeration, status) and a mutating tier (open, run, close)
  are worth separating, since the read tier is the one agents need constantly.
- Interaction with ADR 0047's no-prompt rule: an action that would normally ask
  the user cannot silently proceed just because it arrived over the channel. The
  existing "explicit CLI install implies consent" carve-out is about _consent_,
  not about silence, and does not generalize to invoking arbitrary operations.
- Whether the channel is ever reachable by extensions (proposed: **no** — this
  is a CLI↔host surface; extensions have `ctx`).

### Relationship to the dev automation RPC (ADR 0012)

They overlap but are not the same surface: automation taps source-of-truth
internals (the Monaco event timeline, focus state) for tests, and is compiled
out of release. Options — converge automation onto the Control API's transport
with a dev-only operation set, or leave it alone. Converging is attractive
(one transport, one auth story) and risks widening the release surface to reach
test-only taps. Undecided.

### First consumers

- `silo ws list [--json]`, `silo agent list [--json]` — though note ADR 0047
  routes _config enumeration_ to Disk-read, so these need the channel only for
  live state (activity, focus, session status).
- `silo agent run` returning the created terminal's id; bare `silo agent run`'s
  interactive picker (RFC 0033 phase 9).
- Any future `silo status`.

## Alternatives considered

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

## Decision

Pending. Open questions to close before this leaves `draft`:

1. Socket/named pipe vs. promoted loopback HTTP.
2. The operation allowlist, and whether read and mutate are separately gated.
3. Cold behavior: fail-fast default vs. launch-and-wait, and the flag that
   switches it.
4. Whether the dev automation RPC (ADR 0012) converges onto this transport.
5. The error-code vocabulary and its exit-code mapping.
6. Whether `--json` output is stable enough to version, and how.
