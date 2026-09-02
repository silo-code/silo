---
status: accepted
date: 2026-09-01
---

# 0047. CLI command grammar: an agent-first `silo` namespace

## Context

The `silo` command grew two verbs and no namespace. The parser is three ad-hoc
arms in `resolve_cli_request`: bare `silo` focuses, `install` / `uninstall` are
matched literally, and **everything else is a path**. So a directory named
`install` is unreachable except as `./install`, and every new top-level verb
steals another path. Two commands in, the namespace is already contended, and
nothing anywhere states what may be added or where it hangs — the CLI guide
describes behavior, it doesn't govern it.

Meanwhile the consumer is changing. The forms already in the world (`silo .`,
`silo install`) were designed for a human typing them, modelled on `code .`.
The traffic that matters going forward is **coding agents** driving Silo from a
terminal: open this file, open this folder as a workspace, launch an agent
profile in that workspace, switch to it. Agent Profiles (RFC 0033) already
commits `silo agent run --profile <id>` as its phase 2 and parks
`silo agent list` on a return channel it calls a "Control API" — a term that
appears exactly once in the repo and is defined nowhere.

Three facts constrain any answer:

- **Delivery is fire-and-forget.** `tauri-plugin-single-instance` forwards a
  second process's argv + cwd; warm, the app focuses and emits `cli:open` and
  the CLI exits 0; cold, the request is stashed in `PendingLaunchArg`. There is
  no stdout of the result and no exit code that reflects it — failures land in
  the webview's console. For a human that is a mild wart. For an agent it is
  disqualifying: it cannot distinguish success from silence, and cannot learn
  the id of a thing it just created.
- **Workspaces are already on disk, readable, cold** (ADR 0022 tier 1): one
  pretty-printed JSON file per workspace at `<config>/workspaces/<id>.json`,
  with global prefs — agent profiles included — in `<config>/app-state.json`,
  under an identity-keyed config root. Enumeration does not actually require a
  running app.
- **A loopback control channel is proven but dev-only** (ADR 0012):
  `127.0.0.1:7878`, header-gated, compiled out of release builds.

And path→workspace resolution is asymmetric, inherited from a single-window
editor. A directory exact-matches `folder` / `extraFolders` or creates a new
workspace; a file opens in whatever workspace the GUI last focused. So
`silo README.md` from `~/code/silo`, while the GUI shows `~/code/other`, opens
silo's README **in other** — and `cd packages/sdk && silo .` inside an open
workspace creates a _second_ workspace nested inside the first.

## Decision

Nine rules. The first one decides the other eight.

### 1. The primary consumer is coding agents; humans are second

Where machine legibility and human brevity conflict, the machine wins — and
human brevity is bought back explicitly, as named sugar over a canonical form,
never by leaving the canonical form unbuilt.

This is the load-bearing premise. Without it, rules 2, 5, and 7 read as
redundant ceremony and get reversed.

### 2. One canonical form: `silo <noun> <verb> [args]`

Every capability has exactly one canonical spelling. Host verbs match
`[a-z][a-z0-9-]*` and **never contain a dot**. Nothing hangs at the top level
except the closed shorthand set in rule 3.

### 3. `silo <path>` is sugar for `silo ws open <path>`

The shorthands are a closed, frozen set — bare `silo` (focus or launch),
`silo <path>`, `silo install`, `silo uninstall`. It never grows. `--help` shows
them as shorthands, with the canonical form as the answer to "what is this".

An agent should never have to reason about reserved nouns, `--` escapes, or
whether its path looks like a dotted extension id: it emits `silo ws open <p>`
and stops thinking. A human keeps `silo .`.

### 4. Reserved nouns, taken now in one break

| Noun    | Owns                                                              |
| ------- | ----------------------------------------------------------------- |
| `ext`   | Extension lifecycle, and every extension-contributed command      |
| `ws`    | Workspaces — open, create, close, list, rename, folder membership |
| `agent` | Agent Profiles — run, list                                        |
| `term`  | Terminals within a workspace                                      |
| `help`  | Same as `--help`; `silo help <noun>` is that noun's help          |

Reserving a noun is a small documented break: `silo <noun>` stops opening a
folder of that name. `./<noun>` and `silo -- <noun>` always still do.

The set is taken **in one break, now**, while the user base is small — not one
noun per shipped verb. Each addition is its own break, so N staggered breaks
cost more than one, and these five are already implied by shipped or accepted
work: `ext` and the aliases exist; `agent` is committed by RFC 0033 phase 2;
`ws` by close / list / rename, which have no path-form equivalent; `term` by
terminals being a core surface (ADR 0011) that an agent will want to open.
Genuinely unforeseen nouns are still added by amending this ADR.

### 5. Workspace targeting: implicit for the sugar, explicit-capable everywhere

A workspace is addressed **by folder path** — its primary `folder` or one of its
`extraFolders`. Display names collide (two clones both named `silo`), so they
are never an address. `ws_<uuid>` is not something a human should have to type,
but it is the _best_ handle a machine has — it survives a rename and a move —
so the CLI **accepts** it anywhere a workspace is named, and `--json` hands
ids back so a follow-up call is unambiguous.

`--ws <folder | . | ws_<uuid>>` is the one spelling, on every workspace-scoped
verb. It is deliberately **not** a global flag: half the CLI (`ext install`) is
app-global, and a global flag that some commands must ignore is a lie. Spelling
it once here is what stops `agent`, `term`, and a future `task` each inventing
their own.

Resolution order for any workspace-scoped command:

1. **`--ws`** — exact match on folder or id. No match is an **error**, never a
   silent create; an agent that typos must hear about it.
2. **Containment of the path argument**, when the command has one. Longest
   matching root wins. Ties, in order: an open workspace over a soft-closed
   one; the primary `folder` over an `extraFolders` entry; the active workspace.
3. **Cwd containment** — the argument is in no workspace, but the shell you
   typed in is. This is why `silo /tmp/trace.log` from a project terminal lands
   in that project.
4. **The active workspace** — nothing else matched, but the GUI has one.
5. **Create** — permitted only for `ws open` and its path sugar (rooted at the
   directory, or at a file's parent). Every other verb **errors** rather than
   inventing a workspace: `silo agent run` in an unrelated directory is a
   mistake, not a request for a new workspace.

Consequences of that order, spelled out because they change today's behavior:

- **A path inside a workspace resolves to that workspace — directories and
  files alike.** `cd packages/sdk && silo .` switches to the containing
  workspace instead of nesting a duplicate inside it. A directory argument only
  ever _chooses_ a workspace: it never opens an editor tab and never adds an
  `extraFolders` entry.
- **Soft-closed workspaces are candidates at every step**, and matching one
  reopens it (`activateWorkspace` clears `closedAt`). Open-vs-closed only breaks
  a tie between two equally-long containing roots.
- **Missing paths create nothing.** No `mkdir`, no workspace for a folder that
  isn't there.
- **Cwd has two different jobs and they are not the same job.** It resolves
  relative path arguments (every command, including `ext install ./my-ext`), and
  separately it is one _fallback_ rung of workspace inference. Cwd never
  silently becomes the target workspace for an app-global command.

### 6. Four execution modes

| Mode          | Who answers                                | Used for                                     |
| ------------- | ------------------------------------------ | -------------------------------------------- |
| **Local**     | The binary (stdout + exit code)            | `--help`, `--version`, `help`                |
| **Disk-read** | The binary, reading ADR 0022's config tier | Enumeration and config, cold, with no GUI    |
| **Forward**   | The GUI, fire-and-forget, exit 0           | Everything that ships today                  |
| **Control**   | The GUI, round-trip, stdout + real exit    | Anything whose value is its answer — unbuilt |

**Disk-read is the mode this ADR adds**, and it matters most for the agent case:
an agent in a terminal with no app running should not boot a desktop app to
enumerate workspaces. It reads the same files the app writes —
`<config>/workspaces/<id>.json` and `<config>/app-state.json` — never the
app-state or runtime tiers, which ADR 0022 marks as not for outside readers.
The line that keeps it honest: **config lives on disk, live state needs
Control.** Workspace and profile enumeration, yes. A terminal's status, whether
an agent is idle, what has focus — no; disk lags the running instance.

**Control is designed for, not deferred into vagueness.** Every mutating verb
gets a defined return payload in its own proposal _before_ it ships, even while
the channel can't yet deliver one. A command whose value is its answer is never
shipped as a Forward that pretends to have answered. The channel itself — its
transport, auth, and the `--json` envelope — is RFC 0034; this ADR reads the
same whether that has shipped or not.

### 7. The machine contract

Mandatory on every command as it is built:

- **`--json` on anything that answers**, in one envelope shared by all commands
  (shape defined by RFC 0034), never a per-command shape.
- **Never prompt.** An agent cannot answer a modal. An action that would prompt
  either fails with a clear error or takes an explicit `--yes`. Today's
  `silo install` already grants declared permissions without the modal on the
  grounds that an explicit CLI install implies consent; that reasoning
  generalizes to consent, not to silence.
- **Exit codes mean something** — 0 did it, non-zero didn't. Forward-mode
  commands structurally cannot honor this. That is a reason to move a command to
  Control, not an exemption it keeps.
- **Every verb is idempotent and re-runnable**, because agents retry.
  `ws open` is activate-or-create and therefore already safe. Where "make
  another one" is a real intent, creation is a separate verb (`ws create`), not
  a mode of the idempotent one.

### 8. Extension-contributed commands live at `silo ext <id> <cmd>`

If the token after `ext` matches an extension id — lowercase, contains a dot, no
path separators — it is an extension command; otherwise it is a host verb. **Ids
have a dot, host verbs don't**, the same shape as ADR 0017's "the name encodes
the contract".

Not `silo <publisher.name> <cmd>`: that predicate is true of `package.json` and
`tsconfig.json`, so it would steal every lowercase dotted filename from the path
form. Not `silo ext run <id> <cmd>`: `run` exists only to hold the id, which the
dot rule already does. An extension command named `install` is unambiguous
(`silo ext acme.clock install` has the id in position 2); a host verb named
`acme.clock` is forbidden by the no-dot rule.

The _name_ is decided here. The _implementation_ — manifest slice, activation on
invoke, permissions for an entry point with no window focused and no user in the
UI, whether `--help` can list an unloaded extension's commands — belongs to
RFC 0005 and RFC 0006.

### 9. Authoring stays out

`silo` is the user/runtime CLI: open things, install things, talk to the running
app. Author-facing commands (`build`, `dev`, `publish`) stay in
`create-silo-extension` and npm scripts per RFC 0007. They do not join this
binary and they do not hang under `ext`.

### Dispatch

In order:

1. **Local flags** — `--help` / `-h`, `--version` / `-V`. The binary answers, no
   GUI. (They used to focus the window instead; answered locally as of this
   ADR — the one piece of it that ships immediately, because it needs no
   channel and no parser change.)
2. **No positionals** — focus the running instance, or launch it. Does not
   change the active workspace.
3. **`--`** — everything after it is a path.
4. **Reserved noun** — dispatch into that noun's grammar.
5. **Frozen alias** — `install` / `uninstall` rewrite to `silo ext …`.
6. **Otherwise** — `silo ws open <path>`. One path, not several. Relative to the
   forwarding process's cwd.

The load-bearing cases, `*` marking a change from behavior before this ADR:

| Invocation                                                          | Outcome                                                               |
| ------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `silo` / `silo .` / `silo ~/code/app`                               | focus / open cwd / open that folder                                   |
| `silo .` from `~/code/app/packages/sdk`, inside the `app` workspace | \* activate `app`; no nested duplicate                                |
| `silo README.md` from a workspace, GUI focused elsewhere            | \* open in the workspace containing the file, and activate it         |
| `silo /tmp/trace.log` from a workspace folder                       | \* open there (cwd containment), not in whatever is active            |
| `silo ~/code/app/README.md` while `app` is soft-closed              | \* reopen `app` and open it there                                     |
| `silo package.json`                                                 | open the file — why ids are not top-level                             |
| `silo ./new-thing` (nothing on disk)                                | no-op; never `mkdir`, never a workspace                               |
| `silo install acme.clock` / `silo ext install acme.clock`           | alias / \* canonical — same action                                    |
| `silo ext` / `silo ./ext` / `silo -- ext`                           | \* `ext` help / open folder `ext` / open folder `ext`                 |
| `silo ext acme.clock start`                                         | \* extension command (unimplemented — an unknown command, not a path) |
| `silo acme.clock start`                                             | still a path                                                          |
| `silo agent run --profile x --ws ~/code/app`                        | \* run in `app`, explicit                                             |
| `silo agent run --profile x` from a project shell                   | \* run in the workspace containing cwd; error if there is none        |

## Consequences

- **Reserving five nouns is a break, once.** `silo ws`, `silo agent`,
  `silo term`, `silo help` stop opening folders of those names; `./<noun>` and
  `silo -- <noun>` still do. Taking them together is cheaper than five
  separately, and the escape hatches are permanent.
- **`silo install` and `silo uninstall` keep working forever** as frozen
  shorthands, so the README, the CLI guide, the first-extension guide, RFC 0014,
  and the extension-builder skill stay correct as written. New docs and `--help`
  teach `silo ext install`. The user-facing CLI guide is not rewritten until the
  parser follow-up actually ships the canonical forms — it documents behavior,
  not law.
- **Two behavior changes need a follow-up in the CLI open handler**, and they
  are features, not this decision: path→workspace containment (files _and_
  directories), and the noun table in the parser. The containment helper already
  exists host-side — `findWorkspaceContaining` / `folderContains` in
  `apps/desktop/src/cli/open-handler.ts`, added by Agent Profiles phase 2 for
  `silo agent run` — so the follow-up extends its tie-breaks (open over closed,
  primary over extra, then active) and calls it from the dir and file arms,
  rather than reaching for the extension-local `workspaceFolderForPath` in
  `packages/extensions-core/src/editor/`.
- **This ADR was written alongside its first real consumer**, Agent Profiles
  phase 2 (PR 483), which shipped `silo agent run` before the grammar existed
  and therefore diverges from it in two places: `agent` is a subcommand only
  when the next token is `run` (so `silo agent` still opens a folder of that
  name, with a test asserting it), and `silo agent run` in a directory inside no
  workspace **creates** one rather than failing. Rules 4 and 5 are the law; that
  code is the exception, and the conformance change is a handful of lines plus
  two tests. Recorded here so the divergence reads as sequencing rather than as
  the ADR being wrong on arrival.
- **Read commands are un-blocked years earlier than expected.** `ws list`,
  `agent list`, and extension enumeration are Disk-read against ADR 0022's
  config tier: no channel, no running app. RFC 0033's phase 9 no longer waits on
  the Control API for the _listing_ half — only for live state and for bare
  `silo agent run`'s picker.
- **Anything that must report success now has a named home instead of a shrug.**
  The cost is that a proposal wanting real exit codes depends on RFC 0034, and
  RFC 0034 has a genuine security problem to solve: a loopback control port in a
  _release_ build lets any local process drive the user's editor and spawn
  agents. ADR 0012's channel is dev-only precisely because that wasn't answered.
- **`--json`, no-prompt, and idempotency are now entry criteria**, not polish.
  This is a real tax on small commands, paid to keep the surface machine-usable
  without a compatibility break later.
- **Extension commands are name-ready and implementation-blocked.** Nobody can
  ship one until RFC 0005 and RFC 0006 land, and nobody has to guess the name.
- **The grammar stays amendable, not frozen.** A new verb under an existing noun
  is just a feature. A new noun, a new global flag, `--in <folder>`, `--new`,
  `--wait`, or an exception to the shorthand set is an amendment to this ADR
  with a dated line in Consequences.

## Alternatives considered

- **Keep the path form as the only way to open things** ("there is no
  `silo ws open`"). Rejected: it optimizes for the human muscle memory that
  already exists and taxes every machine caller with escapes and precedence.
  Sugar over a canonical verb costs one extra documented form and buys an
  unambiguous surface.
- **Keep `install` / `uninstall` bare as the canonical form.** Rejected: the
  collision is structural, not a one-off; leaving them bare means every future
  lifecycle verb steals another path. `silo ext install` is still short.
- **Drop the bare aliases entirely.** Rejected: the forms are in the world and
  documented, and `./install` is already the path escape, so keeping them is
  cheap.
- **`silo <publisher.name> <cmd>` for extension commands.** Rejected outright:
  it steals `package.json` and every other lowercase dotted filename.
- **`silo ext run <id> <cmd>`.** Deferred, not rejected: the dot rule makes the
  token unnecessary today. If a host verb ever needs an id in the same slot,
  `run` is added then.
- **Add nouns one at a time, the day the first verb under each is accepted.**
  Rejected for a young CLI: it converts one small break into a stream of them.
- **`--workspace` as a global flag.** Rejected: `git -C` works because nearly
  every git command is repo-scoped; half of `silo` is app-global, and a flag
  some commands must ignore is a trap. Per-verb `--ws`, spelled once, instead.
- **Address workspaces by display name.** Rejected: names collide. **Refuse
  `ws_<uuid>` as unspeakable** — rejected as an argument against making it
  _primary_, not against accepting it; it is the only stable machine handle.
- **Treat cwd as an implicit `--workspace` for every command.** Rejected: it
  would infect app-global commands like `ext install`, and it conflates path
  resolution with workspace inference.
- **Keep file-open-into-the-active-workspace, and directory-open as
  exact-match-or-create.** Rejected: the first makes Silo behave like a
  single-window editor from the terminal; the second silently accumulates
  near-duplicate workspaces. Wanting a workspace scoped to a subdirectory is
  real but rarer — it gets a `--new` amendment slot, not the default.
- **Leave round-trip as an unscoped "later RFC" and keep shipping Forward
  commands.** Rejected: it produces verbs shaped for silence that need a
  breaking change once they can speak.
- **Skip Disk-read and route every read through the Control API.** Rejected: it
  blocks every listing on the hardest unsolved piece, for state that is already
  a readable file on disk.
- **VS Code-style flags (`--install-extension`) so the positional namespace
  stays pure-path.** Rejected: it inverts the ergonomics, and flags are a worse
  home for a growing verb set than nouns.

## References

- ADR 0011 — editor and terminal are core surfaces (why `term` is a reserved
  noun).
- ADR 0012 — dev-only automation RPC: the proven loopback channel, and why it is
  compiled out of release.
- ADR 0017 — CSS theming contract; the "name encodes the contract" shape reused
  by the dot firewall.
- ADR 0022 — on-disk storage layout: the config tier that makes Disk-read
  possible, and the build-identity keying that keeps Silo Dev a separate command
  target.
- ADR 0028 — sealed agent detection (an agent-launched terminal becomes an agent
  by detection, not by assertion — including when the launch came from the CLI).
- RFC 0034 defines the Control API this ADR names as an execution mode. RFC 0033
  (Agent Profiles) owns `silo agent run` / `silo agent list`. RFC 0005 and
  RFC 0006 own extension-contributed commands and their permissions. RFC 0007
  keeps authoring commands out of this binary. RFC 0014 documents
  `silo install <id>` as the form the shorthand preserves. Plain-text provenance
  only — the decision's full meaning is here.
