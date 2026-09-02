# Requirements — 0033. Agent Profiles, phase 3 (Prompt delivery)

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

## R3 — The payload rides in a quoted heredoc, never interpolated

On a POSIX-family shell the sanitized prompt is delivered inside a **quoted**
heredoc, so parameter expansion, command substitution, and quoting are dead by
construction. The prompt text is never spliced into the launch line as a quoted
string, and never written to a temp file.

### Acceptance criteria

- [ ] The composed line delivers the prompt via a quoted heredoc; no code path
      interpolates raw prompt text into the launch line.
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
- [ ] A POSIX-family shell (`bash`, `zsh`, `sh`, and their common variants) gets
      the heredoc transport.
- [ ] `fish` gets a dialect-correct transport of its own, or is refused — not a
      heredoc.
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

## R6 — `silo agent run --prompt <text>`

`silo agent run` gains an optional `--prompt` flag carrying the opening prompt
for the launched agent. It is a flag on an existing verb; it introduces no new
noun, verb, or grammar, and ADR 0047 reads the same with or without it.

### Acceptance criteria

- [ ] `silo agent run --prompt <text>` launches the resolved profile and hands
      the agent that text, composing with `--profile` and `--ws` in any order.
- [ ] `--prompt=<text>` is accepted as well as `--prompt <text>`.
- [ ] A prompt whose text begins with `-` is delivered, not silently dropped as
      a flag.
- [ ] A multi-line prompt (`--prompt "$(cat notes.md)"`) is delivered intact.
- [ ] A bare trailing `--prompt` with no value is ignored, exactly as the other
      flags are — never a panic, never a partial request.
- [ ] Omitting `--prompt` leaves phase 2's behavior untouched.
- [ ] The flag stays **Forward** mode: it asks for an action, reports nothing on
      stdout, and needs no return channel.
- [ ] The Rust parser arm has unit coverage for each of the cases above,
      alongside the existing `agent run` tests.

## R7 — Refusal is visible and never partial

Every reason a prompt cannot be delivered ends the same way: nothing is typed,
no agent is started, and the user is told why in the one place a
fire-and-forget CLI request can speak.

### Acceptance criteria

- [ ] A prompt is refused when the profile resolves to no catalog agent, when
      that agent's `promptDelivery` is undefined or says it takes none, when the
      target shell's dialect cannot be quoted, or when the sanitized prompt
      exceeds the documented size limit.
- [ ] Each refusal reports a distinct, actionable message on the Output panel
      naming the actual reason.
- [ ] A refused prompt **aborts the launch**: no terminal is left holding a
      promptless agent, and no partial line is typed.
- [ ] A launch with no prompt is never affected by any of these checks.
- [ ] There is a documented maximum sanitized prompt size, enforced and tested
      at the boundary.

## R8 — The user-facing story stays in sync in this change

### Acceptance criteria

- [ ] `silo --help` documents `--prompt` under the `agent run` options.
- [ ] `apps/docs/guide/cli.md` documents `--prompt`, including a multi-line
      example and what happens when an agent cannot take one.
- [ ] `docs/domain-language.md` carries the phase's vocabulary if the work
      introduces or sharpens a term (see R1's recon question).
- [ ] No `@silo-code/sdk` symbol is added or changed; if that stops being true,
      the `silo-docs-sync` workflow runs in the same change.

## R9 — A cancelled terminal init leaks no session

Adjacent to prompt delivery, not part of it. `TerminalPanel`'s init effect can
re-run and abandon a PTY it has already spawned; today that session survives
with nothing referencing it. `ensureSession` already handles the identical race
correctly, and this makes the two agree.

### Acceptance criteria

- [ ] An init run that is cancelled **after** spawning a session kills that
      session before returning.
- [ ] An init run that is cancelled after **attaching** to an existing session
      does **not** kill it — the record still points at that session and it
      belongs to the user.
- [ ] The `ui_init_cancelled` attach trace records which of the two happened.
- [ ] No change to what is typed into any terminal: this fixes a leak, not a
      delivery path.
- [ ] Ships as its own commit, revertable without touching prompt delivery.

## Out of scope

- **`ctx.agents.profiles.launch({ prompt })`** and any other public SDK surface
  for prompts — phase 5. Phase 3 builds the seam host-internal on purpose.
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
  one. `--prompt` is the phase's only entry point.
- **A `--prompt` equivalent on the `+` menu or the Agents submenu.** Both are
  point-and-launch gestures with nowhere to type; adding a text field to them
  is a product call this phase does not make.
