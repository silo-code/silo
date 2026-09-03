# Tasks — 0033. Agent Profiles, phase 3 (Prompt delivery + ctx.agents.profiles)

Implementation plan for **phase 3 only** — prompt delivery _and_
`ctx.agents.profiles`. Ordered: recon settles the catalog, the pure core comes
next, then the launch path, then the public surface, then docs. Keep the
checkboxes current. Working artifact — removed when the proposal collapses.

## Recon (done — see the findings table in `design.md`)

All seven installed agents were **run for real** on 2026-09-02, not read from
`--help`. Method for each: launch the agent in a real terminal with a prompt,
then confirm two things — the agent **acted on the prompt**, and it **left you
at its interactive UI** rather than printing and exiting. A process that has
exited is a "no" no matter how good its answer was. Harness: a bare
`pty.fork()` for `pi`; a `tmux` pane for the six whose TUIs query terminal
capabilities before drawing (a raw PTY with no responder stalls them).

- [x] `pi` — `pi "say hello"` answered "hello" and was still at its composer 45s
      later. `{ kind: "argv" }`.
- [x] `copilot` — the positional slot is a **subcommand** (`copilot "say hello"`
      → "Invalid command format", which itself suggests `-i`), and `-p/--prompt`
      is documented and behaves as non-interactive. But
      `-i/--interactive <prompt>` — "Start interactive mode and automatically
      execute this prompt" — answered and left the TUI up.
      `{ kind: "flag", flag: "--interactive" }`. **This overturned the
      pre-recon prediction of `undefined`**, which is the case that justifies
      running the agent rather than reading its help.
- [x] Confirmed the other five empirically too, rather than leaving them on
      `--help` evidence: `claude` 2.1.252, `codex` 0.149.1, `cursor-agent`
      2026.08.31-4057e58, `grok` 1.0.13 — all `argv`; `opencode` 1.18.20 —
      `--prompt`, the only pre-existing `{ kind: "flag" }` arm.
- [x] Wrote each answer — positive **and** negative — into that agent's
      `contract`, and refreshed `lastVerified` / `verifiedAgainstVersion`. Where
      an entry's older findings were confirmed against an earlier version, the
      contract says so explicitly rather than implying a full re-verification.
- [x] Added the prompt-delivery recon question to `docs/adding-a-coding-agent.md`
      Step 1, in the shape the `configDirEnvVar` block uses, with the
      distinguishing test stated and copilot cited as why `--help` is not
      enough. Checklist item added.

Deferred to phase verification (they need the running app, not a unit test):

- [x] Spot-checked an `argv` agent end to end **through Silo itself**
      (2026-09-03): `claude-personal` launched via
      `ctx.agents.profiles.launch({ prompt })`, with a prompt carrying a single
      quote, a double quote, `$HOME`, `` `date` ``, `$(uname)` and an em-dash —
      Claude displayed every one of them literally and answered. The **newline**
      half of this criterion is covered by the 12 byte-exact transport cases
      through the same real shell rather than by this launch, whose prompt was
      single-line.
- [ ] Spot-check `opencode`'s `--prompt` flag the same way — it is the
      `{ kind: "flag" }` arm, and no profile on this machine points at it, so
      the flag arm has still never been through a real launch. Its composition
      is unit-tested; what is unverified is opencode itself accepting the line
      Silo builds.

## Catalog

- [x] Added `AgentPromptDelivery` (`{ kind: "argv" } | { kind: "flag"; flag:
string }`) and `AgentDefinition.promptDelivery?`, with TSDoc stating what the
      field means, the distinguishing recon question, and that `undefined` is a
      deliberate "no".
- [x] Populated `promptDelivery` in `catalog/*.ts` per the recon. Nothing is
      left undefined — all seven answered — so `agent-takes-none` has no live
      producer today. It stays and is tested: it is the answer for any future
      agent whose recon is ambiguous.
- [x] Added `promptDeliveryForAgent` beside `configDirEnvVarForAgent`.

## The pure core — `agents/agent-prompt.ts`

- [x] `sanitizePromptForLineEditor` — CRLF and lone CR → LF.
- [x] …strip ANSI **CSI** sequences whole.
- [x] …strip **OSC** sequences whole, including their terminator (`BEL` and
      `ESC \` both), and an unterminated one rather than leaking its payload.
- [x] …remove remaining C0/C1 controls, keeping LF. Two-byte escapes and
      charset designators are stripped with at most their one introducer byte,
      so ordinary text after an escape survives.
- [x] …expand tabs to spaces. Confirmed total and idempotent.
- [x] `ShellDialect` + `shellDialect(shell)` — basename-mapped; `posix` for
      bash/zsh/sh/dash/ksh/mksh/ash, `fish` for fish, `unsupported` otherwise
      (including `undefined`).
- [x] `heredocDelimiter(payload)` — `SILO_PROMPT`, suffixed until no line of the
      payload equals it.
- [x] `MAX_PROMPT_BYTES` (sanitized UTF-8 bytes, not characters). Drafted at
      `16 * 1024`; **lowered to `2 * 1024` during verification** once a
      plugin-heavy zsh was measured truncating anything above ~4 KiB. See the
      verification section.
- [x] `resolveProfileAgentId` — `assumedAgentId` (validated against the catalog)
      ?? `fallbackAgentForCommand`. Shared with R10's editor affordance via
      `profileAcceptsPrompt`; neither resolves agents its own way.
- [x] `PromptRefusal` union.
- [x] `composePromptLaunchLine` — the POSIX heredoc arm.
- [x] …the fish single-quoted arm (`\` → `\\`, `'` → `\'`).
- [x] …the `{ kind: "flag" }` variant for both dialects (one token's difference
      from `argv`; not forked).
- [x] …the four refusal returns, checked in a fixed order so the fixable
      configuration problem is reported ahead of the environmental one.

## The launch path

- [x] Added the `default_shell` host command (`$SHELL` → `/bin/bash`;
      `COMSPEC` → `cmd.exe` on Windows) and resolved it **during host init**
      into `login-shell.ts`, so every consumer reads it synchronously.
      `ctx.agents.profiles.launch()` returns a result rather than a promise, and
      RFC 0034's `agent.run` handler will read the same value.
- [x] `launchShellDialect()` resolves the dialect: the Terminal setting's
      explicit shell when set, else the login shell. **Design corrected** — the
      drafted rung 1, `TerminalRecord.shell`, does not exist; the real override
      is `store.terminalSettings.shell`, which is what `process-service.ts`
      hands the session host, so it is the better rung anyway.
- [x] `PendingLaunch`'s `{ profileId }` arm gained `prompt?` **and `dialect`**;
      `requestProfileLaunch` accepts them. The `{ rawLine }` arm untouched.
- [x] `drainPendingLaunch` composes `profileLaunchLine(profile)` with the
      prompt when one is claimed, re-resolving the **profile** (not the
      dialect) at drain time; a refusal types nothing and logs to `silo:agents`.
      **Design corrected** — that said `silo:application`, which is the CLI
      handler's channel (and the CLI is out of scope here); the drain is host
      `agents/` code and `silo:agents` already exists for it.
- [x] Convert `\n` → `\r` at the **single** send seam (`sendLine`) and keep the
      trailing `\r`. It is the only such conversion in the codebase.
- [x] **Answered: one `sendInput` does NOT reliably carry 16 KiB, so the send
      chunks.** Traced the whole path: everything up to the daemon loops until
      written, but `write_master_timed`
      (`crates/pty-host/src/daemon.rs`) writes to the PTY master under a
      **one-second deadline and then silently drops the remainder**. A heredoc
      truncated before its delimiter never terminates and parks the user's
      shell in an unterminated quote. Chunked at 1 KiB of UTF-8 per write —
      one deadline per frame — splitting on code-point boundaries so a
      multi-byte character is never cut in half. **Chunking turned out to
      narrow this rather than fix it** — see the verification section; the
      actual mitigation is the lowered `MAX_PROMPT_BYTES`, and the real fix is
      silo-code/silo#497.
- [x] `LaunchAgentProfileInput.prompt?` / `.dialect?` thread through
      `launchAgentProfile`.
- [x] Verified a launch with **no** prompt still produces a byte-identical line
      (one `sendInput` carrying exactly `line + "\r"`).

## R10 — the Profiles tab says whether a prompt is possible

- [x] `ProfileEditorModal` surfaces, in plain language, when the resolved agent
      cannot take an opening prompt — and when the profile resolves to no
      catalog agent at all. Uses `profileAcceptsPrompt`, which routes through
      `resolveProfileAgentId`; there is no second resolution path.
- [x] Purely informational: nothing is blocked, nothing new is persisted, the
      fact is derived from the catalog at render time.
- [x] Follows `docs/modal-design.md` — reuses the existing `apf-field-hint`
      class beside the config-directory hint it mirrors; no new styling.

## `ctx.agents.profiles` — the public surface (R6)

- [x] `AgentProfileSummary` in `packages/sdk` — `id`, `label`, `isDefault`,
      `acceptsPrompt`. A summary type, never the host's `AgentProfile`.
- [x] `LaunchAgentProfileOptions` and `LaunchAgentProfileResult`; `PromptRefusal`
      is public, with each member documented for an extension author.
- [x] `list()` on the host service — read-only, memoized, deeply frozen, the
      same shape `ctx.agents.catalog()` shipped in phase 1, invalidated by
      `subscribeAgentProfiles` so an edit is reflected.
- [x] `launch()` — resolve profile (else `resolveDefaultProfile`) and workspace,
      precheck the prompt, create the terminal, return `{ ok: true, terminalId }`
      or `{ ok: false, refusal }`.
- [x] `activate` (default true) drives workspace activation and terminal focus,
      so an extension can launch quietly.
- [x] Confirmed the background-workspace path returns the id correctly — it
      takes `launchAgentProfile`'s eager-spawn branch, which until now had only
      unit coverage.
- [x] TSDoc on every new symbol with `@public` + `@beta` + `@category`;
      re-exported from `packages/sdk/src/index.ts`.
- [x] The hand-authored `ctx` member page (`apps/docs/api/agents/profiles.md`),
      registered in `apiSidebar`, linked from the overview table and from the
      `ctx.agents` page; then `pnpm docs:api`.
- [x] Flipped the roadmap's `ctx.agents.profiles` entry `planned` → `beta`, and
      its description matches what shipped.

## Specify `--prompt`, don't build it

- [x] Confirmed `prompt` is in `agent.run`'s args in
      `docs/proposals/0034-control-api/` — wire contract, CLI surface line, R11.
      All three were already there.
- [x] Mapped each phase-3 refusal onto 0034's **closed** error vocabulary and
      recorded the choice there: all four are `failed`, with the specifics in
      `message`. No new codes. One finding raised against 0034 while it is
      still cheap to amend: `too-large` reads like `invalid-args`, but that
      code is declared client-side-only and `cli.rs` cannot compute this check
      — the limit applies to the **sanitized** payload, and sanitizing lives
      host-side by design. Recorded so a later reader does not "fix" it.
- [x] **No CLI code shipped.** `cli.rs`, `agent-run-handler.ts`, and
      `silo --help` are untouched.

## Tests

- [x] `agent-prompt.test.ts` (46) — sanitizer (each control class, LF survival,
      tab expansion, idempotence, totality, non-ASCII preserved), dialect (each
      supported name, an absolute path, a Windows path, unknown, `undefined`,
      empty), delimiter collision (whole-line and mid-line, and a collision with
      the suffixed form), composition (metacharacters literal, multi-line
      preserved, `configDir` prefix intact, `\n` not `\r`, fish escaping, the
      flag arm), and one test per refusal including the size boundary at the
      limit, one byte over, bytes-not-characters, and measured after sanitizing.
- [x] `pending-launch.test.ts` (21) — prompt and dialect carried on the claim;
      remove-on-read still yields `null` to the second caller; the drain sends
      the composed line with `\r` throughout; a promptless claim is
      byte-identical to today; each drain-time refusal types nothing; chunking.
- [x] `agent-launch.test.ts` (12) — `prompt`/`dialect` thread through; the
      background branch is unchanged; `launchShellDialect`'s three rungs.
- [x] Chunking / size — a composed line at exactly `MAX_PROMPT_BYTES` reaches
      the PTY complete and in order, one byte over is refused before anything
      is typed, no chunk exceeds the budget, and no multi-byte character is
      split.
- [x] `agent-profiles-service.test.ts` (21) — `list()` shape and freezing and
      memoization; `launch()` returning the terminal id; each refusal coming
      back as a typed result rather than a throw; `activate: false` leaving
      focus alone; a refused prompt creating no terminal and activating no
      workspace.
- [x] Nothing in the SDK surface leaks host state — asserted explicitly that
      `list()` returns summaries carrying no `command` / `configDir` /
      `assumedAgentId`.

## Docs

- [x] `silo-docs-sync` in full for `ctx.agents.profiles`.
- [x] `docs/domain-language.md` — added **Opening Prompt**, with **Prompt
      Delivery** and **Shell Dialect** under it, and the refuse-rather-than-
      approximate rule that governs them. These are genuinely new terms, not
      synonyms for something already there.
- [x] `docs/adding-a-coding-agent.md` Step 1 — the prompt-delivery recon
      question (also listed under Recon).
- [x] **No CLI docs.** `apps/docs/guide/cli.md` and `silo --help` untouched.

## Verification

- [x] `pnpm test` (1663 in the host package alone, all suites green),
      `pnpm --filter silo exec tsc --noEmit`, `pnpm lint`, and `pnpm docs:api`
      all pass. `docs:api` output is committed.
- [ ] Every requirement in `requirements.md` met or explicitly noted as not.
- [x] **Transport verified in the real app, against a real customized `zsh`**
      (2026-09-03, `verifier-gui`, dev build from this worktree — binary
      identity confirmed via `lsof`). Method: a throwaway workspace and a real
      Silo terminal running the user's own `/bin/zsh` and rc; for each case the
      exact line `composePromptLaunchLine` produces was `\r`-converted and sent
      in 1 KiB chunks the way `sendLine` does, invoking a recorder script that
      wrote its `argv[1]` to disk for byte comparison. **12/12 byte-exact**:
      plain; shell metacharacters (`$HOME`, backticks, `$(…)`, `\`, `'`, `"`,
      `;`, `&&`, `|`, `>`); multi-line; quotes at the edges;
      backslash-newline; a payload containing `SILO_PROMPT` as a whole line;
      one containing both `SILO_PROMPT` and `SILO_PROMPT_2`; non-ASCII
      (accents, CJK, emoji); tabs + CRLF; blank lines; `${…}`/`$((…))`; and
      **16 KiB at exactly `MAX_PROMPT_BYTES`, delivered complete across 17
      chunks** — the case the chunking fix exists for.
- [x] Promptless drain regression-checked in the real app: `core.newAgent.codex`
      created the terminal, `ensureSession`'s lazy spawn drained the intent
      through the rewritten `sendLine`, and the agents channel then reported
      `leader="codex"` — the launch line reached the shell and the agent
      started, unchanged from phases 1–2.
- [x] **Run against a plugin-heavy `zsh`** (autosuggestions, syntax
      highlighting, powerlevel10k in a throwaway `ZDOTDIR`) — 2026-09-03. **The
      risk the design named was real.** 11 of 12 cases passed, so the quoting is
      sound on this shell too; the failure was purely size:

      | Payload | Result                                      |
      | ------- | ------------------------------------------- |
      | ≤ 4 KiB | complete, 4/4 runs                          |
      | 6 KiB   | flaky — 1 of 2 runs lost bytes              |
      | ≥ 8 KiB | always truncated (16 KiB arrived as ~14.3)  |

      Two failure modes, both bad: **silent truncation** (the heredoc still
      closes around a short payload, so the agent acts on partial instructions
      with nothing logged anywhere), and a **wedged shell** parked at
      `dquote cmdsubst heredoc>` that automated Ctrl-C did not clear. The same
      payloads all delivered intact on an unadorned zsh, so the ceiling belongs
      to the user's environment, not to Silo.

- [x] **`MAX_PROMPT_BYTES` lowered 16 KiB → 2 KiB** as the mitigation, with the
      measurement recorded at the constant and in `design.md`. Refusing well
      short of the cliff is what turns an invisible corruption into an
      actionable `too-large` a caller can trim and retry. Chunking was
      **downgraded from "the fix" to "a narrowing"** in the same pass — an
      earlier revision of the design claimed it solved this on the strength of
      an unadorned-zsh run.
- [ ] **Re-run the battery at the 2 KiB limit** against the plugin-heavy shell,
      to confirm that what Silo now _accepts_ delivers reliably there. Blocked
      only on the phase-3 dev app: port 7878 is currently held by another
      worktree's build.
- [x] **Exercised end to end from a real installed extension** (2026-09-03).
      The sdk-playground example gained a `ctx.agents.profiles` section — its
      stated purpose is one runnable demo per SDK-surface item — plus a command
      so the same battery can be driven headlessly and read back from the
      extension's own Output channel. Installed into the Silo Dev identity and
      driven in a throwaway workspace. Results, all through the public SDK: - `list()` → 3 profiles, each with `isDefault` / `acceptsPrompt`. - `launch({ prompt: 17 KiB })` → `{ ok: false, refusal: "too-large" }`. - `launch({ profileId: <unknown> })` → `{ ok: false, refusal: "no-profile" }`. - `launch({ profileId: "claude-personal", prompt })` →
      `{ ok: true, terminalId }`; the terminal spawned, the agents channel
      reported `leader=".../bin/claude"`, and **Claude Code displayed the
      prompt verbatim** — `$HOME`, `` `date` ``, `$(uname)`, `'quoted'`,
      `"double"` and an em-dash all literal — and answered it. Every link
      from the public API to the agent's own screen is now covered.
- [ ] Verify on `fish` too, since it takes the second transport arm. **`fish`
      is not installed on this machine**, so this could not be run; its arm is
      unit-tested only.
- [ ] Durable decisions recorded as ADRs. ADR 0047's 2026-09-02 amendment (the
      Forward-vs-Control test) ships with this work; nothing else is expected.
- [ ] Proposal collapsed to a single curated `0033-agent-profiles.md` with the
      phase table updated: phase 3 shipped and phase 5 marked merged into it,
      `status` stays `accepted` because phases 4 and 6–9 remain. Index row
      repointed to `./0033-agent-profiles.md`.
- [ ] Correct the "launch line is occasionally typed twice" paragraph in the
      launch-model section while curating. It does **not** describe a double
      drain (structurally impossible), but the real-app run found what it very
      likely was: a line typed before zsh has drawn its first prompt is echoed
      to scrollback more than once while executing exactly once, and a
      multi-line heredoc makes that far more visible than phase 1's one-word
      command. Rewrite it to say that, rather than deleting it as stale.
- [ ] Follow-up (not this phase): drain on shell **readiness** rather than on
      session spawn, which removes the echo artifact above. A
      terminal-lifecycle change — pair it with the orphaned-session fix rather
      than folding it into a prompt-delivery PR.
- [ ] Follow-up (not this phase): the daemon's `write_master_timed` drops the
      tail of a PTY write after its one-second deadline and reports it only to
      the daemon log, so Silo itself never learns. Chunking makes truncation
      unlikely but cannot rule it out, and the failure mode — a shell parked in
      an unterminated quote with nothing in the Output panel — is bad enough to
      deserve a surfaced warning. Its own issue.
