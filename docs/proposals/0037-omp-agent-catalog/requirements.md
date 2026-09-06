# Requirements — 0037. OMP as a standalone catalog agent

Single-phase proposal: this file is the whole behavioral specification. See
`proposal.md` → **Planning scope**.

Everything below is verified against `omp@18.1.10` unless a criterion says
otherwise. The proposal's **"Correction to the accepted recon"** records what
changed after the live pass, and why R3 is now a title-detector requirement
rather than an identity-arbitration one.

## R1 — OMP is a first-class catalog agent

Silo's sealed catalog carries an `omp` entry that is independent of `pi` in
every field that differs: binary, config home, resume syntax, display name,
icon, and docs anchor.

### Acceptance criteria

- [ ] `agentById("omp")` returns a definition with `id: "omp"`,
      `displayName: "OMP"`, and `leaderNames: ["omp"]`.
- [ ] `AGENT_CATALOG` still passes every existing integrity test (unique ids,
      provenance present, single-line hook command, non-empty
      `titleIdentityPrefix`).
- [ ] The entry carries provenance: `lastVerified`, and
      `verifiedAgainstVersion: "omp@18.1.10"`.
- [ ] `ctx.agents.catalog()` includes OMP, and the host `+` menu lists it.
- [ ] `configDirEnvVar` is `PI_CODING_AGENT_DIR`, and `contract` states that
      OMP resolves it to `~/.omp/agent` and that `--profile` / `OMP_PROFILE`
      isolate accounts further.

## R2 — A Bun-wrapped OMP process is identified from its argv

`omp` on PATH is a Bun script, so the foreground leader reports as `bun`
(confirmed live: `comm=bun`, `args=bun /Users/…/.bun/bin/omp`). Silo resolves
the real agent by reading the foreground pgid's full command line, exactly as
it already does for `node`.

### Acceptance criteria

- [ ] `agentByProcessArgs("bun /Users/x/.bun/bin/omp")` returns the `omp`
      entry.
- [ ] `agentByProcessArgs("bun /x/node_modules/@oh-my-pi/pi-coding-agent/dist/cli.js")`
      returns the `omp` entry, **not** `pi` — pi's `pi-coding-agent` marker
      also occurs inside OMP's scoped package path, so this is a real
      collision, not a hypothetical one.
- [ ] Each of OMP's `processArgsMarkers` has its own assertion proving it can
      match something: `@oh-my-pi/pi-coding-agent` against the scoped path, and
      `oh-my-pi` against an unscoped one. (`includesPathMarker` takes only the
      first `indexOf` hit and treats `@` as an identifier character, so
      `oh-my-pi` cannot fire against the scoped path — a marker with no
      passing assertion is a marker that silently never runs.)
- [ ] A test pins `omp` ahead of `pi` in `AGENT_CATALOG`, so a reorder fails
      loudly rather than silently re-misclassifying OMP.
- [ ] `noteForeground` triggers argv resolution when the leader basename is
      any interpreter the catalog recognizes (`node`, `bun`, `deno`), not
      `node` alone, and still only when the terminal is not at a shell prompt.
- [ ] Existing node-wrapped resolution for pi / Claude / Copilot is unchanged.

## R3 — OMP's own title identifies it and reports its turn

OMP's OSC 0 title is `π <separator> <label>`, where the separator is the run
state: `>` idle, a braille spinner frame working, `!` waiting on the user, and
`:` when `tui.titleState` is off. That setting **defaults on**, so this is a
live signal with no user setup — which is why it, not OSC 9;4, is the activity
source Silo reads for OMP.

### Acceptance criteria

- [ ] `detectOmpTitle` returns `agentId: "omp"` and `source: "agent"` for
      every OMP title form: `π > x`, `π ⠋ x` (every one of the ten frames),
      `π ! x`, `π: x`, and the label-less `π >` / `π ⠋` / `π !` / `π`.
- [ ] Status is `working` for a spinner frame and `idle` for `>`, `!`, `:`,
      and the bare brand. A spinner frame arms the agent-idle debounce
      (`timer: "schedule-agent"`), because OMP animates the frame rather than
      re-announcing that it is still busy.
- [ ] The idle forms are marked `identity: true`, so an idle OMP title
      promotes the terminal immediately rather than waiting out the
      agent-idle debounce — the same treatment pi's identity title gets.
- [ ] `detectOmpTitle` returns `null` for pi's `π - <session> - <cwd>`, and
      `detectPiTitle` returns `null` for every OMP form. Asserted in both
      directions, so a future change to either literal that reintroduces an
      overlap fails.
- [ ] `detectOmpTitle` returns `null` for a non-zero OSC code and for a title
      that merely contains `π` without leading with it.
- [ ] `titleIdentityPrefix` is `"π "`, so a tab already showing OMP's icon
      drops the redundant brand and reads `> label` / `⠋ label` — the state
      the icon does _not_ say stays visible.
- [ ] With `hideAgentStatusGlyphs` on, the state separator is stripped too,
      leaving a bare `label`. `agent-osc-detectors.ts` states the invariant
      that a glyph Silo can _detect_ is a glyph Silo can _strip_, and OMP is
      the first agent whose marker sits behind a brand rather than leading —
      so `stripAgentStatusMarkers` must reach it.
- [ ] That widening cannot touch pi: `π - <session> - <cwd>` is unchanged by
      `stripAgentStatusMarkers`, asserted directly.
- [ ] Live: with `omp` and `pi` running in separate terminals at once, each
      keeps its own name, icon, and resume command.

## R4 — OMP's session hook installs to OMP's own config, and exact resume works

OMP reuses the existing `pi-extension` install strategy; only the path, the
file contents' agent tag, and the resume command differ.

### Acceptance criteria

- [ ] OMP's `resume.configPath` is `.omp/agent/extensions/silo-track-session.ts`
      and installing writes only that file. `~/.pi/` is never touched.
- [ ] `resume.buildResumeCommand("abc123")` returns `omp --resume abc123`.
- [ ] The generated extension source runs the shared capture script tagged
      `omp` (`[script, "omp"]`) and passes `SILO_AGENT_PID`.
- [ ] The generated source passes TypeScript syntax validation, the same
      golden check pi's source already has.
- [ ] `hookInstallableAgents()` includes OMP, so Settings → Agents renders its
      row with an Install button.
- [ ] `hookEventCompatibleWithStickyAgent` and the `agent-hook-runtime.ts`
      `compatible` filter are **unchanged by this work** — an OMP terminal's
      sticky id is `omp` (from its own title or its argv), so an `omp` hook
      event matches on the gate's ordinary equality branch. The Grok/Claude
      protection keeps its exact current behavior, verified by its existing
      tests passing untouched.
- [ ] Live: install the hook, start `omp`, restart Silo, and the terminal
      offers `omp --resume <id>` that actually resumes the session.

## R5 — The extension template has one source shared by pi and OMP

The TypeScript extension body is written once and parameterized, so pi and OMP
cannot drift apart.

### Acceptance criteria

- [ ] There is exactly one renderer producing the extension source; both
      catalog entries call it.
- [ ] pi's generated source is byte-identical to what it is today (its
      existing golden tests pass unmodified).
- [ ] The type-only import specifier is a parameter. OMP passes
      `@oh-my-pi/pi-coding-agent` — the package actually installed for it, and
      the one its own bundled `examples/extensions/*.ts` import.
- [ ] The header prose names the agent whose config directory the file lands
      in, so an OMP user reading it sees OMP named, not pi.

## R6 — OMP's activity tracks its turns with no user setup

### Acceptance criteria

- [ ] OMP's `activityDetectors` are `[detectOmpTitle]`. OSC 9;4 is
      deliberately not read: OMP gates it behind `terminal.showProgress`
      (default off) in a YAML file Silo has no writer for, and the title is
      the better signal.
- [ ] OMP's entry declares **no** `extraSettingsToggle`, so Settings → Agents
      renders its Install row with no sub-row.
- [ ] Live: an OMP terminal's tab shows working mid-turn and idle between
      turns, out of the box, with nothing enabled by hand.
- [ ] Live: when OMP asks for approval, the terminal reads as idle and raises
      attention rather than staying stuck on working.

## R7 — OMP is visible and distinct in every surface that names an agent

### Acceptance criteria

- [ ] `agentIconFor("omp")` returns an icon that is visually distinguishable
      from pi's at terminal-tab size (checked by eye, not just by assertion),
      with light/dark hexes.
- [ ] `apps/docs/guide/agent-sessions.md` has an `### OMP {#omp}` section
      naming `~/.omp/agent/`, the resume command, and how OMP is identified;
      the entry's `docsUrl` anchor matches.
- [ ] `apps/docs/index.md` and `apps/website/src/homepage-copy.ts` list OMP in
      the "works with" copy and the trust band, with its `AgentIconId`.
- [ ] `docs/domain-language.md`'s catalog-agent id union includes `"omp"`.
- [ ] `docs/agent-catalog-manual-checklist.md` covers both pi-extension agents
      rather than pi alone.

## R8 — What Silo depends on is written down

### Acceptance criteria

- [ ] The OMP catalog entry's `contract` records the title grammar and its
      `tui.titleState` gate, the `~/.omp/agent/config.yml` (YAML) settings
      format and the legacy `settings.json` migration, the
      `terminal.showProgress` key Silo deliberately does not read, the
      Bun-wrapped argv0, the `pi-coding-agent` marker collision that catalog
      order settles, and the extension-hook findings.
- [ ] `agent-sessions.md`'s OMP section states that a hand-typed OMP terminal
      is identified from its own title on every platform, including Windows
      (where OMP's working separator is a static `:` rather than a spinner).
- [ ] Anything Silo depends on that a user can switch off — `tui.titleState`
      — is named in both the `contract` and the docs section, with what
      degrades if they do.

## R9 — The change is recorded as a durable decision

### Acceptance criteria

- [ ] An ADR records the interpreter-wrapped foreground generalization: Silo
      resolves full argv for any script interpreter the catalog recognizes,
      not `node` alone. It also records what the live recon retired — the
      identity-precedence rule accepted before it — so the next reader doesn't
      re-derive a solution to a collision that never existed.
- [ ] Its row is added to `docs/decisions/README.md`.
- [ ] `apps/docs/checks/doc-indexes.sync.test.ts` passes.

## Out of scope

- Merging OMP and pi Agent Profile defaults, or any "pi family" grouping.
- Changes to the sealed detection model (ADR 0028) or a new install strategy.
- Auto-installing Silo's hook without user action.
- A YAML settings writer, or surfacing OMP's `terminal.showProgress`.
- Any cross-agent identity arbitration (`identitySource` precedence,
  launch-sourced identity, ambiguous-prefix suppression) — see the proposal's
  Alternatives table for why the live recon retired it.
