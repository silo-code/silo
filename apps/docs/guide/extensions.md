# Extensions

Silo's features are built as extensions — self-contained packages that add
panels, editors, commands, themes, workspace badges, and more. You can disable
any built-in extension or install new ones without restarting the app.

## Managing extensions

Open **Settings → Extensions** (or press <kbd>⌘,</kbd> and choose Extensions)
to see every loaded extension with its id, version, and enable/disable toggle.

```sh
silo install <path>   # install from a local folder
silo install <url>    # install from a URL or npm tarball
silo uninstall <id>   # remove by id
```

Extensions are stored in `~/.config/silo/extensions/` and reload automatically
on the next launch. Use **Disable / Enable** in Settings to unload or reload one
without restarting.

## Built-in extensions

Silo ships with a set of first-party extensions that cover the core workflow.
They are listed in **Settings → Extensions** under the Silo publisher. Each can
be disabled individually; none can be uninstalled (they ship inside the app, so
there's nothing on disk to remove).

| Extension        | What it adds                                                                           |
| ---------------- | -------------------------------------------------------------------------------------- |
| Workspaces       | Workspaces side panel                                                                  |
| Terminal         | Terminal tabs in the center dock                                                       |
| File Explorer    | Files side panel with a file tree                                                      |
| File Search      | Search side panel for cross-file content search                                        |
| Git              | Git side panel — staged/unstaged changes, commit, branch switcher                      |
| Markdown Preview | Read-only editor for `.md` files with rendered output                                  |
| Image Viewer     | Read-only viewer for common image formats                                              |
| Themes           | Themes side panel and the bundled presets (Tokyo Night, Solarized Light, Gruvbox Dark) |

## The silo-extensions repository

[`silo-code/silo-extensions`](https://github.com/silo-code/silo-extensions)
is the community extension catalog — a curated collection of extensions built
against the public SDK.

Browse the repo for an extension you want, then install it in one step:

```sh
# clone the repo and install from a folder
git clone https://github.com/silo-code/silo-extensions
cd silo-extensions/local-web-viewer
npm install && npm run build
silo install .
```

Or install a packed release directly by URL without cloning:

```sh
silo install https://github.com/silo-code/silo-extensions/releases/download/...
```

Check each extension's `README.md` for its specific install command and any
[permissions](/guide/permissions) it declares.

## Installing from npm

Extensions published to npm install by package name from Settings:

1. Open **Settings → Extensions → Install from npm or URL…**
2. Type the npm package name (e.g. `silo-my-extension`) and press Enter.

Or use the CLI:

```sh
silo install silo-my-extension
```

## Building your own

Every built-in feature is an extension — you can build one with the same tools.
The **[Building Extensions](/guide/what-is-an-extension)** section of these
guides covers everything from the mental model to publishing:

- **[What is an extension?](/guide/what-is-an-extension)** — the `activate(ctx)` model
- **[Your first extension](/guide/getting-started)** — step-by-step tutorial
- **[Build with Claude Code](/guide/claude-skill)** — describe what you want; get a working extension

## See also

- [Side panels](/guide/panels) — the panel UI extensions can contribute to
- [Permissions & access](/guide/permissions) — what to watch for when installing third-party extensions
- [Publishing an extension](/guide/publishing-an-extension) — the packaging reference
