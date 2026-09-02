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

- [ ] Confirm empirically that `pi` stays in its TUI after positional
      `[messages...]` rather than answering and exiting. Ambiguous → leave
      `promptDelivery` undefined.
- [ ] Confirm empirically whether `copilot` has any interactive form that takes
      an opening prompt. Documented answer is no; ambiguous → undefined.
- [ ] Spot-check one `argv` agent end to end (a real launch with a prompt that
      contains a quote and a newline) before trusting the other four.
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

- [ ] `sanitizePromptForLineEditor` — normalize CRLF/CR → LF, strip CSI and OSC
      sequences whole, remove remaining C0/C1 controls (keep LF), expand tabs.
      Total and idempotent.
- [ ] `ShellDialect` + `shellDialect(shell)` — basename-mapped; `posix` for
      bash/zsh/sh/dash/ksh, `fish` for fish, `unsupported` otherwise (including
      `undefined`).
- [ ] `heredocDelimiter(payload)` — `SILO_PROMPT`, suffixed until no line of the
      payload equals it.
- [ ] `MAX_PROMPT_BYTES` — one documented constant.
- [ ] `PromptRefusal` union and `composePromptLaunchLine` — returns the line to
      type or a refusal. The only place shell syntax is written.
- [ ] fish escaping (`\` → `\\`, `'` → `\'`) inside the same module.

## The launch path

- [ ] Resolve the login shell once: a `default_shell` host command reading
      `$SHELL` (falling back to `/bin/bash`), cached host-side.
- [ ] `PendingLaunch`'s `{ profileId }` arm gains `prompt?`;
      `requestProfileLaunch` accepts it. Leave the `{ rawLine }` arm alone.
- [ ] `drainPendingLaunch` composes `profileLaunchLine(profile)` with the prompt
      when one is claimed, re-resolving delivery and dialect at drain time; a
      refusal types nothing and logs.
- [ ] Convert `\n` → `\r` at the single send seam, and keep the trailing `\r`.
- [ ] `LaunchAgentProfileInput.prompt?` threads through `launchAgentProfile`.
- [ ] Verify a launch with **no** prompt still produces a byte-identical line.

## The CLI

- [ ] `cli.rs`: `CliRequest.prompt`, parsed from `--prompt <text>` /
      `--prompt=<text>`. Use a value reader that does **not** reject a value
      beginning with `-`; a bare trailing `--prompt` still yields `None`.
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
- [ ] `cli.rs` tests — `--prompt <text>`, `--prompt=<text>`, a value beginning
      with `-`, a bare trailing `--prompt`, and mixed order with `--profile` /
      `--ws`.
- [ ] `agent-run-handler` test — a refused prompt creates no terminal, activates
      no workspace, and logs; no-prompt behavior unchanged.
- [ ] The orphaned-session fix (R9) — cancelled after a **spawn** kills the
      session; cancelled after an **attach** does not. Extract the disposition
      decision as a pure helper if `TerminalPanel` is awkward to drive directly
      (per `silo-testing`: extract testable logic rather than reaching for
      `@testing-library/react`).

## Docs

- [ ] `apps/docs/guide/cli.md` — document `--prompt`, with a multi-line example
      (`--prompt "$(cat notes.md)"`), the stated size limit, and what happens
      when the agent or the shell cannot take one.
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
- [ ] Durable decisions recorded as ADRs (none expected — the transport and its
      refusal rule are phase detail the collapsed proposal carries; write one
      only if something outlives this change).
- [ ] Proposal collapsed to a single curated `0033-agent-profiles.md` with the
      phase table updated: phase 3 shipped, `status` stays `accepted` because
      phases 4–9 remain. Index row repointed to `./0033-agent-profiles.md`.
