# Terminal environment <Badge type="tip" text="stable" />

Every terminal Silo opens is told who it is. A small set of environment
variables, all namespaced `SILO*`, says that this is a Silo terminal, which tab
it is, which workspace it belongs to, and where Silo's own `silo` command lives.

Anything running inside can read them — a coding agent's hook, a shell script,
the `silo` CLI:

```sh
echo "$SILO_TERMINAL_ID"     # term_3bdbda1b-234e-4e9a-aae3-b3fd9c91e65c
echo "$SILO_WORKSPACE_PATH"  # /Users/you/code/my-project
```

This is a **contract for programs**, not a CSS or TypeScript surface. The
matching TypeScript is [`ProcessSpawnOptions.env`](/api/types/interfaces/ProcessSpawnOptions),
which lets an extension add its _own_ variables to a session.

## The variables

| Variable              | Value                                            |
| --------------------- | ------------------------------------------------ |
| `SILO`                | Always `1`. Present only inside Silo terminals.  |
| `SILO_TERMINAL_ID`    | The id of the **tab** this session belongs to.   |
| `SILO_WORKSPACE_ID`   | The id of the workspace that owns the tab.       |
| `SILO_WORKSPACE_PATH` | That workspace's folder, absolute.               |
| `SILO_BIN`            | Directory holding Silo's bundled `silo` command. |

Test for a Silo terminal with `SILO`, and for a specific tab with
`SILO_TERMINAL_ID`:

```sh
[ -n "$SILO" ] || exit 0   # not a Silo terminal — do nothing
```

### `SILO_TERMINAL_ID` is the tab, not the session

A tab keeps its id for its whole life. If the underlying shell dies and Silo
starts a new one in the same tab, the id is unchanged — so it's the right thing
to correlate against. It is not the same as the session id used internally.

### Set once, never updated

**These are stamped when the terminal is created and never revisited.** A Silo
session outlives the app: quit Silo, reopen it, and the terminal reattaches to
the shell that was already running — it is not re-created, so its environment is
not rebuilt either.

That's why only permanent facts live here. Which tab this is, and which project
it belongs to, are true for as long as the terminal exists. What's _running_ in
the terminal is not — you might quit your agent and start a different one a
minute later — so that kind of information is passed on the command line when
the thing is launched, never through this contract.

Read a variable from this page and you can trust it. If we put changeable facts
here, you couldn't.

::: warning Terminals opened before you updated
A terminal that was already open when you updated Silo won't have these
variables until you close and reopen it — its shell was created by the older
build. New terminals have them immediately.
:::

## `SILO_BIN` and `PATH`

Silo keeps a `silo` shim in its own directory and puts that directory on `PATH`
inside its terminals, so the command works with nothing to install. (The File
menu's **Install `silo` Command in PATH** is for terminals _outside_ Silo.)

**Prefer `SILO_BIN` when it matters which `silo` you get.** Silo puts its
directory at the front of `PATH`, but a login shell then rebuilds `PATH` from
your system paths and your own profile — so by the time your shell prompt
appears, other entries may sit ahead of it. If you already have a different
`silo` on your `PATH`, that one may win.

```sh
"$SILO_BIN/silo" .   # unambiguous
silo .               # convenient; subject to PATH order
```

## `SILO*` is reserved

The whole namespace belongs to Silo. An extension that passes `SILO`-prefixed
variables to
[`ctx.process.spawn`](/api/process/) or
[`ctx.process.exec`](/api/process/) will find them **dropped**, with a
note in the **Extension Host** output channel:

```ts
// Both ignored — Silo sets these itself.
await ctx.process.spawn({ cwd, env: { SILO_TERMINAL_ID: "t_other" } });

// Fine — your own variables are passed through.
await ctx.process.spawn({ cwd, env: { NO_COLOR: "1" } });
```

This isn't bookkeeping. Agent hooks decide whether to run at all based on
`SILO_TERMINAL_ID`, and a value any caller could set would make that check
worthless. Only Silo can vouch for which tab a session is.

The match ignores case — `silo_terminal_id` and `Silo_Workspace_Id` are dropped
just like the uppercase spellings, because Windows looks environment variables
up without regard to case and would otherwise read a lowercase one back as if
Silo had set it. Names that merely _start_ with the same letters (`SILOH`,
`SILOS`) are not in the namespace and pass through untouched.

## Sessions extensions start themselves

An extension can start its own long-lived session with
[`ctx.process.spawn`](/api/process/).
Those sessions get `SILO`, `SILO_WORKSPACE_ID`, `SILO_WORKSPACE_PATH`, and
`SILO_BIN` — they really are Silo sessions — but **no `SILO_TERMINAL_ID`**,
because they aren't terminal tabs. Only Silo's own terminals get one.

## Also present, but not part of this contract

You may notice other `SILO_*` variables in a Silo terminal — `SILO_PTY_NS`,
`SILO_DATA_DIR`, `SILO_CONFIG_ROOT`. Those are Silo's internal plumbing, visible
by accident rather than by design. They are **not supported**: don't build
against them, as they may change or disappear without notice. The table at the
top of this page is the whole supported surface.
