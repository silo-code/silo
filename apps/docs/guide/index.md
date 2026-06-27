# Guides

Silo is a terminal-first workspace manager built for the multi-agent workflow.
It keeps multiple projects open at once — each with live terminals and a
preserved layout — and switches between them instantly.

## Using Silo

**[Workspaces](/guide/workspaces)** — the core model: what a workspace is, how
to open and switch between them, and how closing differs from deleting.

**[Side panels](/guide/panels)** — the left and right columns, what's in them,
how to show/hide them, and how keyboard focus moves between columns and the
center dock.

**[Extensions](/guide/extensions)** — the built-in extensions (Files, Git,
Search, Themes, Markdown Preview…), how to install extensions from the
[`silo-extensions` repo](https://github.com/silo-code/silo-extensions) or npm,
and where to start if you want to build your own.

**[The `silo` command](/guide/cli)** — open and switch workspaces directly from
the shell.

## Building Extensions

Silo's own features are built as extensions, and you can add your own. The
sidebar is organized in three stages:

### Foundations

Start here. **[What is an extension?](/guide/what-is-an-extension)** explains
the mental model — a small `activate(ctx)` object that touches the app only
through `ctx`. **[Your first extension](/guide/getting-started)** builds a
status-bar clock with a command and keybinding, step by step. If you prefer to
describe what you want and let an AI do the scaffolding,
**[Build with Claude Code](/guide/claude-skill)** covers that path.

### UI & theming

Once you have a working extension, these guides cover the visual surface.
**[Styling your extension](/guide/styling)** keeps your UI native-looking and
font-scale-aware. **[Workspace decorations & badges](/guide/workspace-decorations)**
adds status rows, React sections, and name badges to workspace rows.
**[Keyboard navigation](/guide/keyboard-navigation)** makes lists and panels
accessible with the keyboard. **[Building a theme](/guide/theming)** is the
producer side of theming — setting the full token surface so your preset shows
up in the picker.

### Packaging & publishing

**[Permissions & access](/guide/permissions)** explains the sandbox: what your
extension can do by default (everything inside the open workspace), how to
declare broader access in the manifest, and what happens at install time.
**[Publishing an extension](/guide/publishing-an-extension)** is the full
packaging reference — the manifest, the build contract, the install lifecycle.
**[Sharing extensions](/guide/sharing-extensions)** covers the distribution
options from a local folder to npm.

---

The **[API Reference](/api/)** documents every `ctx` member with signatures,
examples, and generated type definitions.
