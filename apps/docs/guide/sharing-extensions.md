# Sharing extensions

Once you've built an extension you want others to use, there are several ways to
share it — from a quick one-liner for a colleague to a fully published npm
package. Pick the approach that matches your audience.

## Install from a local folder

The simplest share: hand someone the folder (zip, AirDrop, USB) and have them
run one command:

```sh
silo install /path/to/my-extension
```

Or they can open **Settings → Extensions → Install from folder…** and pick the
folder. Best for local teammates or quick one-off installs.

## Share via a Git repository

For extensions you maintain over time, a Git repo is the natural home. The
recipient clones it and builds locally:

```sh
git clone https://github.com/you/my-extension
cd my-extension
npm install && npm run build
silo install .
```

This works for a single-extension repo or a **collection repo** where each
extension lives in its own subfolder:

```
my-extensions/
  clock/
    package.json
    src/index.tsx
  weather/
    package.json
    src/index.tsx
```

```sh
git clone https://github.com/you/my-extensions
cd my-extensions/clock && npm install && npm run build && silo install .
```

**When to use this:** pro users who want to inspect the source, make local
tweaks, or stay on the latest commit. Requires Node/npm on the recipient's
machine.

## Share a packed tarball

`npm pack` produces a self-contained `.tgz` from your built extension. Anyone
with Silo can install it directly — no Node, no build step:

```sh
npm run build
npm pack                      # → silo-my-clock-0.1.0.tgz
```

Options for distributing the `.tgz`:

- **Attach to a GitHub release** — upload the `.tgz` as a release asset; the
  install URL is the asset's download link.
- **Commit to a repo** — for a collection repo, commit each `.tgz` alongside
  its source; the raw GitHub URL becomes the install link.
- **Send the file directly** — paste the path or URL into
  **Settings → Extensions** and click **Install**.

```
https://github.com/you/my-extensions/raw/main/clock/silo-my-clock-0.1.0.tgz
```

**When to use this:** sharing with less technical users, or when you want to
pin a specific built version without requiring the recipient to build anything.

The `create-silo-extension` scaffold includes a `pack` script that builds and
packs in one step:

```sh
npm run pack                  # build + npm pack → silo-my-ext-0.1.0.tgz
```

## Publish to npm

Publishing makes your extension installable by package name from anywhere:

```sh
npm publish --access public
```

Users install by typing the package name into
**Settings → Extensions → npm package name or tarball URL…**:

```
silo-my-clock
```

Or they can use the npm tarball URL directly:

```
https://registry.npmjs.org/silo-my-clock/-/silo-my-clock-0.1.0.tgz
```

See [Publishing an extension](/guide/publishing-an-extension) for the full
package shape, manifest requirements, and recommended CI setup.

**When to use this:** public extensions meant for the wider Silo community.

## Comparison

| Method            | Requires Node/npm | Pinned version     | Public URL |
| ----------------- | ----------------- | ------------------ | ---------- |
| Local folder      | To build          | —                  | No         |
| Git clone + build | Yes               | No (tracks branch) | No         |
| Packed tarball    | No                | Yes                | Optional   |
| npm publish       | No                | Yes                | Yes        |
