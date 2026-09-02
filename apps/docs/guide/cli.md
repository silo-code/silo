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
in your current directory, not the workspace root. That workspace is activated
and the new terminal focused.

If your current directory isn't inside any workspace, nothing is launched —
`silo agent run` never creates a workspace for you. Open one first with
`silo <dir>`, or name one explicitly:

```sh
silo agent run --ws .                  # the workspace rooted here
silo agent run --ws ~/code/app         # by folder — its root, or an extra folder
silo agent run --ws ws_a1b2c3          # by workspace id
```

`--ws` names a workspace **root** exactly (a folder it was opened with), not any
path inside it. When nothing matches, the run is reported and abandoned rather
than falling back to a guess.

When you target a workspace you're **not** standing in, the agent starts at that
workspace's folder — your current directory has nothing to do with it. If you
are already somewhere inside the target, your current directory wins, so
`cd packages/sdk && silo agent run` still starts the agent in `packages/sdk`.

Because there's no way yet for the command to print back to your shell, a
message you'd otherwise see on stderr — an unknown profile, a directory in no
workspace, an unmatched `--ws` — lands in Silo's **Output** panel under
**Application**.

`agent` is a reserved word: `silo agent` on its own, or with any verb other than
`run`, prints usage there rather than opening a folder. A directory actually
named `agent` still opens as `./agent` or `silo -- agent`. Listing profiles from
the shell (`silo agent list`) is not available yet.

Like `silo <path>`, this is warm/cold: forwarded to the running instance, or
applied on the next launch.

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
