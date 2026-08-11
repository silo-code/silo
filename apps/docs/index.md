---
# Full React marketing homepage (mounted by theme/Layout.vue). This HTML is
# the SSG SEO shell — crawlers and no-JS clients see it; React replaces
# #silo-home on mount. Keep copy aligned with
# apps/website/src/homepage-copy.ts.
#
# Canonical / Open Graph / Twitter / JSON-LD head tags come from
# `@silo-code/website/seo` via transformHead in .vitepress/config.ts
# (not here) so they stay in sync with the shared copy helpers.
#
# IMPORTANT: no blank lines inside the root HTML block — CommonMark ends a
# <div> HTML block on a blank line and would escape the rest as markdown.
layout: page
navbar: false
sidebar: false
footer: false
aside: false
title: Silo — One window — every project, every agent
titleTemplate: false
description: One window — every project, every agent. Terminals, agents, and layout stay intact — switch between them instantly. 100% open source, free forever.
---

<div id="silo-home" class="silo-home silo-home-shell">
<header class="silo-home-shell-header">
<a class="silo-home-shell-brand" href="/"><img src="/silo-icon.png" alt="" width="44" height="44" />Silo</a>
<nav class="silo-home-shell-nav" aria-label="Primary">
<a href="https://extensions.getsilo.dev">Extensions</a>
<a href="/guide/">Docs</a>
<a href="/changelog">Changelog</a>
<a href="https://github.com/silo-code/silo">GitHub</a>
<a class="silo-home-shell-download" href="https://github.com/silo-code/silo/releases/latest">Download</a>
</nav>
</header>
<main>
<p>FOR DEVELOPERS JUGGLING CODING AGENTS</p>
<h1>One window —<br />every project, every agent</h1>
<p class="silo-home-shell-tagline">Terminals, agents, and layout stay intact — switch between them instantly. 100% open source, free forever.</p>
<p class="silo-home-shell-actions">
<a href="https://github.com/silo-code/silo/releases/latest" data-primary>Download</a>
<a href="https://github.com/silo-code/silo">Star on GitHub</a>
</p>
<section aria-label="Product">
<article>
<p>Workspaces</p>
<h2>Each project a click away</h2>
<p>Switch with a keystroke. Terminals keep running, agents keep working, layout stays put — nothing reloads.</p>
<p>Close a workspace and come back weeks later; everything is still in its place.</p>
</article>
<article>
<p>Git</p>
<h2>Worktrees without leaving the workspace</h2>
<p>Create a worktree on a branch, open it alongside your main folder, remove it when you're done — the branch stays. Stage, commit, and manage worktrees from the same Git panel.</p>
</article>
<article>
<p>Terminals</p>
<h2>Agents and terminals come first</h2>
<p>Most editors are file-first — the terminal is a drawer, the agent a side panel. Silo flips it: coding agents and terminals are the main surface; the editor shares the stage when you need it.</p>
</article>
<article>
<p>Extensions</p>
<h2>Build the tool this project needs</h2>
<p>Notice a friction, ask Claude to scaffold an extension, use it minutes later. Same public SDK the first-party features use — optional, uninstallable, shareable via the registry.</p>
</article>
</section>
<section>
<h2>100% open source. Free forever.</h2>
<p>MIT licensed. No account. No telemetry. Nothing to lose by trying it.</p>
</section>
<section>
<h2>Common questions</h2>
<details>
<summary>Is Silo really free?</summary>
<p>Yes. MIT licensed, free forever — no subscription, no trial, no enterprise tier. Fork it, read the source, build on it.</p>
</details>
<details>
<summary>Do I need an account?</summary>
<p>No. Download it and run. Everything stays on your machine — no cloud sync, no sign-in, no telemetry.</p>
</details>
<details>
<summary>How is this different from VS Code or Cursor?</summary>
<p>Those are file-first editors built around one active workspace. Silo is built around many workspaces that stay alive at once — terminals, agents, and layout intact when you switch. You don't rebuild context every time you change projects.</p>
</details>
<details>
<summary>How is this different from agent orchestrators?</summary>
<p>Orchestrators organize agent tasks (often one worktree per task). Silo organizes your whole project — agents, terminals, editors, panels — as a workspace you can switch, close, and resurrect. Worktrees are git tooling inside that model, not the unit of work.</p>
</details>
<details>
<summary>Is the editor as good as Zed or VS Code?</summary>
<p>Not yet — and that's intentional honesty. The workspace layer is the point today. Editor and terminal keep improving in the open; you pick Silo so you never rebuild context, not for the best single-buffer editing.</p>
</details>
</section>
</main>
<footer>
<a href="/">Silo</a>
<nav aria-label="Silo">
<a href="https://github.com/silo-code/silo/releases/latest">Download</a>
<a href="https://extensions.getsilo.dev">Extensions</a>
<a href="/roadmap">Roadmap</a>
<a href="https://github.com/silo-code/silo">GitHub</a>
</nav>
<nav aria-label="Docs">
<a href="/guide/">Getting started</a>
<a href="/api/">API reference</a>
<a href="/design/">Design system</a>
<a href="/guide/claude-skill">Build with Claude</a>
</nav>
<p>Silo © 2026 · <a href="https://github.com/silo-code/silo/blob/main/LICENSE">MIT License</a></p>
<p><a href="https://github.com/silo-code/silo">GitHub</a> · <a href="https://x.com/silo_code">X</a></p>
</footer>
</div>
