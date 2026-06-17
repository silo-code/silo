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
    details: A small stable core with a public API. First-party features — terminal, editor, git, themes — ship as extensions against the same SDK you get.
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

**macOS** (v0.4.0) — Windows and Linux coming soon.

| Build                    | Link                                                                        |
| ------------------------ | --------------------------------------------------------------------------- |
| Apple Silicon (M1/M2/M3) | [Silo_0.4.0_aarch64.dmg](https://github.com/silo-code/silo/releases/latest) |
| Intel Mac                | [Silo_0.4.0_x64.dmg](https://github.com/silo-code/silo/releases/latest)     |

Or build from source — see the [GitHub repo](https://github.com/silo-code/silo).

---

## Building extensions

Silo has a public extension SDK (`@silo-code/sdk`), modeled on VS Code and Obsidian. Every first-party feature — terminal, file explorer, git, themes — is built as an extension against the same API you get. If a built-in can do it, so can you.

- **[What is an extension?](/guide/)** — start here
- **[Your first extension](/guide/getting-started)** — 5-minute walkthrough
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
