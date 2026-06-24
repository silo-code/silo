---
layout: home

hero:
  name: "Silo"
  text: "Terminal-first workspace manager"
  tagline: "Switch between your projects like browser tabs — except each tab is a full workspace with live terminals, running agents, and preserved layout."
  actions:
    - theme: brand
      text: Download for macOS →
      link: https://github.com/silo-code/silo/releases/latest
    - theme: brand
      text: Download for Linux →
      link: https://github.com/silo-code/silo/releases/latest
    - theme: alt
      text: View on GitHub
      link: https://github.com/silo-code/silo

features:
  - icon: 🗂️
    title: Workspace tabs
    details: Each project gets its own persistent tab. Switch instantly — terminals, layout, and editor state all stay exactly as you left them. Nothing reloads.
  - icon: ⚡
    title: Live backgrounds
    details: Terminals keep running and agents keep working when you switch away. Come back and everything is exactly where you left it.
  - icon: ">_"
    title: Terminal-first
    details: Shells and AI coding agents are the primary surface. File editing is secondary — the inverse of VS Code's model.
  - icon: 🔒
    title: Local-first
    details: Everything runs on your machine. No cloud sync, no telemetry, no account required.
  - icon: 🧩
    title: Extension SDK
    details: A small stable core with a public API. First-party features — terminal, file explorer, git, themes — ship as extensions against the same SDK you get.
  - icon: 🤖
    title: Extend Silo with Claude Code
    details: Describe what you want in plain English. Claude scaffolds, writes, compiles, and installs a real working extension — no SDK knowledge needed. From idea to installed in one session.
  - icon: "📄"
    title: MIT licensed
    details: 100% open source. Build on it, fork it, contribute to it.
---

<div class="demo-gif">
  <img src="/demo.gif" alt="Switching between three live workspaces in Silo" />
</div>

## Built for the multi-agent era

VS Code and Cursor are file-first editors built around a single active workspace. That made sense when _you_ were writing the code.

Now you're coordinating multiple AI coding agents simultaneously across different projects. Every time you switch context in a traditional editor, you lose your terminal state. Your agents get interrupted. You spend more time rebuilding context than doing actual work.

**Silo is built around the opposite model.** Open as many project workspaces as you need and tab between them instantly. Each workspace keeps its terminals running, its layout intact, and its agents working — exactly as you left it.

## Download

**macOS:**

| Build                    | Link                                                                       |
| ------------------------ | -------------------------------------------------------------------------- |
| Apple Silicon (M1/M2/M3) | [Download .dmg](https://github.com/silo-code/silo/releases/latest)         |
| Intel Mac                | [Download .dmg (Intel)](https://github.com/silo-code/silo/releases/latest) |

**Linux:**

| Build         | Link                                                                    |
| ------------- | ----------------------------------------------------------------------- |
| AppImage      | [Download .AppImage](https://github.com/silo-code/silo/releases/latest) |
| Debian/Ubuntu | [Download .deb](https://github.com/silo-code/silo/releases/latest)      |

**Windows:** Experimental builds are attached to every [GitHub Release](https://github.com/silo-code/silo/releases) — they may not work correctly yet.

Or build from source — see the [GitHub repo](https://github.com/silo-code/silo).

---

## Extend Silo with Claude Code

Describe what you want. Claude builds it.

The `silo-extension-builder` skill takes a plain-English description and returns a working Silo extension — scaffolded from scratch, written in TypeScript against the real SDK, compiled, and hot-installed into the running app. No SDK knowledge required. No config files to wire up. No boilerplate to wrestle with. You describe what you want, and it's there.

Some things people have shipped this way in a single session:

- **Git branch status bar** — branch name + dirty indicator, updates on workspace switch
- **GitHub Issues panel** — lists open issues for the active repo via `gh`, with a refresh button
- **Scratch pad** — a persisted notes panel that survives restarts
- **Todo manager** — reads and writes `TODO.md` in the active workspace, with checkboxes and inline add

The result is a first-class extension. It installs and uninstalls live — no restart needed. And because it's built on the same SDK Silo's own built-ins use, there's no ceiling on what you can make.

**[Build your first extension →](/guide/claude-skill)**

---

## Building extensions

Silo has a public extension SDK (`@silo-code/sdk`), modeled on VS Code and Obsidian. Every first-party feature — terminal, file explorer, git, themes — is built as an extension against the same API you get. If a built-in can do it, so can you.

- **[What is an extension?](/guide/what-is-an-extension)** — start here
- **[Your first extension](/guide/getting-started)** — 5-minute walkthrough
- **[Build with Claude Code](/guide/claude-skill)** — scaffold and install via AI
- **[API Reference](/api/)** — the full `ctx` surface
- **[Roadmap](/roadmap)** — what's stable, what's planned

<style>
.demo-gif {
  max-width: 900px;
  margin: 100px 0 2rem 0;
  border-radius: 8px;
  overflow: hidden;
}
.demo-gif img {
  width: 100%;
  display: block;
}
</style>
