# Design — 0037. OMP as a standalone catalog agent

How the requirements in `requirements.md` are satisfied. Intent only — it does
not restate the source.

Rewritten after the live recon (see the proposal's **"Correction to the
accepted recon"**). The earlier design's §5/§5b/§5c — an `identitySource`
precedence rule, a launch-sourced identity seam, and an ambiguous-title-prefix
view — existed to stop `detectPiTitle` stamping `pi` over an OMP terminal.
OMP's title cannot match `detectPiTitle`, so none of that machinery has
anything to arbitrate and none of it is built. What replaces it is a detector.

## Architecture

Everything lands in `@silo-code/extension-host`, except the tab-title strip in
`core.terminal`, the website copy, and the manual checklist:

| Area                                  | Path                                                               |
| ------------------------------------- | ------------------------------------------------------------------ |
| New catalog module                    | `packages/extension-host/src/extension-host/agents/catalog/omp.ts` |
| Shared extension template (extracted) | `.../agents/catalog/pi-extension-template.ts`                      |
| `detectOmpTitle`, marker stripping    | `.../agents/agent-osc-detectors.ts`                                |
| Catalog wiring, interpreter predicate | `.../agents/agent-catalog.ts`                                      |
| Foreground fix                        | `.../agents/agents-service.ts`                                     |
| In-app icon                           | `.../agents/agent-icons.ts`                                        |
| Website / docs prose                  | `apps/website/src/homepage-copy.ts`, `apps/docs/**`                |
| Manual checklist                      | `docs/agent-catalog-manual-checklist.md`                           |

No new install strategy, no new resume kind, no SDK surface change — so the
`silo-docs-sync` workflow does **not** apply. The only public-surface effect is
one more row in `ctx.agents.catalog()`, which is data.

## Components

### 1. `catalog/pi-extension-template.ts` — one template, two agents (R5)

`renderPiTrackSessionExtension` moves out of `catalog/pi.ts` into its own
module so `catalog/omp.ts` can use it without importing another agent's module
(ADR 0042 decision 2). Two new optional params, both defaulted to pi's current
values so pi's emitted source stays **byte-identical** and its golden tests are
untouched:

- `displayName` — the agent named in the file's plain-language header and in
  its two inline comments. An OMP user reading the file Silo dropped into
  `~/.omp/agent/extensions/` sees OMP named, not pi.
- `typeImportSpecifier` — the package the type-only import resolves against.
  Erased before the jiti loader runs, so it only matters when the user opens
  the file in an editor; it should still name the package actually installed.
  OMP passes `@oh-my-pi/pi-coding-agent`, which is what OMP's own bundled
  `examples/extensions/*.ts` import and what ships at
  `~/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent`.

The API parameter stays named `pi` in both files: OMP's own examples spell it
that way, because OMP is a pi fork that kept the extension API's shape.

`buildPiExtensionSource()` in `agent-catalog.ts` exists only for pi's golden
tests and a doc comment; leave it as pi's, and let the OMP golden test call the
entry's own `resume.buildFileContents()`. That is the real production path for
both agents, so testing OMP through it is the more honest test anyway.

### 2. `detectOmpTitle` — identity and activity from one title (R3, R6)

OMP's OSC 0 title is built by `buildTerminalTitleWithState` in its own
`src/utils/title-generator.ts`:

```
π > label      the user's turn        → idle
π ⠋ label      working                → working   (10 braille frames, 80 ms)
π ! label      blocked on the user    → idle      (attention)
π: label       tui.titleState off     → idle      (no state information)
π              no label, disabled     → idle
```

`label` is the generated session name, falling back to the cwd basename. The
separator trails the brand when there is no label (`π >`), so the state is
always present even before a session is named.

This is the same shape as `detectCopilotTitle` — one detector carrying
`agentId` plus a status — and it is a **better** signal than the OSC 9;4 route
the earlier design planned: `tui.titleState` defaults **on**, whereas OMP's
`terminal.showProgress` defaults off and lives in YAML.

Two deliberate mappings:

- `!` → `idle`. OMP is waiting on the user, which in Silo's model is precisely
  when a turn has ended and attention should be raised. Reporting `working`
  would leave the tab spinning while it is actually the user's move.
- A spinner frame arms the agent-idle debounce (`timer: "schedule-agent"`)
  rather than promising an explicit idle. OMP _animates_ the frame instead of
  re-announcing that it is still busy, so silence is what ends the turn — the
  same shape Copilot's working title and Cursor's spinner fallback already use.
  The explicit `>` still arrives and clears it promptly; the debounce is the
  backstop for a turn that ends without one.

The idle forms carry `identity: true` so an idle OMP title promotes the
terminal immediately, rather than being held behind the agent-idle debounce —
the same treatment pi's identity-only title gets.

**Disjointness is the whole argument, so it is asserted in both directions.**
`π - ` is not a separator `buildTerminalTitleWithState` can emit, and `-` is
not one of `>`/`!`/`:`/braille — so `detectPiTitle` and `detectOmpTitle` can
never both fire. A test asserts each returns `null` for the other's titles, so
a future edit to either literal that reintroduces an overlap fails loudly
rather than silently resurrecting the misidentification this RFC was written
for.

### 3. Presentation: OMP's brand and its state glyph (R3)

`titleIdentityPrefix: "π "` — the brand is redundant once the tab shows OMP's
icon, exactly as pi's `π - ` and OpenCode's `OC | ` are.

That leaves the state separator (`> label`, `⠋ label`), which is correct while
`hideAgentStatusGlyphs` is off — the icon says _who_, the separator says
_what it is doing_. With the setting **on**, the separator should go too, and
today it cannot: `stripAgentStatusMarkers` runs on the raw title, and
`LEADING_MARKER_RE` is anchored at `^`, where OMP has its brand rather than its
marker. OMP is the first agent whose status glyph sits _behind_ a brand.

`agent-osc-detectors.ts` states the invariant plainly — "a glyph Silo can
_detect_ is always a glyph Silo can _strip_" — so the fix belongs in that
regex, not in a per-agent branch in `TerminalPanel.tsx`. Widen it to allow an
optional `π ` brand ahead of the existing marker set, plus an OMP branch for
the three non-glyph separators. Scoped behind the `π` so it cannot touch an
unrelated title that merely starts with `>`.

pi is unaffected and asserted so: `π - ` matches neither branch, because `-` is
not a marker and not one of OMP's separators.

### 4. Catalog ordering and the marker collision (R2)

`omp` is inserted into `AGENT_CATALOG` **before** `pi`. This is load-bearing,
not cosmetic:

`agentByProcessArgs`'s third pass iterates the catalog testing
`runtime.processArgsMarkers` with `includesPathMarker`, whose boundary
characters exclude `-` and `@`. pi's marker `pi-coding-agent` occurs inside
OMP's package path `@oh-my-pi/pi-coding-agent` preceded by `/` — a valid
boundary. So an OMP install invoked through its package file matches **pi's**
marker, and only catalog order decides which entry wins.

Ordering is the fix rather than tightening pi's marker to its scoped form,
because a scoped-only marker would stop matching an unscoped or vendored pi
install. Lock the ordering with the R2 test so a future reorder fails loudly
instead of silently re-misclassifying OMP.

The second pass (interpreter argv0 → script basename) already resolves the
common case `bun ~/.bun/bin/omp` → `omp` before the marker loop runs, so this
only matters for package-file invocations.

**`AGENT_CATALOG`'s order is user-visible, not just internal.** It flows
through `catalogAgentSummaries()` (the `+` menu), `hookInstallableAgents()`
(the Settings → Agents rows), and `scanInstalledAgents()` ("Found on this
machine") — all of which preserve array order. Inserting `omp` before `pi`
reorders all three. That is acceptable, but the array's comment currently
reads only "Order is the detection-dispatch order"; update it to say it also
breaks `processArgsMarkers` ties and drives those three lists.

**OMP's own markers.** Of the two, only `@oh-my-pi/pi-coding-agent` fires
against the observed install: `includesPathMarker` takes the **first**
`indexOf` hit and treats `@` as an identifier character, so in
`@oh-my-pi/pi-coding-agent` the marker `oh-my-pi` is preceded by `@` and
rejected without scanning further. `oh-my-pi` is not dead in general — it
matches an unscoped path like `/x/oh-my-pi/dist/cli.js` — but nothing in the
observed recon exercises it. Keep both, and give each its own assertion so the
suite can't pass on a marker that never runs.

### 5. Interpreter-wrapped foreground (R2)

`SCRIPT_INTERPRETERS` in `agent-catalog.ts` already holds `node`, `bun`, and
`deno` — `noteForeground` in `agents-service.ts` just doesn't use it, testing
`leaderBasename(fg.leader) === "node"` inline. Confirmed live that this is the
gap that matters for OMP: `ps` reports `comm=bun`,
`args=bun /Users/…/.bun/bin/omp`.

Export a predicate (`isScriptInterpreter(leader: string): boolean`) from
`agent-catalog.ts` and call it from that branch, so the set is stated once.
Rename `resolveNodeWrappedAgent` → `resolveInterpreterWrappedAgent` and fix its
doc comment; the `!fg.atPrompt` guard and the `fg.pgid > 0` guard stay as they
are.

This is the one durable architectural change in the RFC, and the ADR records
it. It is agent-agnostic: any Bun- or Deno-distributed CLI already in the
catalog benefits without further work.

### 6. The hook path is unchanged (R4)

OMP reuses `pi-extension` verbatim — it is already path-driven via
`resume.configPath`, so OMP's row installs
`~/.omp/agent/extensions/silo-track-session.ts` and nothing under `~/.pi/`.

`hookEventCompatibleWithStickyAgent` and the `agent-hook-runtime.ts`
`compatible` filter are **not touched**. An OMP terminal's sticky id is `omp`
— from its own title, from its argv, or from the hook event itself — so an
`omp` event matches on the gate's ordinary equality branch. The Grok/Claude
protection that gate exists for keeps its exact current behavior, verified by
its existing tests passing unmodified.

This matters because the gate's rejections are **permanent**:
`agent-hook-runtime.ts` counts incompatible matches as consumed "so pruning
still treats them as consumed rather than retrying them forever". Not touching
it is the safe answer, and the distinct title is what makes not touching it
sufficient.

### 7. No settings toggle for OMP (R6)

pi declares an `extraSettingsToggle` because its only activity signal is
off by default. OMP's is on by default, so the row would surface a strictly
worse, redundant signal — and it could not be written anyway:
`AgentExtraSettingsToggle` reads and writes a **JSON** settings file, while
OMP's settings live in `~/.omp/agent/config.yml`. (`~/.omp/agent/settings.json`
exists only as a legacy path OMP migrates from once, renaming it `.bak`.)

OMP's entry therefore declares no toggle, and its `contract` records both the
`terminal.showProgress` key Silo deliberately does not read and the YAML
format that would be needed to read it.

### 8. Icon (R7)

`AGENT_ICONS.omp` in `agent-icons.ts`. The bar is _distinguishable from pi at
tab size_, which pi's bare π glyph makes easy to fail. Take pi's π path as the
base, add a differentiating element, and give it its own light/dark hex —
OMP's own branding is the preferred source if the project has a mark. This is
a judgment call to make with the app running, not from the source; the task
list treats it as a verify-by-eye step.

## Data flow

Where OMP's identity comes from, in the order the signals actually arrive:

```
user runs `omp` (typed, from a profile, or from the + menu)
  │
  ├─ OSC 0 "π > omp-pty"  (milliseconds)
  │     → detectOmpTitle → identity "omp", status idle, promote
  │        works on every platform, including Windows
  │
  ├─ foreground tick: leader "bun", not atPrompt
  │     → ps -p <pgid> -o args= → "bun …/omp"
  │     → agentByProcessArgs → "omp"  (confirms the title)
  │
  └─ omp session_start hook (agent "omp", pid-correlated)
        sticky "omp" → gate's equality branch passes → exact resume
```

Every path agrees, and no path can produce `pi`. On Windows there is no
foreground argv and no hook install, but the title arrives regardless — its
working separator is a static `:` there rather than a spinner, which
`detectOmpTitle` handles as its own case.

## APIs / interfaces

- `agent-osc-detectors.ts` exports `detectOmpTitle` and `OMP_TITLE_PREFIX`
  (the `"π "` literal the catalog entry reuses, the same way pi reuses
  `PI_TITLE_PREFIX`).
- `agent-catalog.ts` gains `isScriptInterpreter(leader: string): boolean`.
  Host-internal.
- `catalog/pi-extension-template.ts` exports `renderPiTrackSessionExtension`
  and its params interface, moved verbatim plus two new optional params.
- `hookEventCompatibleWithStickyAgent` is **unchanged** — see §6.
- `@silo-code/sdk` is unchanged.

## Persistence

Nothing new is persisted. `agentId` / `agentName` already ride
`store.agentState` as today, and a restored terminal re-derives its identity
from the first live title.

## Error handling

- `ps` failing or returning nothing: unchanged — `resolveInterpreterWrappedAgent`
  returns silently, identity stays whatever it was.
- Hook file path already occupied by a foreign file: unchanged — the
  `pi-extension` strategy already refuses rather than overwriting, and it is
  path-driven, so OMP inherits that behavior for its own path.
- A user turning `tui.titleState` off: OMP still emits `π: label`, which
  `detectOmpTitle` recognizes as identity with no state. The terminal stays
  named and still gets exact resume; it simply never lights up. Recorded in
  the `contract` and in the docs section.

## Testing strategy

Pure-logic Vitest, co-located, per `.agents/skills/silo-testing/SKILL.md`. No
`@testing-library/react`.

| File                                        | What                                                                                                                                                                                                                             |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent-osc-detectors.test.ts`               | every OMP title form → the right status/identity; all ten spinner frames; the label-less forms; both disjointness directions against `detectPiTitle`; non-zero OSC code; `π` not leading                                         |
| `agent-osc-detectors.test.ts`               | `stripAgentStatusMarkers` clears OMP's brand+separator and leaves pi's `π - …` untouched                                                                                                                                         |
| `catalog/omp.test.ts`                       | resume command, hook `configPath`, extension source tags `omp` and carries the marker, TypeScript syntax validation, no `extraSettingsToggle`                                                                                    |
| `agent-catalog.test.ts`                     | `agentByProcessArgs` for the bun-wrapped and package-path forms; one assertion per OMP marker including an unscoped path; the ordering guard from §4; OMP in `hookInstallableAgents()`; existing integrity tests extended to OMP |
| `agents-service.test.ts`                    | the interpreter branch firing for a `bun` leader, and still firing for `node`                                                                                                                                                    |
| `agent-icons.test.ts`                       | OMP entry present, hexes set, path differs from pi's                                                                                                                                                                             |
| `apps/docs/checks/doc-indexes.sync.test.ts` | index rows for the package and the new ADR                                                                                                                                                                                       |

Two things unit tests cannot cover and the manual checklist must: the icon
being _legible and distinct_ at tab size, and a real `omp --resume` round trip.

## Constraints and existing decisions

- **ADR 0028** — sealed detection. No registration API; OMP is a catalog row
  with a detector in the host's own module.
- **ADR 0041** — pi's hook is an installed TypeScript extension. OMP reuses
  the mechanism and its constraints (marker comment, plain-language header,
  runs the one shared capture script, swallows every failure).
- **ADR 0042** — catalog modularization: one module per quirky agent, `deps`
  passed as parameters, `runtime` policy fields declared on the entry, and no
  `agent.id === "…"` branch in the settings page.
- **RFC 0018** — what "supported" means; OMP ships all three tiers.
- **RFC 0033** — `configDirEnvVar` answered deliberately, `promptDelivery`
  answered by actually running the binary in a PTY.
- **ADR 0043** — tiered shipping precedent.
- **New ADR (0051)** — records the interpreter-wrapped foreground
  generalization: Silo resolves full argv for any script interpreter the
  catalog recognizes, not `node` alone. It also records what the live recon
  retired — the identity-precedence rule accepted before it — so a later
  reader does not re-derive an arbitration scheme for a collision that never
  existed.
- The capture script's `KNOWN=` list is templated from `leaderNames`, so
  `omp` joins it automatically. OMP's hook passes `SILO_AGENT_PID` and skips
  the parent walk, so the short-name substring risk that motivated that flag
  for `pi` is already handled.
