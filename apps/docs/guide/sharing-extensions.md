# Sharing extensions

Once you've built an extension you want others to use, pick the path that
matches your audience. For anything meant for the wider Silo community, publish
to the **extension registry** — that's what Browse and
[extensions.getsilo.dev](https://extensions.getsilo.dev) read. Folder, Git,
tarball, and npm remain useful sideloads for private or one-off shares.

## Publish to the Silo registry

Publishing is release-driven: register once, then every GitHub Release you cut
is ingested automatically. No registry accounts or tokens — your id is
`<github-owner>.<name>`, bound to the repo you control.

1. **Set up releases (once per repo).** New extension?
   `npx create-silo-extension` scaffolds the
   [publish-extension-action](https://github.com/silo-code/publish-extension-action)
   workflow. Existing extension: add that action, then publish with
   `npm version patch && git push --follow-tags`.
2. **Register (once per extension).** Use the form at
   [extensions.getsilo.dev/publish](https://extensions.getsilo.dev/publish) —
   it opens a pre-filled PR against `silo-code/extensions-registry`. A bot
   validates and merges.
3. **Done.** After ingest, the listing appears at
   `extensions.getsilo.dev/<id>` and in **Settings → Extensions → Browse**.
   Users install with one click or `silo install <id>`. Later releases update
   the listing; installed users see an Update badge.

See [Publishing an extension](/guide/publishing-an-extension) for the package
shape and [Permissions & access](/guide/permissions) for what you declare in
`silo.permissions`.

**When to use this:** public extensions for the Silo community.

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
machine. To put the same package on Browse for everyone else, [publish to the
registry](#publish-to-the-silo-registry) as well.

## Share a packed tarball

`npm pack` produces a self-contained `.tgz` from your built extension. Anyone
with Silo can install it directly — no Node, no build step:

```sh
npm run build
npm pack                      # → silo-my-clock-0.1.0.tgz
```

Options for distributing the `.tgz`:

- **Attach to a GitHub release** — required for registry publishing, and also
  usable as a direct install URL (asset download link).
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

Publishing makes your extension installable by package name from anywhere
(sideload path — separate from the Silo registry):

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

**When to use this:** npm distribution alongside (or instead of) the Silo
registry. npm alone does not list the extension on Browse or
[extensions.getsilo.dev](https://extensions.getsilo.dev).

## Comparison

| Method            | On Browse / catalog | Requires Node/npm | Pinned version     | Public URL |
| ----------------- | ------------------- | ----------------- | ------------------ | ---------- |
| Silo registry     | Yes                 | No (to install)   | Yes (per release)  | Yes        |
| Local folder      | No                  | To build          | —                  | No         |
| Git clone + build | No                  | Yes               | No (tracks branch) | No         |
| Packed tarball    | No                  | No                | Yes                | Optional   |
| npm publish       | No                  | No                | Yes                | Yes        |
