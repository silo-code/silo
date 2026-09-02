# Tasks — 0033. Agent Profiles, phase 3 (Prompt delivery)

Implementation plan for **phase 3 only**. Ordered: recon settles the catalog,
the pure core comes next, then the launch path, then the CLI, then docs. Keep
the checkboxes current. Working artifact — removed when the proposal collapses.

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
      consumer reads it synchronously. This is what keeps `applyCliAgentRun`
      synchronous — do not make the CLI handler async.
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

## The CLI

- [ ] `cli.rs`: `CliRequest.prompt`, parsed from `--prompt <text>` /
      `--prompt=<text>` using the **existing** `flag_value` reader. Do not add a
      second reader: prompt text starting with `-` goes through
      `--prompt=<text>`, the same rule every other flag on this verb follows.
- [ ] Add `--prompt` to the `HELP` text under the `agent run` options.
- [ ] `CliAgentRunRequest.prompt` and the `cli:open` / `PendingLaunchArg`
      pass-through.
- [ ] `applyCliAgentRun`: when a prompt is present, precheck with
      `composePromptLaunchLine` **before** creating the terminal; a refusal logs
      the specific reason on `silo:application` and returns without creating,
      activating, or focusing anything.

## Adjacent fix — the orphaned session

Pre-existing and independent of prompt delivery; folded into this phase because
it is four lines beside code the phase already touches. Keep it as its own
commit so it can be reverted without touching the prompt path.

- [ ] `TerminalPanel.tsx` — at the `cancelled` bail (~line 617), reap a session
      this run spawned: `if (needsCreate) void session.kill();` before the
      `return`. **Guard on `needsCreate`** — on the attach path the session
      predates this run and the record still points at it, so killing it would
      destroy a live terminal.
- [ ] Include the disposition (reaped / attached) in the existing
      `ui_init_cancelled` attach trace, so `terminal.log` distinguishes the two.
- [ ] Correct the stale "launch line is occasionally typed twice" paragraph in
      the collapsed proposal's **launch model** section: the symptom it
      describes belonged to the pre-phase-1 `kind` shim
      (`setTimeout(() => session.write(cmd))`, no dedupe), which phase 1
      deleted. What actually survives is a double-**spawn**, now fixed. Do this
      at collapse time, with the rest of the curation.

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
- [ ] `cli.rs` tests — `--prompt <text>`, `--prompt=<text>`, dash-leading text
      via the `=` form, a bare trailing `--prompt`, and mixed order with
      `--profile` / `--ws`.
- [ ] Chunking / size — a composed line at exactly `MAX_PROMPT_BYTES` reaches
      the PTY complete, and one byte over is refused before anything is typed.
- [ ] `agent-run-handler` test — a refused prompt creates no terminal, activates
      no workspace, and logs; no-prompt behavior unchanged.
- [ ] The orphaned-session fix (R9) — cancelled after a **spawn** kills the
      session; cancelled after an **attach** does not. Extract the disposition
      decision as a pure helper if `TerminalPanel` is awkward to drive directly
      (per `silo-testing`: extract testable logic rather than reaching for
      `@testing-library/react`).

## Docs

- [ ] `apps/docs/guide/cli.md` — document `--prompt`, with a multi-line example
      (`--prompt "$(cat notes.md)"`), the 16 KiB limit, the `--prompt=<text>`
      spelling for dash-leading text, which agents accept a prompt, and — per
      R5a — that the prompt lands in shell history like anything else typed.
- [ ] `docs/domain-language.md` — add or sharpen a term only if the work
      actually introduces one; don't invent a synonym for something already
      there.
- [ ] Confirm no `@silo-code/sdk` symbol changed. If one did, run the
      `silo-docs-sync` workflow in this same change.

## Verification

- [ ] Every requirement in `requirements.md` is met or explicitly noted as not.
- [ ] `pnpm test`, `pnpm --filter silo exec tsc --noEmit`, and `pnpm lint` pass;
      Rust tests pass for the `cli.rs` arm.
- [ ] Exercised by hand at a real shell: `silo agent run --profile <id>
--prompt "…"` on a POSIX shell, a multi-line prompt, a prompt full of shell
      metacharacters, and each refusal path.
- [ ] **Run in the real app against a plugin-heavy `zsh`** (autosuggestions,
      syntax highlighting, powerlevel10k) via the `verifier-gui` skill. The
      spike validated bash and `zsh -f`; it could not validate a customized rc,
      and those plugins hook the same keystroke path this transport uses. This
      is the phase's highest-risk unknown — do not close the phase without it.
- [ ] Verify on `fish` too, since it takes the second transport arm.
- [ ] Durable decisions recorded as ADRs (none expected — the transport and its
      refusal rule are phase detail the collapsed proposal carries; write one
      only if something outlives this change).
- [ ] Proposal collapsed to a single curated `0033-agent-profiles.md` with the
      phase table updated: phase 3 shipped, `status` stays `accepted` because
      phases 4–9 remain. Index row repointed to `./0033-agent-profiles.md`.
