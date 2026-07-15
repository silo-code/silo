# Build extensions with Claude Code

The `silo-extension-builder` Claude Code skill turns a plain-English description
into a working Silo extension — it scaffolds the project, writes the source,
compiles it, and installs it into Silo in one session.

## Install the skill

Copy the skill file to Claude Code's global skills directory so it's available
in any project:

```bash
mkdir -p ~/.claude/skills/silo-extension-builder && \
  curl -fsSL -o ~/.claude/skills/silo-extension-builder/SKILL.md \
  https://raw.githubusercontent.com/silo-code/silo/main/skills/silo-extension-builder/SKILL.md
```

## Use the skill

Start a Claude Code session in any directory, then type:

```
/silo-extension-builder Create a status bar item that shows the current git branch.
```

The skill will ask for an extension id and output path if you don't provide them,
scaffold the project with `create-silo-extension`, write the implementation, compile
it, and offer to install it via `silo install`.

You can also pass `id` and `path` upfront to skip the prompts:

```
/silo-extension-builder id=dave.clock path=~/my-extensions/dave.clock

Create a status bar item that shows the current time, updated every second.
```

## What gets created

After scaffolding, the extension directory contains:

```
<path>/
  src/index.tsx      ← your extension source (edit this)
  package.json       ← manifest with silo.id, silo.main, npm scripts
  dist/index.js      ← compiled bundle (after first build)
```

The `package.json` includes build scripts:

```bash
npm run build   # one-shot compile
npm run dev     # watch mode — recompiles on every save
```

## Install and uninstall

```bash
silo install <path>        # install from a local folder
silo uninstall <id>        # remove by extension id
```

Installed extensions appear in **Settings → Extensions** where you can also
disable or uninstall them from the UI.

## Publish your extension

When the extension is ready to share, publish it to the Silo registry so it
appears on Browse and
[extensions.getsilo.dev](https://extensions.getsilo.dev) — see
[Sharing extensions](/guide/sharing-extensions#publish-to-the-silo-registry).
Folder / URL / npm sideloads still work for private shares.

See [Publishing an extension](/guide/publishing-an-extension) for the package
contract.
