# Tasks — 0033. Agent Profiles, phase 3 (Prompt delivery + ctx.agents.profiles)

Implementation plan for **phase 3 only** — prompt delivery _and_
`ctx.agents.profiles`. Ordered: recon settles the catalog, the pure core comes
next, then the launch path, then the public surface, then docs. Keep the
checkboxes current. Working artifact — removed when the proposal collapses.

## Recon (mostly done — see the findings table in `design.md`)

The `--help` pass was run against all seven installed agents on 2026-09-02 and
is recorded in `design.md` → "Recon findings". Five take a positional prompt
(`claude`, `codex`, `grok`, `cursor-agent`, `pi`), `opencode` needs a
`--prompt` flag because its positional is a project path, and `copilot`'s
`-p/--prompt` is documented as non-interactive. What remains:

**Method** for each empirical check below: launch the agent in a real terminal
with a positional prompt, then confirm two things — the agent **acted on the
prompt**, and it **left you at its interactive UI** rather than printing and
exiting. A process that has exited is a "no" no matter how good its answer was.

- [ ] `pi` — run `pi "say hello"`; confirm it answers **and** stays in the TUI.
      Ambiguous → leave `promptDelivery` undefined.
- [ ] `copilot` — establish whether any interactive form takes an opening
      prompt (`-p` is documented as non-interactive). Ambiguous → undefined.
- [ ] Spot-check one confirmed `argv` agent end to end through Silo itself, with
      a prompt containing a single quote, a double quote, a `$`, and a newline.
- [ ] Spot-check `opencode`'s `--prompt` flag the same way — it is the only
      `{ kind: "flag" }` entry, so nothing else covers that arm.
- [ ] Write each answer — positive **and** negative — into that agent's
      `contract`, and refresh `lastVerified` / `verifiedAgainstVersion`.
- [ ] Add the prompt-delivery recon question to `docs/adding-a-coding-agent.md`
      Step 1, in the shape the `configDirEnvVar` block uses, with the
      distinguishing test stated: accepting prompt text in a **non-interactive**
      mode is a "no" for this field.

## Catalog

- [ ] Add `AgentPromptDelivery` (`{ kind: "argv" } | { kind: "flag"; flag:
string }`) and `AgentDefinition.promptDelivery?`, with TSDoc stating what the
      field means, the distinguishing recon question, and that `undefined` is a
      deliberate "no".
- [ ] Populate `promptDelivery` in `catalog/*.ts` per the recon; leave it
      undefined where recon says no.
- [ ] Add a catalog accessor beside `configDirEnvVarForAgent` for looking the
      field up by agent id.

## The pure core — `agents/agent-prompt.ts`

Split finely on purpose: this module is where the phase's whole risk lives, and
"write the sanitizer" is not a reviewable unit.

- [ ] `sanitizePromptForLineEditor` — CRLF and lone CR → LF.
- [ ] …strip ANSI **CSI** sequences whole.
- [ ] …strip **OSC** sequences whole, including their terminator (`BEL` and
      `ESC \` both).
- [ ] …remove remaining C0/C1 controls, keeping LF.
- [ ] …expand tabs to spaces. Confirm total and idempotent.
- [ ] `ShellDialect` + `shellDialect(shell)` — basename-mapped; `posix` for
      bash/zsh/sh/dash/ksh, `fish` for fish, `unsupported` otherwise (including
      `undefined`).
- [ ] `heredocDelimiter(payload)` — `SILO_PROMPT`, suffixed until no line of the
      payload equals it.
- [ ] `MAX_PROMPT_BYTES = 16 * 1024` (sanitized UTF-8 bytes, not characters).
- [ ] `resolveProfileAgentId` — `assumedAgentId` ?? `fallbackAgentForCommand`.
      Shared with R10's editor affordance; neither may resolve agents its own
      way.
- [ ] `PromptRefusal` union.
- [ ] `composePromptLaunchLine` — the POSIX heredoc arm.
- [ ] …the fish single-quoted arm (`\` → `\\`, `'` → `\'`).
- [ ] …the `{ kind: "flag" }` variant for both dialects (one token's difference
      from `argv`; do not fork the function).
- [ ] …the four refusal returns.

## The launch path

- [ ] Add the `default_shell` host command (`$SHELL`, falling back to
      `/bin/bash`) and resolve it **during host init** into host state, so every
      consumer reads it synchronously. `ctx.agents.profiles.launch()` returns a
      result rather than a promise, and RFC 0034's `agent.run` handler will read
      the same value — neither should have to await a constant.
- [ ] `PendingLaunch`'s `{ profileId }` arm gains `prompt?` **and `dialect`**;
      `requestProfileLaunch` accepts them. Leave the `{ rawLine }` arm alone.
- [ ] `drainPendingLaunch` composes `profileLaunchLine(profile)` with the
      prompt when one is claimed, re-resolving the **profile** (not the
      dialect) at drain time; a refusal types nothing and logs.
- [ ] Convert `\n` → `\r` at the **single** send seam and keep the trailing
      `\r`. Assert there is exactly one such conversion in the codebase — doing
      it twice leaves a heredoc that never terminates.
- [ ] Confirm whether one `sendInput` carries a 16 KiB line to the PTY intact;
      chunk the send if not. A truncated heredoc hangs the user's shell in an
      unterminated quote.
- [ ] `LaunchAgentProfileInput.prompt?` threads through `launchAgentProfile`.
- [ ] Verify a launch with **no** prompt still produces a byte-identical line.

## R10 — the Profiles tab says whether a prompt is possible

- [ ] `ProfileEditorModal` surfaces, in plain language, when the resolved agent
      cannot take an opening prompt — and when the profile resolves to no
      catalog agent at all. Use `resolveProfileAgentId`, never a second
      resolution path.
- [ ] Purely informational: nothing is blocked, nothing new is persisted, the
      fact is derived from the catalog at render time.
- [ ] Follow `docs/modal-design.md` and the SDK kit — no hand-rolled styling,
      design tokens only.

## `ctx.agents.profiles` — the public surface (R6)

This is the phase's consumer and its only public API. `silo-docs-sync` applies
in full; do the docs in this change, not after.

- [ ] `AgentProfileSummary` in `packages/sdk` — `id`, `label`, `isDefault`,
      `acceptsPrompt`. A summary type, never the host's `AgentProfile`.
- [ ] `LaunchAgentProfileOptions` and `LaunchAgentProfileResult`; make
      `PromptRefusal` public and name its members for an extension author.
- [ ] `list()` on the host service — read-only, memoized, deeply frozen, the
      same shape `ctx.agents.catalog()` shipped in phase 1.
- [ ] `launch()` — resolve profile (else `resolveDefaultProfile`) and workspace,
      precheck the prompt, create the terminal, return `{ ok: true, terminalId }`
      or `{ ok: false, refusal }`.
- [ ] `activate` (default true) drives workspace activation and terminal focus,
      so an extension can launch quietly.
- [ ] Confirm the background-workspace path returns the id correctly — it takes
      `launchAgentProfile`'s eager-spawn branch, which until now had only unit
      coverage.
- [ ] TSDoc on every new symbol with `@public`/`@beta` + `@category`; re-export
      from `packages/sdk/src/index.ts`.
- [ ] The hand-authored `ctx` member page, then `pnpm docs:api`.
- [ ] Flip the roadmap's `ctx.agents.profiles` entry, and make sure its sketched
      surface matches what shipped.

## Specify `--prompt`, don't build it

ADR 0047's 2026-09-02 amendment: a new flag on a verb scheduled for conversion
is Control, never Forward. No `cli.rs`, no `agent-run-handler.ts`, no `--help`,
no CLI guide in this phase.

- [ ] Confirm `prompt` is in `agent.run`'s args in
      `docs/proposals/0034-control-api/` — wire contract, CLI surface line, R11.
- [ ] Map each phase-3 refusal onto 0034's **closed** error vocabulary and
      record the choice there. Invent no new codes; raise a finding against 0034
      if none fits, while it is still cheap to amend.

## Tests

- [ ] `agent-prompt.test.ts` — sanitizer (each control class, LF survival, tab
      expansion, idempotence, totality), dialect (each supported name, an
      absolute path, unknown, `undefined`), delimiter collision (whole-line and
      mid-line), composition (metacharacters literal, multi-line preserved,
      `configDir` prefix intact, `\n` not `\r`, fish escaping), and one test per
      refusal including the size boundary at the limit and one byte over.
- [ ] `pending-launch.test.ts` — prompt carried on the claim; remove-on-read
      still yields `null` to the second caller; the drain sends the composed
      line; a promptless claim is byte-identical to today.
- [ ] `agent-launch.test.ts` — `prompt` threads through; the background branch
      is unchanged.
- [ ] Chunking / size — a composed line at exactly `MAX_PROMPT_BYTES` reaches
      the PTY complete, and one byte over is refused before anything is typed.
- [ ] `ctx.agents.profiles` — `list()` shape and freezing; `launch()` returning
      the terminal id; each refusal coming back as a typed result rather than a
      throw; `activate: false` leaving focus alone; a refused prompt creating no
      terminal and activating no workspace.
- [ ] Nothing in the SDK surface leaks host state — `list()` returns summaries,
      not `AgentProfile` records.

## Docs

- [ ] `silo-docs-sync` in full for `ctx.agents.profiles` (see that task group) —
      this is the phase's docs work, and it is not optional.
- [ ] `docs/domain-language.md` — add or sharpen a term only if the work
      actually introduces one; don't invent a synonym for something already
      there.
- [ ] `docs/adding-a-coding-agent.md` Step 1 — the prompt-delivery recon
      question (also listed under Recon).
- [ ] **No CLI docs.** `apps/docs/guide/cli.md` and `silo --help` are untouched;
      `--prompt` documents itself when RFC 0034 ships it.

## Verification

- [ ] Every requirement in `requirements.md` is met or explicitly noted as not.
- [ ] `pnpm test`, `pnpm --filter silo exec tsc --noEmit`, `pnpm lint`, and
      `pnpm docs:api` all pass and leave no uncommitted generated output.
- [ ] Exercised for real from an extension: launch a profile with a multi-line
      prompt, a prompt full of shell metacharacters, and each refusal path.
      `packages/extensions-silo`'s sdk-playground is the natural harness.
- [ ] **Run in the real app against a plugin-heavy `zsh`** (autosuggestions,
      syntax highlighting, powerlevel10k) via the `verifier-gui` skill. The
      spike validated bash and `zsh -f`; it could not validate a customized rc,
      and those plugins hook the same keystroke path this transport uses. This
      is the phase's highest-risk unknown — do not close the phase without it.
- [ ] Verify on `fish` too, since it takes the second transport arm.
- [ ] Durable decisions recorded as ADRs. ADR 0047's 2026-09-02 amendment (the
      Forward-vs-Control test) ships with this work; nothing else is expected.
- [ ] Proposal collapsed to a single curated `0033-agent-profiles.md` with the
      phase table updated: phase 3 shipped and phase 5 marked merged into it,
      `status` stays `accepted` because phases 4 and 6–9 remain. Index row
      repointed to `./0033-agent-profiles.md`.
- [ ] Correct the stale "launch line is occasionally typed twice" paragraph in
      the launch-model section while curating — it describes the pre-phase-1
      `kind` shim, which no longer exists.
