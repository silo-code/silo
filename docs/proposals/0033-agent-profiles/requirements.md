# Requirements — 0033. Agent Profiles, phase 3 (Prompt delivery + ctx.agents.profiles)

Scoped to **phase 3 only**. Phases 1 and 2 are the implementation baseline (see
`proposal.md` → Planning scope). Working artifact — removed when the proposal
collapses.

The governing rule for the whole phase, which several requirements below
restate in their own terms:

> **A prompt that cannot be delivered safely fails the launch, loudly. Silo
> never starts a promptless agent for a caller who asked for one, and never
> types a payload it is not certain it can quote.**

This is the same reasoning `configDirEnvVar` settled in phase 1 — a mechanism
that looks like it worked and silently didn't is worse than one that isn't
there.

## R1 — The catalog says how each agent takes an opening prompt

`AgentDefinition` gains a `promptDelivery` field describing how (or whether)
that agent accepts an opening prompt on its launch line. Like every other
catalog field it is a fact about the agent's CLI established by empirical
recon, not a user preference and not a guess from the command text.

### Acceptance criteria

- [ ] `AgentDefinition.promptDelivery` exists, is optional, and is documented
      with the same discipline as `configDirEnvVar` (what it means, what the
      distinguishing recon question is, why an agent is left undefined).
- [ ] The field is populated for every catalog agent whose recon establishes an
      answer, and left **undefined** for every agent whose recon does not.
- [ ] Every catalog entry touched records the finding in its `contract` and
      refreshes `lastVerified` / `verifiedAgainstVersion`.
- [ ] An agent whose `promptDelivery` is undefined is treated as "cannot take a
      prompt" — never as "probably positional".
- [ ] The delivery shapes form a small closed union. A new shape is added only
      when an agent's recon actually requires it, never speculatively.
- [ ] `docs/adding-a-coding-agent.md` Step 1 gains the prompt-delivery recon
      question, including the distinguishing test (does the agent stay
      **interactive** after accepting the prompt, or does it turn into a
      one-shot non-interactive run?).

## R2 — A prompt is sanitized for a line editor before it is used

The payload is **typed** into a PTY, so it reaches the shell's line editor as
keystrokes rather than arriving as an argv value. Control bytes therefore have
effects: ESC and C1 sequences fire keybindings, a lone CR submits the line
early, and a tab triggers completion. Sanitization is not optional and does not
depend on which transport or dialect is chosen.

### Acceptance criteria

- [ ] A pure, unit-tested sanitizer exists and is applied to every prompt before
      any line is composed from it.
- [ ] CRLF and lone CR are normalized to LF.
- [ ] ANSI CSI and OSC sequences are stripped **whole**, not byte-by-byte (a
      partially stripped sequence leaves its payload as literal text).
- [ ] Remaining C0 and C1 control characters are removed; LF survives.
- [ ] Tabs are expanded to spaces.
- [ ] The sanitizer is total: every input string produces an output string, and
      no input can make it throw.
- [ ] Sanitizing an already-clean prompt returns it unchanged (idempotent, and
      no cosmetic rewriting of ordinary text).

## R3 — The payload is never interpolated unescaped

Prompt text never reaches a shell as text the shell may interpret. On a
POSIX-family shell that is a **quoted heredoc**, so parameter expansion,
command substitution, and quoting are dead by construction; on `fish`, which
has no heredocs, it is that dialect's exact single-quoted literal (R4). Neither
form is a temp file, and neither splices raw text into the launch line.

### Acceptance criteria

- [ ] On a POSIX-family shell the prompt is delivered via a quoted heredoc.
- [ ] No code path places prompt text into a launch line without the escaping
      its dialect requires.
- [ ] A multi-line prompt is delivered intact, with its line breaks preserved.
- [ ] A prompt containing shell metacharacters (`$`, `` ` ``, `\`, `"`, `'`,
      `;`, `&&`, `$(…)`, backslash-newline) is delivered as literal text and
      executes nothing.
- [ ] The heredoc delimiter is chosen so that no line of the payload can equal
      it; delivery of a payload that contains the default delimiter as a line
      still succeeds.
- [ ] The composition preserves everything phase 1 established about the launch
      line: a profile's `configDir` env prefix still leads, and the profile's
      `command` is still typed verbatim.
- [ ] The composed line is produced by a pure function with unit coverage; the
      drain does not build shell syntax inline.

## R4 — A shell Silo cannot quote refuses the prompt

Both heredoc forms are bash/zsh-family syntax. The transport must know which
dialect the target terminal will run and must not type a heredoc into a shell
that has none.

### Acceptance criteria

- [ ] The dialect is resolved from the terminal's own shell when the record
      names one, and otherwise from the user's login shell.
- [ ] The dialect is decided **once per launch**, at registration, and carried
      on the pending launch — so the precheck and the drain cannot reach
      different conclusions about it.
- [ ] A POSIX-family shell (`bash`, `zsh`, `sh`, and their common variants) gets
      the heredoc transport.
- [ ] `fish` gets its own exact single-quoted transport, escaping `\` and `'`.
- [ ] Any shell Silo has no exact quoting rule for (including an unrecognized
      one) **refuses** the prompt rather than approximating it.
- [ ] Dialect selection is a pure function of the shell name, unit-tested for
      each supported dialect, for a refused one, and for an unknown one.

## R5 — A launch can carry a prompt, resolved at drain time

The pending-launch model from phase 1 is extended to carry an optional prompt.
Everything that model already guarantees continues to hold.

### Acceptance criteria

- [ ] A launch may be registered with an optional prompt, and the drain types
      the composed line — profile launch line plus prompt — as a single intent.
- [ ] `takePendingLaunch` stays remove-on-read, so a prompt is delivered at most
      once and a double-drain remains impossible.
- [ ] Pending launches carrying a prompt are still never persisted.
- [ ] The profile is still resolved at **drain** time; a profile deleted between
      the request and the drain still drains to nothing, prompt included.
- [ ] A launch registered without a prompt produces exactly the line phase 1
      and 2 produce today — byte for byte, with no new trailing whitespace or
      wrapper.
- [ ] Both drain paths — the mounted `TerminalPanel` and `ensureSession`'s lazy
      spawn for a background workspace — deliver a prompt identically.
- [ ] The catalog agent behind a profile is resolved by one shared helper —
      `assumedAgentId` when set, else `fallbackAgentForCommand(command)` — used
      by the launch path and by R10's editor affordance alike.
- [ ] A composed line at `MAX_PROMPT_BYTES` reaches the PTY **complete**. If a
      single `sendInput` cannot carry it, the send chunks and the chunking is
      tested at the limit; a truncated heredoc never terminates and would hang
      the user's shell mid-quote.

## R5a — The prompt is visible to the user, and that is intended

The composed line is typed into the user's own interactive shell, so it appears
in scrollback and enters shell history exactly as if they had typed it. That is
the product's model — phase 1 chose typing into an interactive shell over
`exec` precisely so a launch is something the user can see, edit, and re-run —
and a prompt does not change it.

### Acceptance criteria

- [ ] No attempt is made to hide the prompt from scrollback or suppress it from
      history. Silo does not manipulate the user's `HISTCONTROL` /
      `HIST_IGNORE_SPACE`, which are opt-in and shell-specific.
- [ ] `apps/docs/guide/cli.md` states plainly that a prompt passed to
      `silo agent run` lands in shell history, so a user putting sensitive text
      in one is not surprised.
- [ ] `MAX_PROMPT_BYTES` is justified partly by this: an opening instruction,
      not a file transfer.

## R6 — `ctx.agents.profiles` — the public surface

The transport's consumer, and the reason this phase ships something rather than
a seam. `ctx.agents` gains a `profiles` member exposing the profile list and a
launch that can carry an opening prompt. This was originally phase 5.

Not `pick()` — an extension builds one from `list()` + `ctx.ui.showMenu` in a
few lines, and `showMenu` _is_ the shared chrome. Not `get()` — that is
`list().find()`.

### Acceptance criteria

- [ ] `ctx.agents.profiles.list()` returns the profiles as a read-only,
      deeply-frozen array of a **public summary type** — never the host's
      `AgentProfile` record, matching how `ctx.agents.catalog()` shipped in
      phase 1.
- [ ] Each summary carries enough for a caller to build a picker and decide
      whether to offer a prompt: at least the id, the label, whether it is the
      default, and whether it can take an opening prompt (R10's fact, same
      helper).
- [ ] `launch({ profileId?, workspaceId?, cwd?, prompt?, activate? })` launches
      a profile, defaulting to the resolved default profile when `profileId` is
      omitted — the same `resolveDefaultProfile` the generic `core.newAgent`
      command uses.
- [ ] `launch()` **returns a result**, not `void`: the created terminal's id on
      success, or a typed refusal. This is the whole reason the SDK is a better
      first consumer than a Forward-mode CLI flag — an extension can see what
      happened and tell its user.
- [ ] A refused prompt (R7) creates no terminal and comes back as that typed
      refusal.
- [ ] Launching into a background workspace exercises `launchAgentProfile`'s
      eager-spawn branch, which phase 1 built and only unit-tested.
- [ ] The surface is `@beta` on first publication, consistent with
      `ctx.agents.catalog()`.
- [ ] No extension can reach the host through it: the summary types and the
      launch input live in `@silo-code/sdk`, and nothing in the signature
      exposes host state.

### `--prompt` is specified here, and ships with RFC 0034

ADR 0047 rule 6: _"Every mutating verb gets a defined return payload in its own
proposal **before** it ships, even while the channel can't yet deliver one."_
RFC 0034 is converting `silo agent run` from Forward to Control, and ADR 0047's
2026-09-02 amendment says a new flag on a verb scheduled for conversion is
Control, never Forward. So the flag is designed here and built there.

- [ ] `--prompt` is specified as a `prompt` member of `agent.run`'s Control
      `args`, beside `profile` and `ws`.
- [ ] Each of R7's refusals maps to a code in RFC 0034's **closed** error
      vocabulary, chosen and written down. Nothing new is invented: `no-agent`
      and `agent-takes-none` are configuration the caller can fix,
      `unsupported-shell` is environmental, `too-large` is a bad argument. If
      none fits, that is a finding to raise against RFC 0034 while it is still
      unimplemented — not a reason to add a code here.
- [ ] RFC 0034's package carries `prompt` in `agent.run`'s args, its CLI surface
      line, and R11, so neither package needs rework for the other.
- [ ] **No CLI code ships in this phase.** `cli.rs`, `agent-run-handler.ts`, and
      `silo --help` are untouched by prompt delivery.

## R7 — Refusal is typed, visible, and never partial

Every reason a prompt cannot be delivered ends the same way: nothing is typed,
no agent is started, and the caller is told why **in a form they can act on**.

With `ctx.agents.profiles.launch()` as the consumer, that form is a **return
value** — the extension gets a typed refusal and can show its own message. This
is the concrete gain from dropping the Forward-mode CLI flag: refusals stop
being Output-panel text that the caller never sees.

R10 still matters, and for a better reason than covering for silence: the
static refusals are knowable before anyone launches anything, so surfacing them
where a profile is authored means users meet them at configuration time rather
than as a failed launch.

### Acceptance criteria

- [ ] A prompt is refused when the profile resolves to no catalog agent, when
      that agent's `promptDelivery` is undefined or says it takes none, when the
      target shell's dialect cannot be quoted, or when the sanitized prompt
      exceeds `MAX_PROMPT_BYTES`.
- [ ] Each refusal is a distinct, documented member of the public refusal type
      returned by `launch()` — not a string, not a thrown error.
- [ ] A refusal detected at **precheck** aborts the launch: no terminal record
      is created, no workspace is activated, nothing is focused. `launch()`
      returns the refusal.
- [ ] A refusal detected only at **drain** — the profile was edited between the
      request and the session coming up — types nothing and logs to the Output
      panel. The terminal already exists and is left as a plain shell. This is
      the same shape as phase 1's "a profile deleted mid-launch drains to
      nothing," and it is the only case in which a terminal outlives a refused
      prompt. It is also the only refusal `launch()` cannot return, because it
      happens after it has already returned.
- [ ] A launch with no prompt is never affected by any of these checks.
- [ ] `MAX_PROMPT_BYTES` is **16 KiB** of sanitized UTF-8, enforced and tested
      at the boundary (at the limit, and one byte over).

## R10 — A profile says up front whether it can take a prompt

Whether a profile can be given an opening prompt is a **static** fact — it
depends on the catalog agent the profile resolves to, not on any particular
launch. It therefore belongs on the Profiles tab, next to where the profile is
authored, rather than only in a runtime refusal.

It mirrors phase 1's treatment of `configDirEnvVar`: the editor already shows or
hides the config-directory field based on the resolved agent's catalog entry.
The same fact also rides on `ctx.agents.profiles.list()` (R6), so an extension
building a picker can grey out or annotate a profile without launching one.

### Acceptance criteria

- [ ] A profile whose resolved agent cannot take an opening prompt says so in
      the profile editor, in plain language naming the agent.
- [ ] A profile that resolves to **no** catalog agent says so too — the same
      surface, a different reason.
- [ ] The agent resolution behind this is the **same helper** the launch path
      uses, so the editor and the refusal can never disagree.
- [ ] Nothing is blocked: a profile that cannot take a prompt is still fully
      usable for launching. This is information, not validation.
- [ ] No new setting, no new persisted field — the fact is derived from the
      catalog at render time.

## R8 — The user-facing story stays in sync in this change

### Acceptance criteria

- [ ] The `silo-docs-sync` workflow runs **in full** for `ctx.agents.profiles`:
      TSDoc on every new symbol, `@public`/`@beta` + `@category` tags, the
      barrel re-export from `packages/sdk/src/index.ts`, the hand-authored `ctx`
      member page, and `pnpm docs:api` regenerated.
- [ ] The roadmap's `ctx.agents.profiles` entry flips from `planned` to its
      shipped state, and its sketched surface agrees with what shipped.
- [ ] `docs/domain-language.md` carries the phase's vocabulary if the work
      introduces or sharpens a term (see R1's recon question).
- [ ] `docs/adding-a-coding-agent.md` Step 1 carries the prompt-delivery recon
      question (R1).
- [ ] **No CLI documentation changes.** `apps/docs/guide/cli.md` and
      `silo --help` are untouched — `--prompt` ships with RFC 0034.

## Out of scope

- **`silo agent run --prompt <text>`** as shipped behavior. It is specified in
  R6 as part of `agent.run`'s Control contract and built with RFC 0034. No CLI
  code, help text, or CLI guide changes in this phase.
- **The orphaned-session fix at `TerminalPanel.tsx:617`.** It was briefly folded
  into this phase; it never belonged to prompt delivery, and a terminal-lifecycle
  change riding along with a public SDK addition helps neither review. It goes
  out as **its own PR**: reap a session the cancelled init spawned
  (`if (needsCreate) void session.kill()`), guarded so the attach path never
  kills a live terminal, mirroring `ensureSession` at `terminal-service.ts:260`.
- **Resume composition** (phase 4), per-account hooks (phase 6),
  `SILO_AGENT_PROFILE` (phase 7), per-workspace defaults (phase 8), and the
  CLI's read-back half (phase 9).
- **Hardening `ctx.terminals.sendText`.** Its contract is "as if the user
  typed it", raw and unfiltered, and extensions depend on that. Phase 3 adds a
  safe path beside it; it does not change what `sendText` does.
- **Sending a prompt to an agent that is already running.** Phase 3 delivers an
  _opening_ prompt on the launch line. Talking to a live agent is the
  agent-agnostic runner the proposal rejects outright.
- **Queuing or templating prompts**, prompt history, and any UI for composing
  one. `ctx.agents.profiles.launch()` is the phase's only entry point.
- **A prompt field on the `+` menu or the Agents submenu.** Both are
  point-and-launch gestures with nowhere to type; adding a text field to them
  is a product call this phase does not make.
- **RFC 0031's Start Task.** This phase unblocks it by publishing the surface;
  building it stays in that proposal and that repo.
