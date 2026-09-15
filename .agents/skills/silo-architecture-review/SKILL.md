---
name: silo-architecture-review
description: Review code for architectural concerns only — boundary violations, wrong-layer logic, undocumented dependencies, and implicit decisions that should become an ADR or RFC. Works on a PR/branch/diff, or on standing code (a package, extension, or subsystem that already exists). Use when asked to "architecture review" something, to check whether code respects Silo's boundaries, before merging something cross-cutting, or when auditing an existing area for drift. Not a code-quality or style review.
---

# Architecture review

Review code **only** for architectural concerns. Code quality, naming,
formatting, and test style are explicitly out of scope — `pnpm lint`,
`.agents/skills/silo-testing/SKILL.md`, and ordinary code review cover those.
This skill asks one question: _does this code fit the architecture Silo has
already decided on, and where it doesn't, is that a deliberate, recorded
decision or an accident?_

This skill is the review itself. The human loop around it — who runs which
step in which session, how to spot-check findings before acting on them, and
why the author, reviewer, and fixer are never the same session — is
`docs/architecture-review-workflow.md`.

It runs in two modes, and step 2 picks one:

- **Mode A — a change.** A PR, a branch, or the working tree. Baseline is
  `main`; the change's additions are the scope.
- **Mode B — standing code.** A package, a bundled extension, or a subsystem
  that has existed for a while. Baseline is the ADRs; the scope is whatever
  boundary you draw and state.

## 1. Load the architecture of record

Silo has no C4 model, and the architecture is written down across several
files. **All of them are input to this review**, but start here:

- **`docs/architecture.md`** — the structural map: the package table and its
  dependency edges, the layering inside the host, the Rust/webview process
  split, the persistence destinations, and which packages publish. Deliberately
  facts-only, and its package table is drift-checked by a unit test. Read it
  first to orient; it tells you which ADRs the code under review answers to.
- **`AGENTS.md` → "Architecture boundaries — enforced, don't regress"** — the
  package graph, the `ctx`/SDK-only rule for extensions, the platform ban, the
  CSS token tiers, the design-system kit and the chrome line, the Tooltip and
  focus-ring rules, host logging. This is the densest statement of the
  boundaries and the first thing to read.
- **`AGENTS.md` → "Engineering principles"** — simplest implementation that
  meets current requirements, grow in layers, no stopgaps. These are what you
  judge "is this the right shape" against.
- **`docs/decisions/`** — the ADRs, the durable _why_. Read
  `docs/decisions/README.md` for the index and skim it for ADRs the code under
  review touches; open the ones that apply in full. Do not review from the
  index titles alone. Note each one's `date:` — in Mode B you need it.
- **`docs/proposals/`** — RFCs. Code implementing a proposal must match it;
  code contradicting an open one is a finding.
- **`docs/domain-language.md`** — the glossary. Vocabulary in the code that
  isn't here, or that collides with a term that is, is an architectural finding
  (see `.agents/skills/silo-domain-modeling/SKILL.md`).
- **`docs/change-planning-convention.md`** — whether the work was big enough to
  have needed a proposal at all.
- Surface-specific rules when the code touches them:
  `docs/modal-design.md`, `docs/side-panel-design.md`,
  `apps/docs/guide/extension-checklist.md` (any new or changed extension),
  `docs/adding-a-coding-agent.md` (agent catalog changes),
  `apps/docs/roadmap.md` (public SDK surface).

## 2. Scope the review

Two modes. Establish which one you're in before reading any code — it changes
what counts as a finding.

### Mode A — a change (PR, branch, working tree)

Don't ask for a paste; get it yourself:

```bash
gh pr diff <number>                                  # a PR
git diff $(git merge-base origin/main HEAD)...HEAD   # the current branch
git diff --stat <same range>                         # orient first on a large change
```

**For an uncommitted working tree, `git diff` is not enough** — it shows
nothing for a file that was never added, and a new file is usually the most
architecturally significant thing in the change. Always start with status:

```bash
git status --short          # ` M` = modified, `??` = untracked and invisible to diff
git diff                    # unstaged edits to tracked files
git diff --cached           # staged edits
```

Then **read every `??` file in full**. A new service, a new SDK module, or a
new package is exactly the kind of change this review exists for, and it is
100% invisible to every `git diff` form.

Read the touched files around the hunks, not just the hunks — a boundary
violation is usually visible only in the imports at the top of a file the diff
edits in the middle. `graft callers <symbol> --depth all` is the fast way to
see what a changed symbol actually reaches.

The baseline is `main`. Everything the change adds is in scope; everything it
merely sits next to is not.

### Mode B — standing code (a subsystem, package, or extension)

No diff. Reviewing something that already exists and has for a while.

**Bound it first, explicitly, and say so in the report.** A subsystem is
normally one package (`packages/extension-host/src/<area>/`), one bundled
extension (`packages/extensions-silo/src/<name>/`), or one feature that spans
both. Ask which if it's ambiguous — an unbounded "review the architecture"
produces an unreadable report.

Then enumerate it rather than reading it end to end:

```bash
graft map                                  # orientation, if the area is unfamiliar
graft skeleton <file>                      # a file's whole API, ~10x cheaper than reading it
graft callers <symbol> --depth all         # what the subsystem actually reaches
```

Look at the `package.json` of the owning package (its declared dependencies
_are_ the permitted edges), the imports at the top of every file in the
boundary, and anything crossing into Rust (`apps/desktop/src-tauri/`).

**The baseline is the ADRs, not `main`** — and most of this code predates most
of them. So for every finding, establish **when the rule arrived**:

```bash
git log --diff-filter=A --format='%h %ad %s' --date=short -1 -- <file>
git log -L <start>,<end>:<file> --format='%h %ad %s' --date=short | head -40
```

Compare that against the `date:` in the ADR's frontmatter. Code written before
an ADR isn't a violation — it's **drift**, and drift is a different finding
with a different fix (grandfather it, schedule it, or supersede the ADR).
Code written after is a genuine regression that got past the gate. Label
every finding as one or the other; a report that conflates them is noise.

Also worth asking in Mode B only: **has the architecture moved on without
this code?** A subsystem consistent with the ADRs as of 2026-06 and untouched
since may now be the last holdout of a superseded pattern. That's a real
finding even though nothing in it is "wrong."

## 3. Dispose of the mechanical checks first

Much of Silo's boundary is enforced by the package graph and lint, so those
violations are _already caught_ and are not where your attention belongs. Run:

```bash
pnpm lint
pnpm --filter silo exec tsc --noEmit
```

If either fails on the diff, report it as a one-line fact and move on. The
value of this review is everything lint **cannot** express.

In **Mode B** these will almost always pass — standing code that ships on
`main` already cleared the gate. That's the point: it tells you every
remaining finding is one the toolchain structurally cannot see, which is
exactly the set worth your time. Don't report "lint passes" as a result.

## 4. The questions

Phrased for Mode A ("does this change introduce…"). In **Mode B**, read each
as the standing form — "does this subsystem _have_…" — and carry the
drift-vs-regression label from step 2 into every finding.

### Q1 — Does it introduce coupling that shouldn't exist?

- An extension (`packages/extensions-silo/**`, `packages/extensions-core/**`)
  reaching the host's `state` / `services` / `layout` / `panels` / `docked` /
  `components` instead of going through `ctx`. `core.*` _may_ use
  `@silo-code/extension-host/internal`; `silo.*` may not — but even for
  `core.*`, ask whether the capability belongs in `ctx`.
- Extension-to-extension imports, or a new dependency edge between workspace
  packages. Check `package.json` changes in the diff specifically — a new
  `dependencies` entry is an architectural change even when the code looks
  innocuous.
- Raw `@tauri-apps/*` or `node:*` in an extension (the platform ban).
- Host-internal leaf layering: `state` / `services` importing outward.
- A back-edge from `@silo-code/sdk` into the host. The SDK is a leaf.
- Implicit coupling that no import shows: a shared key format, a filename
  convention, an event name, an ordering assumption between two subsystems, or
  a second component that must be edited in lockstep with the first. This is
  the class lint can never catch — spend your attention here.

**The standing rule:** if an extension needs something the SDK lacks, the
answer is _add it to `ctx`_, not reach in. Say so concretely — name the method
you'd add.

**"No concerns" on Q1 is not a valid answer on its own.** Clearing the import
graph — no back-edge, no new package edge, nothing importing internals — only
clears the half that `pnpm lint` and the package graph already enforce. It is
not evidence about the half this question exists for. So a Q1 verdict of "no
concerns" must **name the non-import couplings you checked and ruled out**, or
it doesn't count:

> **Q1 — No concerns.** Import graph clean. Also checked: the id format
> `ctx.panels` accepts (host-composed, and reachable by a third party via
> `DockPanelRecord`? — **no**, see finding), event names, and whether any
> second component must change in lockstep. ✗

The specific trap: a new API that takes an **id, key, or name as a string**.
Trace it end to end — who composes that string, and can the extension author
the docs point at actually obtain it through the SDK? If the only route is
re-implementing the host's format by hand, that is a coupling finding no matter
how clean the imports are. Answer that question explicitly before writing "no
concerns."

Beware the shape "this only exposes an existing internal capability, so there's
nothing new here." That is usually true about the _mechanism_ and says nothing
about the _contract_ — publishing an internal key format is exactly how a
private detail becomes a permanent public one. Treat it as the beginning of the
inquiry, not the end of it.

### Q2 — Does it put logic in the wrong layer?

- **Core primitive vs. extension feature** (ADR 0007): is this in the host that
  should be an extension, or in an extension that should be a primitive?
- **Host chrome vs. kit content** (ADR 0018 / ADR 0026): the `<Modal>` shell,
  Settings rail, status bar, panels, and title bar are host-owned and bespoke;
  their _content_ uses the `@silo-code/sdk` kit. A re-hand-rolled button, list,
  badge, or modal input inside an extension is a layer violation, not a style
  nit. So is host chrome leaking into the kit.
- **Authority**: several ADRs name exactly one owner for a decision — the dock's
  active panel (ADR 0032), focus/activation (ADR 0034), the git-detection
  handler claim, panel resolution on screen (ADR 0053). A second place deciding
  the same thing is the finding, even when it currently agrees.
- **Rust vs. TypeScript**: logic that belongs in the Tauri backend implemented
  in the webview, or vice versa — especially anything that must survive a
  webview reload (terminal/session state, per RFC 0026 and ADR 0010).
- **Persistence**: writes that don't respect the config / app-state / runtime
  split (ADR 0022), or that delete user data without asking (ADR 0046).
- **Logging**: host-side `console.*` instead of an Output channel via
  `createHostChannel`, or a new channel where an existing one fits.

### Q3 — New undocumented dependencies?

Wider than "external services" — in Silo this means:

- A new npm dependency, especially in `packages/sdk` (it ships to third
  parties) or a new dependency edge inside the workspace. Was an existing
  dependency already capable of this?
- A new network call or remote endpoint. Silo is a local-first desktop app;
  anything phoning home is an architectural decision — see ADR 0031
  (update-check analytics via the Worker proxy) for the bar that's been set.
- A dependency on an **external repo**: `silo-code/silo-extensions`
  (`docs/silo-extensions-repo.md`) or `silo-code/extensions-registry`
  (`docs/extensions-registry-repo.md`). A change assuming behavior in one of
  those needs to say so, and the published-SDK lag matters.
- A new assumed-present binary or CLI on the user's machine (an agent CLI, a
  git subcommand, a shell builtin) with no detection or fallback.
- A **public SDK surface** change — anything reaching the `@silo-code/sdk`
  barrel — without the docs work in the same change: TSDoc, `@public` /
  `@category`, the barrel re-export, the hand-authored `ctx` member page,
  `pnpm docs:api`, and the roadmap badge flip. Per `AGENTS.md` that's a
  same-change obligation, so a diff that adds a `ctx` method and no docs is an
  architecture finding, not a follow-up. See
  `.agents/skills/silo-docs-sync/SKILL.md`.

### Q4 — Implicit architectural decisions that should be recorded?

Apply the repo's own three-part test (`docs/decisions/README.md`,
`.agents/skills/silo-domain-modeling/SKILL.md`): a decision earns a record only
when it is **hard to reverse**, **surprising without context**, and **the result
of a real trade-off**. Weigh the SDK rule of thumb — _if getting it wrong means a
breaking SDK change later, it needs the record._

Then place it:

- **ADR** (`docs/decisions/`) — the choice is settled in this diff. Propose the
  next sequential number and a one-line title, and note the index table in
  `docs/decisions/README.md` must be updated (a unit test enforces it).
- **RFC** (`docs/proposals/`) — the change is cross-cutting or contentious
  enough that it should have been designed before being built. Also flag when
  `docs/change-planning-convention.md` says this change needed a proposal and
  doesn't have one.
- **Glossary** (`docs/domain-language.md`) — new or sharpened vocabulary, or a
  collision with an existing term.
- **Contradiction** — the diff conflicts with an ADR that's still `accepted`.
  Name the ADR and say whether the right move is to change the diff or to
  supersede the ADR. Never let a contradiction pass silently.

Be sparing. Most diffs earn zero ADRs; inventing one for a routine change is
its own kind of noise.

**In Mode B this is usually the highest-value question.** Standing code
embodies decisions that were real, deliberate, and never written down — the
author knew why, and that reasoning is now only recoverable from the code.
Surfacing one and writing the retroactive ADR is often worth more than any
coupling finding in the same review. The repo has precedent for exactly this:
`docs/decisions/README.md` notes the initial ADR batch was "seeded
retroactively in decision-date order." Date such an ADR when the decision was
_made_ (from `git log`), not today.

### Q5 — Is it the simplest thing that meets the requirement?

Judged against `AGENTS.md`'s engineering principles, and only at the
architectural altitude:

- Speculative abstraction, configuration, or indirection in **implementation**
  code with no current caller. (The SDK surface is exempt — it's designed ahead
  of use on purpose.)
- A stopgap meant to be replaced later, where the long-term shape is known.
- A layer, service, or registry introduced for one call site.

## 5. Report

Answer each question with a verdict and evidence. Format:

```
### Q1 — Coupling
**Finding** — `packages/extensions-silo/src/foo/bar.ts:42` imports `services/editor-service`.
Violates AGENTS.md's ctx-only rule (and ADR 0004). The capability needed is
"reveal a file in the active editor" → add `ctx.editor.reveal(path)`.
```

- **Open with the scope**: the PR/branch and its base, or — in Mode B — the
  exact directories reviewed and what you deliberately left out.
- **Cite `file:line`** for every finding, and the ADR/RFC/doc it violates.
- **Verify every symbol name against its definition before citing it** — open
  the line, don't name it from memory of the diff. A follow-up that says "the
  host builds this in `dockPanelId()`" when the function is actually
  `recordedPanelId()` sends the implementer grepping for something that does
  not exist, and a confidently wrong name discredits a correct finding.
- **Mark each finding `CONFIRMED` or `INFERRED`.** `CONFIRMED` means you opened
  every file cited and re-read the lines while writing the finding.
  `INFERRED` means part of the chain is reasoning you did not re-verify — say
  which link. This is what makes the report cheap to spot-check: the reader
  knows where to aim. Never mark something `CONFIRMED` you reconstructed from
  memory of the diff.
- **One verdict per question**, even when it's "no concerns."
- **Rank findings by severity**: boundary violations and wrong-layer authority
  first, undocumented decisions second, simplicity observations last.
- **Distinguish** "this is wrong" from "this is a decision that needs a record"
  — they need different responses from the author.
- **In Mode B, label every finding `drift` or `regression`** (step 2) and close
  with a recommendation per finding: _fix now_, _file an issue_, _grandfather
  it_ (say so explicitly — a deliberate exception is a legitimate outcome), or
  _supersede the ADR_. A standing-code review that marks everything "fix now"
  is useless; the judgment about what's worth disturbing **is** the
  deliverable.
- Close with the **concrete follow-ups**: the `ctx` method to add, the ADR
  number and title to write, the doc to update. Don't leave a finding as an
  observation.
- **Anything you hedge into prose still owes a follow-up.** If a paragraph ends
  "…that's a good outcome, but it's accidental rather than stated" or "if that
  was intended, the docs should say so," you have found something — put it in
  the follow-up list with the action attached. The hedge is a signal you're
  unsure whether it's _deliberate_, not whether it _matters_; say which you
  think it is and let the author decide. Findings that die in a subordinate
  clause are the ones that never get fixed.

Do **not** comment on naming, formatting, test coverage, error messages, or
code quality — even when you notice something. If a quality problem is severe
enough that it matters, say so in one line under a separate "Outside this
review's scope" heading and let it go.

## 6. Sequence the fixes

A flat follow-up list leaves the sequencing work to be redone by whoever picks
it up — usually in a fresh session with none of your context. You already know
the dependencies; write them down. **Skip this section entirely if there are no
findings.**

Group the follow-ups into **phases**, each one landable and reviewable on its
own:

- **Split on kind, not on size.** A change to the **public SDK surface** is its
  own phase — it carries the `silo-docs-sync` workflow and a release deadline.
  **Documentation of record** (ADR amendments, glossary entries, roadmap
  badges) is a second phase: different review attention, no code risk.
  **Boundary fixes** in implementation code are a third.
- **Order by dependency.** If a glossary entry should reference a field that
  doesn't exist yet, the field lands first. Say _why_ the order is what it is,
  so it can be safely disregarded when reality differs.
- **Call out any deadline.** Anything that must land before a release — most
  often a public-surface change that becomes un-retractable once published —
  is stated in the phase, not left implicit.
- **Say what is _not_ blocked.** Phases that can run in parallel, or that could
  be dropped entirely without harming the others, should be marked as such.

For each phase, write a **handoff prompt** the author can paste into a fresh
session unmodified. A follow-up bullet is a conclusion; a fresh session needs
the argument. Each prompt carries:

1. **The evidence chain**, numbered — the same `file:line` steps that led you
   to the finding, not just the instruction. Without it the implementer cannot
   tell a correct fix from a plausible one.
2. **The fix**, concretely — the field, method, or wording to add, and any
   scoping detail that keeps it correct (which cases it covers, which it
   doesn't, and why that's complete).
3. **Alternatives you rejected**, one line each, so they aren't re-proposed.
4. **Constraints** — the skills to run (`silo-docs-sync`, `silo-testing`,
   `silo-domain-modeling`), whether a proposal must be reopened (usually **not**
   — a small, well-specified fix doesn't need one; say so explicitly to stop
   the implementer over-processing it), and how to verify.
5. **Permission to reject the finding.** End with: _if you conclude the premise
   is wrong, stop and say so rather than implementing it anyway._ You are one
   reviewer working from a diff; the implementer has the whole file open and
   may be right.

Recommend a model per phase when it matters, and say why in a clause — a
public-surface change or an ADR amendment that becomes permanent record wants
the stronger model; a mechanical edit does not.

Finally, note that **re-running this review after the fixes land** is the
confirmation step, and that it should run in a **fresh session** — a reviewer
checking its own remembered reasoning is not an independent check.
