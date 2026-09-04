---
status: accepted
date: 2026-09-03
---

# 0049. The Control API is an OS-gated socket with a closed operation allowlist

## Context

ADR 0047 decided the `silo` command's primary consumer is coding agents, and
named four execution modes. Three of them shipped; the fourth — **Control**, a
command that reaches the running instance and reports its answer — was described
as unbuilt, because the question it opens had not been answered: what is safe to
expose to a local process, and how is that gated?

The gap was not cosmetic. Forward mode delivers argv and exits 0, so an agent
cannot tell success from silence, cannot learn the id of a thing it just
created, and cannot fail a script. But closing that gap means building a channel
into a running editor, and a control channel that can open workspaces and launch
Agent Profiles is, by construction, **arbitrary command execution as the user** —
an Agent Profile is a shell command line. Anything that can reach the channel
inherits that authority.

The precedent in the repo was deliberately fenced off. ADR 0012's dev automation
RPC is a loopback HTTP server that operates the live app, and it is gated behind
a Cargo feature _and_ an env var, compiled out of release builds entirely —
precisely because nobody had answered whether a control surface belongs in a
shipped build. RFC 0034 is where that gets answered.

Three constraints shaped the answer:

- **The client and the instance are the same executable.** Both `silo` shims
  `exec` the app binary, so there is no version negotiation to design and no
  second artifact to distribute a credential to.
- **The crate has no async runtime.** Whatever the transport is, it has to work
  as a blocking accept loop on a thread, the way `automation.rs` already does.
- **Windows is a first-class platform.** `session_windows.rs` is a full session
  backend, so terminals — and therefore `agent run` — work there. A Unix-only
  channel would mean `silo status` simply does not exist on Windows.

## Decision

The Control API is a **Unix domain socket / Windows named pipe** in ADR 0022's
ephemeral runtime tier, namespaced by build identity, carrying one
newline-delimited JSON request and one response per connection. **Authorization
is the operating system's file permissions — there is no token.** What may be
asked over it is a **closed, statically-declared allowlist** of named
operations, each labelled `read` or `mutate`, and **no operation that requires
user confirmation may be admitted to it.**

## Consequences

**A listening TCP port never enters a release build.** The thing ADR 0012 was
gated to avoid does not happen: there is no port, no network surface, and no
DNS-rebinding target. The socket lives at `<runtime-base>/silo-ctl/<ns>/control.sock`,
mode `0600`, inside a `0700` directory. That gate is the whole authorization
story, which is why the channel can be compiled into every build where ADR 0012's
server could not.

**No credential file exists, so none can leak.** A capability token would have
had to be written somewhere the CLI could read it as the same user — which is
the authorization the file mode already provides, with a stealable artifact
added. Where the OS boundary and the token boundary are the same boundary, the
token is ceremony.

**The residual risk is stated rather than mitigated.** Any local process running
as the user can drive the editor and spawn agents through this socket. That is
the same authority the process already has to run those commands itself, which
is why nothing further is defended against. This is a deliberate acceptance, not
an oversight, and it is the reason the allowlist below matters more than the
transport does.

**Growing the host's capabilities never grows the channel's.** Dispatch is a
lookup in `registry.rs`'s static table; an unrecognized op is `denied` before
anything is emitted to the webview. Adding an op is a visible diff in one file
with a `read`/`mutate` label attached, which makes the surface auditable in a
way "whatever the host can do" never would be.

**The read/mutate label is documentation, not a runtime gate.** There is exactly
one principal on the other side of a `0600` socket, so a second gate separating
the tiers would restrict the user from themselves. The label's real job is being
the hook the no-confirmation rule hangs on, and being the thing a reviewer reads.

**No consent mechanism ships, and that is a constraint on the registry rather
than a missing feature.** ADR 0047 rule 7 says an agent cannot answer a modal, so
an op that cannot complete without asking the user is _not admitted_. Shipping a
`--yes` flag and a `confirms` column no op sets would be an untested path with no
caller. Admitting the first such op is an amendment to this ADR and to ADR 0047 —
deliberately a decision someone has to make on the record, not a flag already
sitting there inviting use.

**Extensions do not reach the channel, and there is nothing to enforce.** This is
a host↔CLI surface: no `ctx` member, no `@silo-code/sdk` export, and the webview
handlers live in `apps/desktop/src/control/` beside the existing CLI handlers
rather than in any extension package. An extension physically cannot resolve it.

**A wedged app stops looking like an absent one.** The listener binds during
startup rather than on webview-ready, so socket presence means "the process is
alive". Readiness is a _field in the `status` answer_, host-answered without
touching the webview. That is what lets `--launch` wait on an instance that is
mid-startup instead of spawning a second one, and it is what makes "Silo is
broken" diagnosable as distinct from "Silo is not running".

**Known limitation — the Windows pipe is not owner-only.** On Unix the `0600`
socket inside a `0700` directory is exactly the claim made above. On Windows the
pipe is created with the default security descriptor, whose DACL grants the
creator and administrators full control and **Everyone read access**. A second
local user therefore cannot write a request and cannot drive an op, but the
transport is not owner-exclusive the way the Unix arm is. Setting an explicit
security descriptor is the fix; it is not done, and this ADR records the
asymmetry rather than letting the security narrative overstate it.

**ADR 0012's automation RPC stays separate, and whether it ever converges is
left open.** The two overlap but are not the same surface: automation taps
source-of-truth internals — the Monaco event timeline, focus state — for tests,
and is compiled out of release. Converging buys one transport and one auth
story; it risks widening the _release_ surface to reach test-only taps, and the
repo's `verifier-gui` workflow depends on the existing server. Deferred, not
rejected.

## Alternatives considered

- **Promote ADR 0012's loopback HTTP server** out of dev-only, with a `Host`
  check, a custom header, and a capability token in the config tier.
  **Rejected** for the release surface it creates — a listening port in a shipped
  build is the exact thing that ADR's gate exists to prevent — and because the
  token it needs is weaker than the file mode it would replace. Kept in the
  record because the implementation exists and would otherwise have been reused.
- **Stay one-way and let callers poll the filesystem.** What happens today.
  **Rejected**: it cannot answer live state, cannot return an id, and pushes
  every agent into scraping app-state files ADR 0022 explicitly marks as not for
  hand-editing.
- **A file-based reply drop** — the instance writes a response JSON to a temp
  path the CLI polls. Genuinely simpler and adds no listening surface, but needs
  its own correlation, cleanup, and timeout handling, and cannot support the
  interactive picker RFC 0033 phase 9 wants. **Rejected.**
- **A second runtime gate separating read from mutate** (an env switch, or a
  socket per tier). **Rejected**: one principal, so the gate would restrict the
  user from themselves.
- **Ship a separate long-running daemon** both the GUI and CLI talk to.
  **Rejected** as a larger change than the problem justifies while the GUI is the
  only writer.
- **Ship the channel Unix-only** and skip the named-pipe arm. **Rejected**:
  Windows has working terminals, so `silo status` and `agent run` would simply
  not exist on a first-class platform.

## References

- [RFC 0034](../proposals/0034-control-api.md) — the Control API's design and
  requirements; implemented in `apps/desktop/src-tauri/src/commands/control/`
  and `apps/desktop/src/control/`.
- [ADR 0047](./0047-cli-command-grammar.md) — the CLI grammar this builds the
  Control mode of; see its 2026-09-03 amendment.
- [ADR 0022](./0022-on-disk-storage-layout.md) — the runtime tier the socket
  lives in, its identity keying, and the `$TMPDIR` reap case.
- [ADR 0012](./0012-dev-automation-rpc.md) — the dev-only automation server this
  deliberately does not converge with.
