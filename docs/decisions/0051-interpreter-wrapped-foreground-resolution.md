---
status: accepted
date: 2026-09-04
---

# 0051. Silo resolves an agent from full argv for any script interpreter it knows

## Context

A coding-agent CLI distributed as a script does not appear in the process table
under its own name. The kernel execs the interpreter named in the shebang, so
`ps` reports the _runtime_ as the leader: `node` for pi, Claude, and Copilot
installs; `bun` for OMP, whose PATH entry is a Bun script
(`#!/usr/bin/env bun`).

`agentByProcessArgs` in `agent-catalog.ts` already handled this. It carries a
`SCRIPT_INTERPRETERS` set — `node`, `bun`, `deno` — and, for an interpreter
argv0, matches the first non-flag argument's basename against catalog
`leaderNames`. That is the pass that turns `bun /Users/x/.bun/bin/omp` into
`omp`.

The gap was upstream of it. `noteForeground` in `agents-service.ts` decides
whether an argv read is worth doing at all, and it tested the leader inline:

```ts
} else if (fg.pgid > 0 && leaderBasename(fg.leader) === "node" && !fg.atPrompt) {
  void resolveNodeWrappedAgent(entry, terminalId, fg);
}
```

So the set was stated in two places and the two disagreed. A Bun-distributed
agent was resolvable by a function that was never called for it: confirmed live
against omp 18.1.10, where `ps` reports `comm=bun`,
`args=bun /Users/…/.bun/bin/omp` and the foreground path produced nothing.

This surfaced while adding OMP to the catalog (RFC 0037), but it is not an
OMP-specific defect. Any agent shipped as a Bun or Deno script has always been
invisible to foreground resolution, and would have stayed invisible however
many catalog entries were added.

## Decision

**`noteForeground` reads full argv for any leader the catalog recognizes as a
script interpreter, not `node` alone.** The set is stated once, in
`agent-catalog.ts`, and exported as a predicate:

```ts
export function isScriptInterpreter(leader: string): boolean {
  return SCRIPT_INTERPRETERS.has(leaderBasename(leader));
}
```

`agents-service.ts` calls that predicate instead of comparing to a literal, and
`resolveNodeWrappedAgent` is renamed `resolveInterpreterWrappedAgent` so the
name no longer promises less than the function does.

The guards around it are unchanged: still only when the terminal is **not** at a
shell prompt, and still only for a real pgid. Widening _which_ leaders get an
argv read does not widen _when_ one happens — a shell sitting at its prompt with
`bun` somewhere in its history still triggers nothing.

Adding an interpreter is now a one-line change to `SCRIPT_INTERPRETERS`, and it
takes effect on both paths at once.

## Consequences

- OMP is identified from its process on macOS and Linux, and every future
  Bun- or Deno-distributed agent already in the catalog is too, with no further
  work.
- One more `ps` invocation per foreground tick whose leader is `bun` or `deno`
  and which is not at a prompt. Same cost, same shape, and the same
  fire-and-forget error handling as the `node` case that has been running since
  pi shipped: a failed or empty `ps` returns silently and identity is left
  alone.
- The set can no longer drift between the two call sites, because there is only
  one.

## What this decision does _not_ include, and why

RFC 0037 was accepted with a second mechanism change: an **identity-source
precedence rule** (`process` > `launch` > `detection`), a launch-sourced
identity seam threaded from the pending-launch drain, and an
ambiguous-title-prefix view that withheld identity when two catalog entries
claimed the same OSC 0 prefix. All of it existed to solve one problem — the
belief that OMP's window title was `π - <session> - <cwd>`, byte-identical to
pi's, so `detectPiTitle` would stamp `pi` over a correctly identified OMP
terminal on the next title sequence.

The live recon that produced this ADR showed that premise is false at omp
18.1.10. OMP's title is `π <separator> <label>`, where the separator carries
run state (`>` idle, a braille frame working, `!` waiting on the user, `:` when
disabled) — and `-` is not a separator its title builder can emit. The two
detectors are disjoint by construction, so no arbitration has anything to
arbitrate. OMP got a detector of its own (`detectOmpTitle`) instead, which also
gives it better activity tracking than the plan called for.

That machinery is therefore **not built**: a `TrackedAgent` field, a precedence
function, a service seam, and a memoized catalog view, none of which any
current signal justifies. This is recorded here rather than left silent so the
next reader who notices that Silo ranks no identity evidence knows the question
was asked and answered, and does not re-derive a solution to a collision that
never existed. If two catalog agents ever do share an identity signal, this is
the design to revisit — and the disjointness tests in
`agent-osc-detectors.test.ts` are what will fail first and say so.

The **hook compatibility gate** (`hookEventCompatibleWithStickyAgent` and the
`compatible` filter in `agent-hook-runtime.ts`) was likewise left untouched.
It exists to stop Grok re-firing Claude's installed hook against its own
process, and its rejections are permanent — `agent-hook-runtime.ts` counts an
incompatible match as consumed "so pruning still treats them as consumed rather
than retrying them forever", so a wrongly rejected event is discarded, not
deferred. An OMP terminal's sticky id is `omp` from every available source, so
an `omp` hook event passes on the gate's ordinary equality branch. Nothing about
that protection is narrowed.

## References

- [RFC 0037](../proposals/0037-omp-agent-catalog/proposal.md) — OMP as a
  standalone catalog agent; the recon that found this gap.
- [ADR 0042](./0042-agent-catalog-modularization.md) — the catalog's `runtime`
  policy fields and the "no `agent.id === …` branch in host code" rule this
  follows.
- `docs/adding-a-coding-agent.md` — the recon step that asks what `ps` actually
  reports for a new agent.
