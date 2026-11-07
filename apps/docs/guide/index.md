# Getting Started

Silo is a desktop app for working with coding agents. Open a project, start a
chat with Claude Code, and keep your files, terminals, and git on the same
screen. When one project turns into ten, Silo keeps all of them alive at once
and lets you switch between them instantly.

<img class="zoomable" src="/img/guide/getting-started-hero.png" alt="Silo with one workspace open: a Chat panel talking to Claude Code in the center, the Files panel on the right, and the Navigator on the left" width="688" />

It scales in both directions:

- **One project, one chat.** Open a folder, start a chat, and you have a
  focused agent desktop — the same shape as the Claude Code or Codex desktop
  apps, with your source and git right beside the conversation.
- **Every project, all at once.** Group a dozen workspaces by client or
  product, run a few chats per workspace, keep dev servers running in
  background terminals, and jump between them with one keystroke. Nothing
  reloads, nothing gets interrupted.

Everything is free and open source (MIT). There is no account, no cloud sync,
and no telemetry — your code and your conversations stay on your machine.

## Install

**[Download the latest release →](https://github.com/silo-code/silo/releases/latest)**

| Platform | What to get                                                                            |
| -------- | -------------------------------------------------------------------------------------- |
| macOS    | The `.dmg` for Apple Silicon or Intel. Drag Silo to Applications.                      |
| Linux    | The `.AppImage` (any distro) or the `.deb` (Debian/Ubuntu).                            |
| Windows  | Experimental builds ship with each release. Expect rough edges and please report them. |

Silo updates itself from inside the app. If you want daily builds instead, see
[Release channels](/guide/release-channels).

**For the chat:** install [Claude Code](https://docs.anthropic.com/en/docs/claude-code/overview)
and sign in to it once from any terminal (`claude`). Silo talks to it through a
small adapter that downloads on first use, so you also need Node.js on your
`PATH` for `npx`.

## Your first five minutes

### 1. Open a folder

Click **+** next to **Workspaces** in the Navigator (the left column),
choose **New workspace…**, and pick a project folder. Silo creates a
**workspace** for it — a named project that remembers its own tabs,
terminals, and layout. The center of the window is empty for now and shows
what you can put there.

<img class="zoomable" src="/img/guide/workspaces-open.png" alt="The Navigator's Workspaces view with the + button highlighted" width="400" />

Prefer the shell? `silo .` from any project directory does the same thing once
you install [the `silo` command](/guide/cli).

### 2. Start a chat with Claude

Click the **+** in the center tab bar and choose your Claude profile, or press
<kbd>⌘⌥I</kbd>. The first time, Silo asks you to set up an **agent profile** —
a saved way to start an agent. Pick **Claude Code** with the **Chat** interface
and you're done; the full walkthrough is in
[Chat with Claude Code](/guide/chat).

<img class="zoomable" src="/img/guide/chat-start.png" alt="The center tab bar's + menu, with agent profiles listed at the bottom" width="400" />

A Chat panel opens as a tab. Type what you want, press <kbd>Enter</kbd>, and
watch Claude read files, edit them, and run commands — each step rendered as
part of Silo's UI, with diffs you can expand and paths you can click.

<img class="zoomable" src="/img/guide/chat-transcript.png" alt="A Chat panel showing Claude's tool calls, an inline diff, and a summary" width="400" />

### 3. Put files, git, and a terminal beside it

The right column holds **Files**, **Search**, and **Git**. Click a file to
open it in an editor tab next to the chat. Press <kbd>⌘T</kbd> for a terminal
when you want to run the dev server or check something yourself. Drag any tab
to split the center so two things are visible at once.

<img class="zoomable" src="/img/guide/panels-file-explorer.png" alt="The Files panel open in the right column" width="400" />

### 4. Open a second project

Press <kbd>⌘⇧N</kbd> (or **+** → **New workspace…** again) and pick another
folder. Your first workspace keeps running in the background, chat and
terminals included. Switch back with <kbd>⌘`</kbd> and it's exactly as you
left it.

That's the whole model. The rest of these guides go deeper on each piece.

## Guides

**Using Silo**

- **[Chat with Claude Code](/guide/chat)** — the Chat panel in depth:
  profiles, the composer, permissions, plans, questions, resuming, and running
  several chats at once.
- **[Workspaces](/guide/workspaces)** — opening, grouping, switching, and the
  difference between closing and deleting.
- **[Layout & panels](/guide/panels)** — the center dock, the side columns,
  the Navigator, and the keyboard shortcuts that move between them.
- **[Working across many projects](/guide/many-projects)** — how Silo holds up
  with a dozen workspaces, multiple agents, and background dev services.
- **[Terminal agents](/guide/agent-sessions)** — running Claude, Codex, Cursor,
  Copilot and others in a plain terminal, and what Silo tracks for each.
- **[Keyboard shortcuts](/guide/keyboard-shortcuts)** — the defaults, on one
  page.
- **[Extensions](/guide/extensions)** — the built-in features, and how to
  install more from the registry.
- **[The `silo` command](/guide/cli)** — open and switch workspaces from the
  shell.

**Reference**

- **[Silo's process model](/guide/process-model)** — why Activity Monitor
  shows several Silo processes, and what's normal.
- **[Release channels](/guide/release-channels)** — Stable and Nightly.

## Extending Silo

Silo has a public extension SDK modeled on VS Code and Obsidian. Every built-in
feature — the Chat panel included — ships as an extension against the same API
you get.

- **[What is an extension?](/guide/what-is-an-extension)** — start here for
  the mental model.
- **[Your first extension](/guide/your-first-extension)** — build a working
  extension step by step.
- **[Build with Claude Code](/guide/claude-skill)** — describe what you want;
  Claude scaffolds and installs it.

The **[API Reference](/api/)** documents every `ctx` member with signatures,
examples, and generated type definitions. The **[Roadmap](/roadmap)** shows
what's stable and what's planned.
