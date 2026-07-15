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
