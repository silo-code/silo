# Extensions

Silo's features are built as extensions — self-contained packages that add
panels, editors, commands, themes, workspace badges, and more. You can disable
any built-in extension or install new ones without restarting the app.

## Find and install

The primary way to discover extensions is the **registry**:

1. In Silo, open **Settings → Extensions**. The **Browse** tab is the default
   view — search, filter by category, and install with one click (you'll get a
   permissions consent prompt when an extension declares any).
2. Or browse the public catalog at
   [extensions.getsilo.dev](https://extensions.getsilo.dev), then install from
   Settings → Extensions (or the CLI below).

```sh
silo install silo.local-web-viewer   # install by registry id
silo uninstall silo.local-web-viewer
```

The catalog is backed by a static index at
[registry.getsilo.dev](https://registry.getsilo.dev) — the same data the app
polls for Browse and updates.

## Managing extensions <a id="updates"></a>

Open **Settings → Extensions** (or press <kbd>⌘,</kbd> and choose Extensions)
for two tabs:

- **Browse** — the registry catalog
- **Installed** — everything currently on disk, with enable/disable, detail,
  and uninstall

When a newer version is on the registry, Silo shows an update badge (also on
the settings gear and in the app menu). From Installed you can **Update** one
extension or **Update all**. If the new version declares different
[permissions](/guide/permissions), you'll re-consent before it applies.

```sh
silo install <path>          # sideload from a local folder
silo install <url-or-npm>    # sideload from a tarball URL or npm name
silo uninstall <id>          # remove by id
```

Extensions are stored in `~/.config/silo/extensions/` and reload automatically
on the next launch. Use **Disable / Enable** in Settings to unload or reload one
without restarting.

## Sideloading (folder, URL, npm)

Folder, tarball URL, and npm installs remain supported forever as secondary
paths — useful for private packages, work-in-progress builds, or extensions
that aren't on the registry yet.

| Path         | How                                                                                                       |
| ------------ | --------------------------------------------------------------------------------------------------------- |
| Local folder | **Settings → Extensions → Install from folder…**, or `silo install /path/to/ext`                          |
| Tarball URL  | Paste a GitHub Release (or other) `.tgz` URL into Install from npm or URL…, or `silo install <url>`       |
| npm package  | Type the package name (e.g. `silo-my-extension`) into the same field, or `silo install silo-my-extension` |

See [Sharing extensions](/guide/sharing-extensions) for packing and distributing
outside the registry.

## Built-in extensions

Silo ships with a set of first-party extensions that cover the core workflow.
They are listed in **Settings → Extensions** under the Silo publisher (flip
**Show built-in extensions** if they're hidden). Each can be disabled
individually; none can be uninstalled (they ship inside the app, so there's
nothing on disk to remove).

| Extension        | What it adds                                                                           |
| ---------------- | -------------------------------------------------------------------------------------- |
| Navigator        | Navigator side panel — the container its views render in                               |
| Workspaces       | The Workspaces view in the Navigator, plus workspace commands and status               |
| Terminal         | Terminal tabs in the center dock                                                       |
| File Explorer    | Files side panel with a file tree                                                      |
| File Search      | Search side panel for cross-file content search                                        |
| Git              | Git side panel — staged/unstaged changes, commit, branch switcher                      |
| Markdown Preview | Read-only editor for `.md` files with rendered output                                  |
| Image Viewer     | Read-only viewer for common image formats                                              |
| Themes           | Themes side panel and the bundled presets (Tokyo Night, Solarized Light, Gruvbox Dark) |

## Official community extensions

[`silo-code/silo-extensions`](https://github.com/silo-code/silo-extensions) is
the GitHub repo behind several first-party-adjacent extensions (Documents Side
Panel, Local Web Viewer, System Monitor, and others). They publish through the
same registry as everyone else — install them from **Browse** or
[extensions.getsilo.dev](https://extensions.getsilo.dev), not by cloning the
repo (unless you're developing them).

## Building your own

Every built-in feature is an extension — you can build one with the same tools.
The **[Building Extensions](/guide/what-is-an-extension)** section of these
guides covers everything from the mental model to publishing:

- **[What is an extension?](/guide/what-is-an-extension)** — the `activate(ctx)` model
- **[Your first extension](/guide/your-first-extension)** — step-by-step tutorial
- **[Build with Claude Code](/guide/claude-skill)** — describe what you want; get a working extension
- **[Sharing extensions](/guide/sharing-extensions)** — publish to the registry (or sideload)

## See also

- [Side panels](/guide/panels) — the panel UI extensions can contribute to
- [Permissions & access](/guide/permissions) — what to watch for when installing third-party extensions
- [Publishing an extension](/guide/publishing-an-extension) — the packaging reference
- [extensions.getsilo.dev](https://extensions.getsilo.dev) — public catalog
