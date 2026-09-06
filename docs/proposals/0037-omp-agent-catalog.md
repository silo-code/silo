---
status: implemented
created: 2026-09-04
---

# 0037. OMP as a standalone catalog agent

## Summary

**`omp`** ([Oh My Pi](https://omp.sh)) ships as its own entry in Silo's sealed
agent catalog, distinct from **`pi`**. OMP terminals are identified, activity-
tracked, and exactly resumable as OMP — with their own display name, icon,
config home, and resume syntax.

OMP is a pi fork that kept pi's TypeScript extension API, so Silo's session
hook is the same installed-extension mechanism (ADR 0041) rendered from a
shared template. Everything a catalog entry actually records differs: the
binary (`omp`, run by Bun rather than node), the config home
(`~/.omp/agent/`), the settings format (YAML), the resume flag (`--resume`,
where pi's is `--session`), and the OSC 0 title grammar. That is why it is a
row of its own rather than an alias — an alias would install Silo's hook into
`~/.pi/`, offer `pi --session <id>` for an OMP session, and show pi's name and
icon.

Shipped **Tier 3** (identified + activity + exact resume) per RFC 0018.

## Problem

OMP was in daily use as a Silo terminal agent and Silo did not know it
existed: no catalog row, so no display name, icon, Settings → Agents install
row, or `ctx.agents.catalog()` entry; no detector, so a terminal never lit up
as working or idle; and no foreground resolution, because `omp` ships as a Bun
script whose leader reports as `bun` while `noteForeground` only read argv for
a leader of exactly `node`.

The one place OMP _was_ seen, it was seen wrongly. `agentByProcessArgs`'s
package-path pass matches pi's `pi-coding-agent` marker inside OMP's own
`@oh-my-pi/pi-coding-agent` path, so an OMP install invoked through its
package file resolved to **pi** — wrong hook path, wrong resume command, wrong
name and icon.

## What shipped

| Piece                                | Where                                               |
| ------------------------------------ | --------------------------------------------------- |
| Catalog entry                        | `agents/catalog/omp.ts`                             |
| Title detector                       | `detectOmpTitle` in `agents/agent-osc-detectors.ts` |
| Shared hook template                 | `agents/catalog/pi-extension-template.ts`           |
| Catalog order, `isScriptInterpreter` | `agents/agent-catalog.ts`                           |
| Interpreter-wrapped foreground       | `agents/agents-service.ts`                          |
| In-app icon                          | `agents/agent-icons.ts`                             |
| Marketing icon + copy                | `apps/website/src/App.tsx`, `homepage-copy.ts`      |
| User docs                            | `apps/docs/guide/agent-sessions.md` (`#omp`)        |

All host code lives in `@silo-code/extension-host`. No new install strategy, no
new resume kind, no SDK surface change — the only public-surface effect is one
more row in `ctx.agents.catalog()`, which is data.

### 1. `detectOmpTitle` — identity and activity from one title

OMP's OSC 0 title, built by `buildTerminalTitleWithState` in its own
`src/utils/title-generator.ts`, encodes the run state in its separator:

```
π > label      the user's turn        → idle
π ⠋ label      working                → working  (10 braille frames, 80 ms)
π ! label      blocked on the user    → idle     (raises attention)
π : label      working on Windows     → working  (static, no spinner there)
π: label       tui.titleState off     → idle     (no state information)
π              no label, disabled     → idle
```

`label` is the generated session name, falling back to the cwd basename; the
separator trails the brand when there is no label (`π >`), so state is present
before a session is named.

This is the **only** activity signal Silo reads for OMP, deliberately.
`tui.titleState` defaults **on**, whereas OMP's OSC 9;4 progress is gated
behind `terminal.showProgress` (default off) in a YAML config Silo has no
writer for. The title is both the better signal and the one needing no setup.

Two mappings worth remembering: `!` maps to **idle**, because OMP waiting on
the user is exactly when a turn has ended and attention is owed; and a spinner
frame arms the agent-idle debounce rather than promising an explicit idle,
because OMP _animates_ the frame instead of re-announcing that it is busy.

**Disjointness from pi is the load-bearing property.** `-` is not a separator
OMP's title builder can emit, and it is none of `>`/`!`/`:`/braille — so
`detectPiTitle` and `detectOmpTitle` can never both fire. Tests assert this in
**both** directions, so an edit to either literal that reintroduces an overlap
fails loudly rather than silently resurrecting the misidentification this RFC
was written for.

### 2. Catalog order breaks the marker collision

`omp` sits **before** `pi` in `AGENT_CATALOG`. `includesPathMarker`'s boundary
characters exclude `-` and `@`, so pi's `pi-coding-agent` marker matches inside
`@oh-my-pi/pi-coding-agent` preceded by a `/`. Only catalog order decides the
winner, and a test pins the pair.

Ordering was chosen over tightening pi's marker to its scoped form, because a
scoped-only marker would stop matching an unscoped or vendored pi install.
Note the array's order is also user-visible: it drives the `+` menu, the
Settings → Agents rows, and "Found on this machine".

### 3. Interpreter-wrapped foreground resolution (ADR 0051)

`omp` on PATH is a Bun script, so `ps` reports `comm=bun`,
`args=bun /Users/…/.bun/bin/omp`. `noteForeground` now resolves full argv for
any script interpreter the catalog recognizes (`node`, `bun`, `deno`) via an
exported `isScriptInterpreter`, instead of an inline `=== "node"`. This is the
one durable architectural change here and is agent-agnostic — any Bun- or
Deno-distributed CLI already in the catalog benefits.

### 4. One extension template, two agents

`renderPiTrackSessionExtension` moved out of `catalog/pi.ts` into its own
module so `catalog/omp.ts` can render it without importing a sibling agent's
module (ADR 0042 decision 2). The shared `PiExtensionAgentDeps` lives beside
it for the same reason. Parameters: agent tag, display name, indefinite
article, and type-import specifier — all defaulted to pi's values, so pi's
generated source stays **byte-identical** and its golden tests are untouched.
OMP passes `@oh-my-pi/pi-coding-agent`, the package actually installed for it.

### 5. No settings toggle for OMP

pi declares an `extraSettingsToggle` because its only activity signal is off by
default. OMP's is on by default, so a row would surface a strictly worse,
redundant signal — and could not be written anyway: that mechanism reads and
writes **JSON**, while OMP's settings live in `~/.omp/agent/config.yml`.
(`settings.json` there is a legacy path OMP migrates from once and renames
`.bak`, so anything written to it is silently undone.)

## Reconnaissance — locked at `omp@18.1.10`

Confirmed 2026-09-04 by PTY capture, a `ps` poll of the live process, and
OMP's shipped sources. Re-run these when OMP bumps; the entry's `contract`
carries the full detail.

| Question          | Answer                                                                                              |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| Binary / argv0    | Bun script; `comm=bun`, `args=bun /…/.bun/bin/omp`                                                  |
| Config home       | `~/.omp/agent/`; `PI_CODING_AGENT_DIR` resolves to it; `--profile` / `OMP_PROFILE` isolate accounts |
| Settings          | `~/.omp/agent/config.yml` (**YAML**); `settings.json` is legacy-migrated to `.bak`                  |
| OSC 0 title       | `π <separator> <label>` — see §1. Gated by `tui.titleState`, default **true**                       |
| OSC 9;4           | Exists behind `terminal.showProgress` (default false) — not read                                    |
| Session storage   | `~/.omp/agent/sessions/<slugified-cwd>/<timestamp>_<uuid>.jsonl`                                    |
| Live pid registry | None — exact resume needs the in-process hook                                                       |
| Hook              | `pi.on("session_start", (event, ctx) => …)`; `ctx.sessionManager.getSessionId()` returns a UUIDv7   |
| Exact resume      | `omp --resume <id>` — OMP prints that line on exit                                                  |
| Opening prompt    | Positional `[MESSAGES…]`, stays interactive → `{ kind: "argv" }`                                    |

## The design that was accepted and then retired

The accepted proposal recorded OMP's title as `π - <session> - <cwd>`,
**identical to pi's**, and built its identity design around resolving that
collision: an `identitySource` precedence rule (`process` > `launch` >
`detection`), a launch-sourced identity seam threaded from the pending-launch
drain, and an ambiguous-title-prefix view that withheld identity when two
entries claimed the same prefix.

The live recon showed that premise is false. OMP's title is the
`π <separator> <label>` shape above and cannot produce `π - `, so the
detectors are disjoint by construction and no arbitration has anything to
arbitrate. **None of that machinery was built** — a `TrackedAgent` field, a
precedence function, a service seam, and a memoized catalog view, none of
which any current signal justifies.

This is recorded here and in ADR 0051 so a future reader who notices Silo
ranks no identity evidence knows the question was asked and answered. If two
catalog agents ever do share an identity signal, that is the design to
revisit — and the disjointness tests are what will fail first and say so.

The **hook compatibility gate** (`hookEventCompatibleWithStickyAgent` and the
`compatible` filter in `agent-hook-runtime.ts`) was likewise left untouched. It
exists to stop Grok re-firing Claude's hook against its own process, and its
rejections are _permanent_ — an incompatible match counts as consumed, not
retried. An OMP terminal's sticky id is `omp` from every source, so its events
pass on the gate's ordinary equality branch.

## Verification

Automated: `pnpm test`, `pnpm --filter silo exec tsc --noEmit`, `pnpm lint`,
and the doc-index check, all green.

Live, in-app 2026-09-06 against a real `~/.omp/agent/`: hook install writes
only OMP's own file and never touches `~/.pi/`; the extension loads,
`session_start` fires, and the captured id reaches
`~/.silo/agent-hooks/events.jsonl` tagged `omp`; the offered
`omp --resume <id>` resumes a real session; working/idle tracks a turn with
nothing enabled by hand; and `omp` and `pi` running side by side each keep
their own identity, icon, and resume command.

## Known edges and follow-ups

- **Lazy session persistence.** OMP returns a session id from startup, but the
  `.jsonl` is only written once the session has history — so a session that
  never took a turn yields a resume command that resolves to nothing. pi has
  the same shape, so this is not OMP-specific and was left alone here. Worth
  an issue if it bites.
- **One unexplained first-run miss.** The first OMP launch after installing the
  hook wrote a correct event (right session id, right pid) that Silo never
  matched. It did not recur across later launches and is not a standing defect.
  Ruled out: the extension, the session id, the capture script, the pid, and
  the correlation path (a line appended with that same live pid matched
  immediately). The consistent-but-unproven explanation is a startup race —
  the hook fires within a second of launch, and if the foreground poll has not
  yet resolved `bun` → `omp`, the event finds `currentPgid` still on the shell.
  If it recurs, capture Output → **Agents** at launch: the
  `Read N new hook event(s)`, `still unmatched … tracked terminal pgids`, and
  `foreground interpreter-wrapped` lines pin the ordering exactly.
- **Extensions did not load** from a bare `--profile` or a scratch
  `PI_CODING_AGENT_DIR` during testing. Verify OMP extension work against a
  real, configured agent dir.
- **Windows** was reasoned about, not exercised: OMP's static `:` working
  separator is handled and documented, but no Windows machine ran this.

## Implementation references

- `packages/extension-host/src/extension-host/agents/` — `catalog/omp.ts`,
  `catalog/pi-extension-template.ts`, `agent-osc-detectors.ts`,
  `agent-catalog.ts`, `agents-service.ts`, `agent-icons.ts`
- `docs/agent-catalog-manual-checklist.md` — covers both pi-extension agents
- [ADR 0051](../decisions/0051-interpreter-wrapped-foreground-resolution.md) —
  full-argv resolution for any script interpreter
- [ADR 0041](../decisions/0041-pi-hook-as-installed-extension.md) — the hook
  ships as an installed TypeScript extension
- [ADR 0042](../decisions/0042-agent-catalog-modularization.md) — catalog
  modules and declarative `runtime` policy
- [ADR 0043](../decisions/0043-opencode-tiered-support.md) — tiered shipping
- [RFC 0018](./0018-ctx-agents-surface.md) — `ctx.agents`, the sealed catalog
- [RFC 0033](./0033-agent-profiles.md) — `configDirEnvVar`, opening prompts
- `docs/adding-a-coding-agent.md` — the recipe this followed
