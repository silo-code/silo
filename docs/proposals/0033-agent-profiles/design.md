# Design — 0033. Agent Profiles, phase 3 (Prompt delivery)

Design for **phase 3 only**. Phases 1 and 2 are the baseline. Working artifact
— removed when the proposal collapses.

## Architecture

Four seams, in dependency order. Nothing here is public SDK surface.

| Where                                                                       | What changes                                                              |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `packages/extension-host/…/agents/agent-catalog.ts` + `catalog/*.ts`        | `AgentDefinition.promptDelivery`, populated per recon                     |
| `packages/extension-host/…/agents/agent-prompt.ts` **(new)**                | The whole pure core: sanitizer, dialect, delimiter, composition, refusals |
| `packages/extension-host/…/agents/pending-launch.ts` + `agent-launch.ts`    | A launch may carry a prompt; the drain composes it                        |
| `apps/desktop/src-tauri/…/commands/cli.rs` + `src/cli/agent-run-handler.ts` | `--prompt` parsed, forwarded, prechecked                                  |
| `packages/extensions-core/src/agents-settings/ProfileEditorModal.tsx`       | R10 — the profile says whether it can take a prompt                       |
| `packages/extensions-core/src/terminal/TerminalPanel.tsx`                   | R9 — the orphaned-session fix (adjacent; own commit)                      |

The design deliberately puts **all** the reasoning in one pure module. The
drain, the CLI handler, and (later) phase 5 each call the same function and act
on its result; none of them builds shell syntax inline. That is what makes a
phase whose risk is entirely "did we quote it right" coverable by unit tests.

## Components

### `agent-prompt.ts` — the pure core

```ts
/** Why a prompt could not be delivered. Each maps to one Output message. */
type PromptRefusal =
  | "no-agent" // the profile resolves to no catalog agent
  | "agent-takes-none" // that agent declares no promptDelivery
  | "unsupported-shell" // no exact quoting rule for this dialect
  | "too-large"; // over MAX_PROMPT_BYTES after sanitizing

type ShellDialect = "posix" | "fish" | "unsupported";

/** Strip what a line editor would act on. Total, idempotent, pure. */
function sanitizePromptForLineEditor(text: string): string;

/** The dialect of the shell a terminal will actually run. */
function shellDialect(shell: string | undefined): ShellDialect;

/** The catalog agent a profile resolves to — `assumedAgentId` when set, else
 *  matched from the command text. The single source the launch path and the
 *  Profiles editor (R10) share, so a refusal and its warning cannot drift. */
function resolveProfileAgentId(
  profile: Pick<AgentProfile, "assumedAgentId" | "command">,
): string | undefined;

/** A delimiter no line of `payload` equals. */
function heredocDelimiter(payload: string): string;

/** The whole decision: the line to type, or why not. */
function composePromptLaunchLine(input: {
  launchLine: string; // phase 1's `profileLaunchLine(profile)`, unchanged
  prompt: string; // raw; this function sanitizes
  delivery: AgentPromptDelivery | undefined;
  dialect: ShellDialect;
}): { line: string } | { refusal: PromptRefusal };
```

`composePromptLaunchLine` is the only place shell syntax is written. It is
called from two points — the CLI precheck and the drain — and the inputs that
_can_ differ between them are deliberately narrowed to one: the **profile**,
which phase 1 established is resolved at drain time so a mid-flight edit is
respected. `dialect` is decided once at registration and carried on the pending
launch, and `delivery` follows from the profile. So the two calls can only
disagree when the user edits the profile mid-launch, which is exactly the case
R7 documents.

### The catalog field

```ts
/** How this agent accepts an *opening* prompt on its launch line while
 *  staying interactive. Undefined = no reconned way to hand it one. */
promptDelivery?: AgentPromptDelivery;

type AgentPromptDelivery =
  | { kind: "argv" } // positional, appended to the command
  | { kind: "flag"; flag: string }; // named option, e.g. `--prompt <text>`
```

A discriminated union matching `AgentResume`'s shape. **Both members are
required by recon, not speculation** — see the table below. A third shape is
added only when an agent's recon demands one; in particular `{ kind: "stdin" }`
is _not_ planned, because a heredoc on stdin detaches an interactive TUI from
the tty, which is the opposite of what this phase is for.

`undefined` is the "no" answer and carries the same discipline as
`configDirEnvVar`: the negative finding goes in that agent's `contract`, so the
next person reads why rather than re-running the recon.

#### Recon findings (2026-09-02, macOS, all seven installed locally)

The distinguishing question is **not** "does it accept prompt text" but "does
it accept prompt text **and stay interactive**." Every agent here has a
non-interactive mode that also takes a prompt; that mode is a **no** for this
field, because a profile launch is an interactive TUI in a tab.

| Agent          | Evidence                                                                                          | `promptDelivery`                               |
| -------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `claude`       | `claude [options] [command] [prompt]`; `-p/--print` is the non-interactive one                    | `{ kind: "argv" }`                             |
| `codex`        | `codex [OPTIONS] [PROMPT]`, "forwarded to the interactive CLI"; `exec` is the non-interactive one | `{ kind: "argv" }`                             |
| `grok`         | `[PROMPT]` — "Initial prompt for the interactive session, e.g. `grok \"fix the bug\"`"            | `{ kind: "argv" }`                             |
| `cursor-agent` | `agent [options] [command] [prompt...]`; `-p/--print` is the non-interactive mode                 | `{ kind: "argv" }`                             |
| `pi`           | `pi [options] [--] [@files...] [messages...]`                                                     | `{ kind: "argv" }` — **confirm empirically**   |
| `opencode`     | the positional is a **project path**, not a prompt; the TUI takes `--prompt <string>`             | `{ kind: "flag", flag: "--prompt" }`           |
| `copilot`      | "Start an interactive session…, or use `-p/--prompt` for **non-interactive** scripting"           | likely **undefined** — **confirm empirically** |

`opencode` is why the union has two members: appending its prompt positionally
would set the project directory to the prompt text.

Two entries above are read from `--help` and still need the empirical run that
`configDirEnvVar` got — whether `pi` stays in its TUI after positional
messages, and whether `copilot -p` has any interactive form. Both default to
`undefined` (refuse) if the run is ambiguous.

### Shell dialect

The transport is bash/zsh syntax, so the dialect must be known before anything
is typed. Resolution, in order:

1. `TerminalRecord.shell` when the record names one (a per-terminal override
   the host already stores).
2. The user's login shell, from a new `default_shell` host command reading
   `$SHELL` (`/bin/bash` when unset — the same fallback `main.rs` already
   uses).

Mapped by basename: `bash` / `zsh` / `sh` / `dash` / `ksh` → `posix`; `fish` →
`fish`; everything else → `unsupported`.

**Resolved once, at host init — not per launch.** `default_shell` is a Tauri
`invoke` and therefore async, but `applyCliAgentRun` is synchronous and its
callers (the warm `cli:open` emit and the cold `PendingLaunchArg` path) expect
it to stay that way. Making the CLI handler async to fetch a value that never
changes would push a signature change through both paths for nothing. So the
login shell is resolved **during host initialization** and held in host state;
every consumer reads it synchronously. This is also what lets the dialect be
decided once per launch and carried on the pending launch, rather than
re-derived at drain time from a record that did not exist at precheck.

**Why fish gets a real transport rather than a refusal.** It doubles the
composition surface, which is a genuine cost — but fish is common in exactly
this product's audience, its single-quoting rule is small and exact (only `\`
and `'` need escaping, and newlines are literal inside quotes), and the
detection machinery is needed either way to _recognize_ fish. Refusing a whole
shell community on a new feature to save one small function is the wrong trade.

**Known limitation, accepted:** the login shell is read in the app process,
while the session host resolves `$SHELL` in its own. They are the same value in
every normal launch (the daemon inherits the app's environment), and rung 1
covers the per-terminal case. If this ever bites, the escalation is to read the
session's foreground leader — authoritative, no new IPC, but it makes the drain
async — not to guess harder. Not built now.

### The orphaned-session fix

`TerminalPanel`'s init effect can re-run (StrictMode double-invoke in dev, a
fast remount). When it does, the in-flight run reaches the `cancelled` bail
after its PTY has already come up and returns without disposing of it. Because
the bail sits **above** the `tRec.sessionId` assignment, nothing ever references
that session again: it is a live shell with no tab, surviving until the app
quits.

The fix mirrors `ensureSession` — reap the orphan before returning — with the
one guard that makes it safe:

```ts
if (cancelled) {
  // Only a session this run *spawned* is an orphan. On the attach path the
  // session predates us and the record still points at it — killing it would
  // destroy a live terminal.
  if (needsCreate) void session.kill();
  …
}
```

`session.kill()` is `deleteTerminal(id)`, which destroys the persistent
session, so the `needsCreate` guard is load-bearing rather than defensive. The
existing `ui_init_cancelled` attach trace gains the disposition (reaped or
attached) so a post-mortem can tell the two apart — per AGENTS.md, terminal
lifecycle is diagnosed from `terminal.log`, not the Output panel.

This is the phase's one change outside the prompt path. It ships with its own
test and is described in the collapsed proposal as an adjacent fix, not as part
of prompt delivery.

## Data flow

`silo agent run --profile claude-work --prompt "fix the CI"`:

1. **`resolve_cli_request`** parses `--prompt` into a new `CliRequest.prompt`.
   Warm launches carry it through the existing `cli:open` emit; cold launches
   through `PendingLaunchArg`. No new IPC.
2. **`applyCliAgentRun`** resolves the profile and workspace exactly as phase 2
   does. Then, **only when a prompt is present**, it runs
   `composePromptLaunchLine` as a **precheck** — before creating anything. A
   refusal logs and returns: no terminal record, no workspace activation, no
   focus change.
3. **`launchAgentProfile({ …, prompt })`** creates the terminal record and calls
   `requestProfileLaunch(rec.id, profileId, prompt)`.
4. **The drain** (`TerminalPanel` on ready, or `ensureSession` for a background
   workspace) resolves the profile, builds `profileLaunchLine(profile)`, and —
   when the claim carries a prompt — runs `composePromptLaunchLine` again
   against the profile as it is _now_.
5. The resulting line is typed with one `sendInput` call.

Steps 2 and 4 evaluate the same function. The precheck is what satisfies R7's
"a refused prompt aborts the launch" — it runs before anything is created, so a
refusal costs nothing. The re-evaluation at drain is what keeps phase 1's
"resolved at drain time" promise when a profile is edited in between; the
dialect, decided at step 3 and carried on the pending launch, is _not_
re-derived, so the profile is the only input that can have changed.

If the drain refuses where the precheck passed, it types **nothing** and logs.
The terminal already exists at that point and is left as a plain shell — the
one case in which a terminal outlives a refused prompt, and the same shape as
phase 1's "a profile deleted mid-launch drains to nothing." R7 names it
explicitly rather than pretending the precheck is total.

### Newlines: `\n` in the model, `\r` on the wire

The composed line is a normal multi-line string with `\n` separators.
Terminals receive **`\r`** for Enter, so exactly one seam — the drain's send —
converts `\n` → `\r` and appends the trailing `\r`. Keeping the conversion out
of the pure core is what lets its tests assert readable expected strings; doing
it in two places is how a heredoc silently never terminates.

## The composed lines

`posix` + `{ kind: "argv" }` — a quoted heredoc inside a command substitution,
which is what kills expansion and quoting in one move and makes multi-line and
very long payloads unremarkable:

```sh
CLAUDE_CONFIG_DIR='/Users/me/.claude-work' claude "$(cat <<'SILO_PROMPT'
fix the CI
SILO_PROMPT
)"
```

Everything left of the payload is phase 1's `profileLaunchLine` verbatim — the
`configDir` env prefix and the profile's `command` are untouched, which is what
keeps R5's "a launch with no prompt is byte-identical" true.

The delimiter is `SILO_PROMPT`, with a numeric suffix appended and incremented
until no **line** of the sanitized payload equals it. Only a whole-line match
can terminate a heredoc early, so that is the only collision worth handling.

`posix` + `{ kind: "flag" }` — identical, with the flag between the command and
the payload. The two members differ by one token, which is the point of making
them a union rather than two code paths:

```sh
opencode --prompt "$(cat <<'SILO_PROMPT'
fix the CI
SILO_PROMPT
)"
```

`fish` + either kind — fish has no heredocs, but its single-quoted strings are
exact and span newlines; only `\` and `'` need escaping:

```fish
claude 'fix the
CI'
```

### Transport validation (spike, 2026-09-02)

The whole phase rests on "a quoted heredoc typed as keystrokes into an
interactive shell delivers its payload intact." That was verified before the
design committed to it, by driving a real PTY — `pty.fork()`, an interactive
shell, the composed line written as keystrokes with `\r` line endings, and the
receiving program writing its `argv[1]` to a file for byte comparison:

| Shell                      | Result                                                                                 |
| -------------------------- | -------------------------------------------------------------------------------------- |
| interactive `bash`         | **byte-exact** — `$HOME`, `` `date` ``, `$(uname)`, embedded newlines all literal      |
| `zsh -f`                   | **byte-exact**; bracketed-paste mode (`ESC[?2004h`) active and harmless to typed input |
| `zsh` with a heavy user rc | inconclusive — the spike harness got no output at all                                  |

Two things follow. First, the transport is sound and the `$(cat <<'X' … X\n)"`
form is correct as written. Second — and more important — **the third row is
the real risk**, and no synthetic PTY can retire it: plugin-heavy line editors
(zsh-autosuggestions, syntax highlighting, powerlevel10k instant prompt) hook
the same keystroke path this transport uses. That verification has to happen in
the real app against a real user shell, which is why it is a `verifier-gui`
task rather than a unit test.

Any other dialect refuses (`unsupported-shell`). Nu and PowerShell are
deliberately not implemented: nu's raw-string forms are their own puzzle, and
approximating a quoting rule is precisely the failure mode this phase is
avoiding.

## APIs / interfaces

No `@silo-code/sdk` change. `promptDelivery`, `agent-prompt.ts`, and the
extended pending-launch registry are all host-internal, and `--prompt` is a CLI
flag. The `silo-docs-sync` workflow does not apply; if implementation forces a
public symbol, it does.

Host-internal shapes that change:

- `AgentDefinition.promptDelivery?: AgentPromptDelivery`
- `PendingLaunch`: the `{ profileId }` arm gains `prompt?: string`. The
  `{ rawLine }` arm (the deprecated-kind fallback) does **not** — it has no
  profile and no agent, so there is nothing to resolve a delivery from.
- `LaunchAgentProfileInput.prompt?: string`
- `CliRequest.prompt: Option<String>` (Rust) / `CliAgentRunRequest.prompt?:
string` (TS)

## Persistence

**Nothing new is persisted.** `promptDelivery` is code, not user data. Pending
launches stay in the module-level map that phase 1 deliberately kept
off-disk — and a prompt is a stronger reason for that rule, not a weaker one:
an intent that survived a restart would type someone's half-forgotten task into
a terminal they reopened hours later.

## Error handling

| Refusal             | Cause                                                        | Message names                                      |
| ------------------- | ------------------------------------------------------------ | -------------------------------------------------- |
| `no-agent`          | Profile has no `assumedAgentId` and none matches its command | the profile, and that a prompt needs a known agent |
| `agent-takes-none`  | Resolved agent declares no `promptDelivery`                  | the agent                                          |
| `unsupported-shell` | Dialect is neither `posix` nor `fish`                        | the shell                                          |
| `too-large`         | Sanitized prompt exceeds `MAX_PROMPT_BYTES`                  | the limit and the actual size                      |

All four report on the existing `silo:application` / **Application** channel via
`createHostChannel` — the same channel phase 2's profile and workspace misses
use, and the only place a Forward-mode CLI request can speak (ADR 0047: there
is no stdout and no meaningful exit code until the Control API).

`MAX_PROMPT_BYTES` is **16 KiB** of sanitized UTF-8. A prompt is an opening
instruction, not a file transfer; a bounded, stated limit that fails loudly
beats an unbounded paste that wedges a line editor. 16 KiB is far more than any
real instruction, far under `ARG_MAX`, and small enough to stay tractable for
the line editor and for the history file the line lands in (R5a). The CLI guide
states it.

**PTY write chunking.** A 16 KiB composed line may exceed what a single
`sendInput` can carry in one write. A truncated heredoc is the worst possible
failure here: the delimiter never arrives, so the user's shell sits in an
unterminated quote waiting for input that will never come. The send must
therefore either be proven to carry the full line or chunk it, and the boundary
case must be tested at exactly `MAX_PROMPT_BYTES` rather than assumed. This is
the one place where "it worked in the spike" is not evidence — the spike's
payloads were small.

## Testing strategy

Pure-logic Vitest, co-located, no `@testing-library/react` — per
`.agents/skills/silo-testing/SKILL.md`. The phase's risk is concentrated in one
pure module, so the coverage is too.

`agent-prompt.test.ts` — the bulk:

- **Sanitizer**: CRLF and lone CR → LF; a CSI sequence stripped whole; an OSC
  sequence stripped whole (including its terminator); C0 and C1 controls
  removed with LF surviving; tabs expanded; already-clean text unchanged
  (idempotence); a second pass equals the first; adversarial input does not
  throw.
- **Dialect**: each supported basename, an absolute path (`/opt/homebrew/bin/fish`),
  an unknown shell, and `undefined`.
- **Delimiter**: a payload containing `SILO_PROMPT` as a line still round-trips;
  a payload containing it mid-line does not force a suffix.
- **Composition**: shell metacharacters delivered literally; multi-line
  preserved; the `configDir` prefix still leads; `\n` separators (not `\r`) in
  the returned string; fish escaping of `\` and `'`.
- **Refusals**: one test per `PromptRefusal`, including the size boundary at
  exactly the limit and one byte over.

`pending-launch.test.ts` — a claim carries its prompt; remove-on-read still
yields `null` to the second caller; the drain sends the composed line; a claim
with **no** prompt sends a line byte-identical to today's.

`agent-launch.test.ts` — `prompt` threads through to the registry; the
background branch behaves as before.

`cli.rs` unit tests, beside the existing `agent_run_*` ones — `--prompt <text>`,
`--prompt=<text>`, a value beginning with `-`, a bare trailing `--prompt`, and
`--prompt` combined with `--profile` and `--ws` in mixed order.

`agent-run-handler` — a refused prompt creates no terminal, activates no
workspace, and logs; a launch with no prompt is unchanged.

## Constraints and existing decisions

- **ADR 0028 (sealed detection)** — a prompt says nothing about identity. It
  never writes `AgentInfo.agentId` and never seeds `isAgent`; the terminal
  becomes an agent when detection says so, exactly as in phase 1.
- **ADR 0041 / 0042 (modular agent catalog)** — `promptDelivery` is a catalog
  fact. Every entry touched updates `contract`, `lastVerified`, and
  `verifiedAgainstVersion`, and the recon question joins
  `docs/adding-a-coding-agent.md` Step 1 so the next agent answers it
  deliberately.
- **ADR 0046 (never create or destroy user data unprompted)** — a refused
  prompt creates no terminal record. This is the same reasoning that kept
  phase 1 from synthesizing a profile.
- **ADR 0047 (CLI grammar)** — `--prompt` is a flag on an existing verb, not a
  new noun or verb, so the grammar is untouched. Rule 7's "never prompt"
  concerns modals, not this flag.

  **The Forward-mode question, answered rather than waved past.** Rule 1 makes
  coding agents the primary consumer, and rule 7 says a command whose failures
  the caller cannot see is "a reason to move a command to Control, not an
  exemption it keeps." `--prompt` adds four refusal paths; left as runtime-only
  Output lines, an agent could not distinguish "started with my prompt" from
  "did nothing." That would be the exact defect the ADR names.

  The resolution is not a return channel — it is noticing that three of the
  four refusals are **not runtime failures at all**. `no-agent` and
  `agent-takes-none` are properties of the _profile_, fixed the moment it is
  saved. `unsupported-shell` is a property of the _user's shell_, fixed for the
  machine. Only `too-large` is a property of the invocation, and it is the
  caller's own doing and trivially corrected. So the static three move to where
  they are actionable (R10, the Profiles tab), and the CLI keeps only a failure
  its caller can see coming. Forward mode is then honest about what it is
  reporting rather than concealing configuration errors behind silence.

  The staged story stays coherent as later phases land: phase 9's
  `silo agent list --json` exposes the same fact to machines, and the Control
  API (RFC 0034) eventually supplies real exit codes. Each phase reports as
  much as its execution mode honestly can.

- **ADR 0022 (storage layout)** — nothing new on disk.
- **RFC 0028 (terminal identity in the environment)** — `SILO_*` is host-owned.
  The prompt rides the launch line and never enters the session environment.
- **AGENTS.md** — host logging goes to the Output panel via `createHostChannel`,
  never `console.*`. No raw `@tauri-apps/*` in extension packages; the new host
  command is called from host code.

## Risks

**The "typed twice" issue does not reach the prompt path — traced, not
assumed.** The collapsed proposal records the launch line as occasionally being
typed twice, which with a prompt attached would mean an agent started twice on
the same task. Reading the code, a double _drain_ is structurally impossible
and this phase does not inherit the problem:

- `TerminalPanel.tsx:900` guards the drain behind `if (needsCreate)`, and
  `needsCreate` is false once `tRec.sessionId` is assigned — so a re-run that
  attaches to the existing session never drains.
- `takePendingLaunch` is remove-on-read, so whichever of the two drain paths
  (panel, `ensureSession`) arrives second gets `null`.
- At the `cancelled` bail (`TerminalPanel.tsx:617`) the effect returns _before_
  both the `sessionId` assignment and the drain, so an abandoned run types
  nothing at all.

What is real at that bail is a **leaked PTY**: it returns without
`session.kill()`. `ensureSession` handles the identical race correctly
(`terminal-service.ts:260` reaps its orphan before returning).

**Decision: fix it in this phase** (see "The orphaned-session fix" below). It is
adjacent rather than required — a leaked session is never drained into, so
prompt delivery works either way — but it is four lines beside code this phase
already touches, and leaving a known leak next to a new launch path invites
misattributing the next terminal oddity to prompt delivery.

**The proposal's "typed twice" note is stale and gets corrected here.** It
describes phase 1's _predecessor_: the old `kind`-based shim was a bare
`setTimeout(() => session.write(cmd), 150)` with no dedupe, which double-types
on any re-run. Phase 1 deleted it and replaced it with the remove-on-read
registry. Phase 3 rewrites that paragraph in the collapsed proposal to describe
the double-**spawn** that actually survives, so a future reader stops chasing a
symptom the code no longer has.

**Two recon entries are still `--help`-only.** `pi` and `copilot` are read from
their help text rather than an empirical run (see the findings table). Both
default to `undefined` — refuse — if the run is ambiguous, so the failure mode
is a prompt that is declined with a clear message, never one delivered wrongly.
