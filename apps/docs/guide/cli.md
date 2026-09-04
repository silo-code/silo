# The `silo` command

Open Silo from the terminal. `silo <path>` brings the running app to the
foreground (launching it first if it isn't running) and then opens what you
pointed it at — mirroring VS Code's `code` command.

## What it does

```sh
silo .                 # open/activate a workspace for the current directory
silo ~/code/my-project # open/activate a workspace for that directory
silo ./README.md       # open a file in the active workspace
silo                   # just bring Silo to the foreground
```

- **A directory** — if a workspace already exists for that folder, Silo
  activates it; otherwise it creates a new workspace rooted there and activates
  it. Relative paths (`.`, `./sub`) resolve against your shell's working
  directory.
- **A file** — Silo opens the file in the **active** workspace. If no workspace
  is active, it first creates one rooted at the file's parent folder.
- **No argument** — Silo is simply brought to the foreground (or launched).

A second `silo` invocation never opens a new window: it's forwarded to the
already-running instance, which focuses and handles the path. Silo Dev and a
release install are independent instances, each with its own command target.

## Getting help

```sh
silo --help      # the commands, with the options for each
silo --version   # which build this shim points at
```

Both are answered by the `silo` binary itself and print in your terminal — they
don't focus the app or launch it. That makes `silo --version` the quickest way to
tell which install a shim is wired to when you have both a release build and a
dev build on the same machine.

## Commands that answer back

Most `silo` commands hand their work to the running app and are done. Three
commands instead **ask** the running app and print what it says:

```sh
silo status        # is Silo running, and is it serving commands?
silo ws list       # what workspaces exist
silo agent run     # launch an agent, and tell me which terminal it made
```

These print a result on stdout and exit with a code you can branch on, which is
what makes them usable from a script or a coding agent.

### `--json`

Every one of them takes `--json`, which prints **exactly one line** of JSON and
nothing else — no warnings, no progress, no log lines — so a single read parses
cleanly:

```sh
silo status --json
```

```json
{
  "v": 1,
  "ok": true,
  "data": {
    "version": "0.63.0",
    "identity": "com.silo.desktop",
    "pid": 4321,
    "uptimeMs": 91234,
    "webview": "ready"
  },
  "silo": { "version": "0.63.0", "identity": "com.silo.desktop" }
}
```

A failure has the same envelope with `ok: false` and an `error` instead of
`data`:

```json
{
  "v": 1,
  "ok": false,
  "error": {
    "code": "not-found",
    "message": "No agent profile with id \"ghost\"."
  },
  "silo": { "version": "0.63.0", "identity": "com.silo.desktop" }
}
```

`v` versions the envelope as a whole and only changes if that shape breaks. The
contents of `data` are documented per command and grow by adding fields.

Without `--json` you get readable text. A failure then prints its message on
**stderr** and leaves stdout empty, so `ws=$(silo ws list)` captures nothing
rather than capturing an error message.

### Exit codes

| Code | Name           | Meaning                                                      |
| ---- | -------------- | ------------------------------------------------------------ |
| 0    | —              | The command ran and answered.                                |
| 2    | `invalid-args` | A usage error — a missing or malformed option.               |
| 3    | `not-running`  | Silo isn't running. See `--launch` below.                    |
| 4    | `not-found`    | A named workspace, profile, or terminal doesn't exist.       |
| 5    | `denied`       | Not a command this build accepts.                            |
| 6    | `timeout`      | Silo didn't answer, or didn't finish starting, in time.      |
| 7    | `failed`       | The command ran and couldn't finish — your setup, not a bug. |
| 70   | `internal`     | Silo malfunctioned.                                          |

Exit code **1 is deliberately unused**, so a crash stays distinguishable from
every one of these.

`failed` and `internal` are kept apart on purpose: "your profile has no command
to run" and "Silo is broken" call for different reactions, and a script that
retries on one should not retry on the other.

### `--launch`

`silo status` and `silo agent run` **do not start Silo**. If nothing is running
they exit `3` and say so. Pass `--launch` to start it and wait until it is
actually ready to serve the command:

```sh
silo agent run --profile claude-work --launch
```

`--launch` waits for readiness rather than for the app's window, so the command
is never delivered to an instance that can't yet answer it — and if Silo is
already starting, it waits for that one instead of opening a second copy. If it
takes too long you get `timeout` (6), not `not-running` (3).

`silo ws list` takes no `--launch`: it reads from disk and already works with
Silo closed.

## Listing workspaces

```sh
silo ws list           # a table of your workspaces
silo ws list --json    # the same, as one line of JSON
```

`silo ws list` reads your workspace files directly, so it works **whether or not
Silo is running** — useful for a script that wants a workspace id before
deciding whether to start anything. Each row carries the workspace's id, its
name, and its primary folder.

When Silo _is_ running, each row is additionally annotated with live state —
`active` for the workspace on screen, `open` for the rest, `closed` for ones you
have soft-closed:

```
ws_a1b2c3  Silo   active  /Users/me/code/silo
ws_d4e5f6  Docs   open    /Users/me/code/docs
ws_g7h8i9  Old    closed  /Users/me/code/old
```

With nothing running, that column is omitted entirely rather than shown blank —
a blank would read as "none of these are open" instead of "there was nothing to
ask". In `--json`, a top-level `live` field says which case you got.

The ids are in the exact form `--ws` accepts, so a follow-up command is
unambiguous:

```sh
silo agent run --ws "$(silo ws list --json | jq -r '.data.workspaces[0].id')"
```

`ws` is a reserved word: `silo ws` on its own, or with any verb other than
`list`, prints usage rather than opening a folder. A directory actually named
`ws` still opens as `./ws` or `silo -- ws`.

## Installing the command

The binary ships inside the app bundle but isn't on your `PATH` by default. The
easiest way to add it:

**From inside Silo** — run **File → Install `silo` Command in PATH**. This writes
a small shim to `~/.local/bin/silo` pointing at the app binary. If
`~/.local/bin` isn't already on your `PATH`, the notification tells you to add
it:

```sh
export PATH="$HOME/.local/bin:$PATH"   # add to ~/.zshrc or ~/.bashrc
```

**Manually** — point a shim or symlink at the app binary directly:

```sh
ln -sf "/Applications/Silo.app/Contents/MacOS/silo" /usr/local/bin/silo
```

For a dev build, the binary lives under the **Silo Dev** app
(`Silo Dev.app/Contents/MacOS/silo`); symlink that instead to drive the dev
instance. Because the command works by launching the real binary (which is then
forwarded to the running instance), pointing `open -a Silo` at the app won't
pass the path — use the binary path or the installed shim.

## Launching an agent

```sh
silo agent run --profile claude-work   # launch that Agent Profile
silo agent run                         # launch the default profile
silo agent run --ws ~/code/app         # launch in a specific workspace
```

`silo agent run` starts an [agent profile](/guide/agent-sessions#starting-an-agent) —
the same named launch recipes that appear in the `+` menu and on **Settings →
Agents → Profiles**. `--profile` takes the profile's **id** (the short value
shown in the editor, e.g. `claude-work`); with no `--profile` it uses the
profile marked **default**, or the first one in the list if none is marked.

The agent opens in **the workspace your shell is in**: Silo picks the workspace
whose folder contains your current directory (the innermost one, if several
nest, and it reopens that workspace if you had closed it). The terminal starts
in your current directory rather than at the workspace root — so an agent
started from a subdirectory stays there. That workspace is activated and the new
terminal focused.

On success it tells you what it made, and exits 0:

```sh
$ silo agent run --profile claude-work
Started term_a1b2c3 in Silo
```

```sh
$ silo agent run --profile claude-work --json
{"v":1,"ok":true,"data":{"terminalId":"term_a1b2c3","workspaceId":"ws_a1b2c3","workspaceName":"Silo","profileId":"claude-work"},"silo":{…}}
```

That terminal id is a real handle — it's the same id the rest of Silo uses for
that terminal. One thing the command deliberately doesn't report is whether the
agent's own command started: the launch line is typed into a shell a moment
later, so a `command not found` shows up in the terminal, not in this answer.

If your current directory isn't inside any workspace, nothing is launched —
`silo agent run` never creates a workspace for you, and it exits `not-found`
(4). Open one first with `silo <dir>`, or name one explicitly:

```sh
silo agent run --ws .                  # the workspace rooted here
silo agent run --ws ~/code/app         # by folder — its root, or an extra folder
silo agent run --ws ws_a1b2c3          # by workspace id
```

`--ws` names a workspace **root** exactly (a folder it was opened with), not any
path inside it. When nothing matches, the command exits `not-found` (4) rather
than falling back to a guess.

When you target a workspace you're **not** standing in, the agent starts at that
workspace's folder — your current directory has nothing to do with it. If you
are already somewhere inside the target, your current directory wins, so
`cd packages/sdk && silo agent run` still starts the agent in `packages/sdk`.

### If Silo isn't running

`silo agent run` **no longer launches Silo**. With nothing running it exits
`not-running` (3) and tells you so. Pass `--launch` to start Silo and wait for
it:

```sh
silo agent run --profile claude-work --launch
```

This is a change from earlier releases, where the command would quietly start
the app and run the agent once it came up. A command that behaves differently
depending on whether the app happens to be open is one you can't script against,
so the launch is now something you ask for. `silo <path>`, `silo install`, and
`silo uninstall` are unchanged and still start Silo when it isn't running.

`agent` is a reserved word: `silo agent` on its own, or with any verb other than
`run`, prints usage rather than opening a folder. A directory actually named
`agent` still opens as `./agent` or `silo -- agent`. Listing profiles from the
shell (`silo agent list`) is not available yet.

## Extension commands

```sh
silo install silo.local-web-viewer   # install from the Silo registry by id
silo install /path/to/my-extension   # install from a local folder
silo install <url-or-npm>            # install from a tarball URL or npm name
silo uninstall acme.clock            # uninstall an extension by id
```

`silo install` picks the source from the argument:

- A registry id (`publisher.name`, and no such path on disk) installs from
  [registry.getsilo.dev](https://registry.getsilo.dev) — same catalog as
  **Settings → Extensions → Browse**.
- A filesystem path is the CLI equivalent of **Install from folder…**: Silo
  copies the package into `~/.config/silo/extensions/<id>/` and loads it
  immediately. Relative paths resolve against your shell's working directory.
- A URL or npm package name downloads that tarball (sideload).

`silo uninstall <id>` removes the extension's copied files from disk and
unloads it from the running app. The `id` is the `silo.id` value from the
extension's `package.json`.

Both commands follow the same warm/cold model as `silo <path>`: if Silo is
already running the command is forwarded to the live instance; if not, it is
applied on the next launch.

See [Extensions](/guide/extensions) for Browse, updates, and the public catalog
at [extensions.getsilo.dev](https://extensions.getsilo.dev).
