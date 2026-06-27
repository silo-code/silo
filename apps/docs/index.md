---
layout: home

hero:
  name: "Silo"
  text: "Every project, always live"
  tagline: "Keep all your projects running simultaneously — terminals, agents, and layout intact — and switch between them in an instant."
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
  - icon: ⚡
    title: Instant switching, zero reload
    details: Every workspace stays live in the background. Switch projects and land exactly where you left off — running terminals, open editors, active agents, all intact. Nothing reloads.
  - icon: 🗂️
    title: Layout that sticks
    details: Each workspace remembers its exact terminal tab arrangement. Name a tab "dev build", another "claude", a third "docs" — they're waiting exactly where you left them, every time you return.
  - icon: ">_"
    title: Terminals and editors as equals
    details: A terminal tab and an editor tab are the same thing — arrange them side by side, stack them, name them. Span a workspace across multiple folders for monorepos or paired projects, and the file tree, git panel, and search cover all roots automatically.
  - icon: 🧩
    title: Open extension SDK
    details: Every built-in feature — terminal, files, git, themes — ships as an extension against the same public API you get. No ceiling on what you can add.
  - icon: 🌱
    title: Free and open source, forever
    details: MIT licensed — no subscription, no trial, no enterprise tier. Fork it, contribute to it, build on it. Every first-party feature ships as an extension against the same SDK you get, so the codebase is genuinely open, not just open-licensed.
  - icon: 🔒
    title: Local-first
    details: Everything runs on your machine. No cloud sync, no telemetry, no account required. Your workspaces, terminals, and files stay on your hardware.
---

<div class="demo-gif">
  <img src="/demo.gif" alt="Switching between three live workspaces in Silo" />
</div>

## Built for running multiple agents at once

You're driving a Claude session in one project while a dev build grinds in another, keeping a third open for quick fixes. Traditional editors weren't built for this. Every time you switch context, you lose your terminal state. Agents get interrupted. You spend half your time reconstructing what you had.

Silo flips the model: **every workspace runs all the time.** Open your projects, set each one up however you like, and tab between them instantly. The dev build keeps running. The agent keeps working. Your layout is exactly where you left it.

**What that looks like in practice:** one workspace might have four terminal tabs — one running the dev build, one for docs, one for a plain shell, one where Claude is filing GitHub issues. Switch away for an hour, come back: all four tabs are right there, doing exactly what they were doing.

That's not a setting to configure. That's just how Silo works. And it's completely free — MIT licensed, no account, no subscription, no enterprise tier.

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

The `silo-extension-builder` skill takes a plain-English description and returns a working Silo extension — scaffolded from scratch, written in TypeScript against the real SDK, compiled, and hot-installed into the running app. No SDK knowledge required. No config files to wire up. You describe what you want, and it's there.

Some things people have shipped this way in a single session:

- **Git branch status bar** — branch name + dirty indicator, updates on workspace switch
- **GitHub Issues panel** — lists open issues for the active repo via `gh`, with a refresh button
- **Scratch pad** — a persisted notes panel that survives restarts
- **Todo manager** — reads and writes `TODO.md` in the active workspace, with checkboxes and inline add

The result is a first-class extension — installs and uninstalls live, no restart needed — built on the same SDK Silo's own built-ins use.

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
