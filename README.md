<div align="center">
  <img src="apps/desktop/src-tauri/icons/128x128.png" width="96" height="96" alt="Silo" />

  <h3>Terminal-first workspace manager — built for the multi-agent workflow</h3>

  <p>
    Switch between your projects like browser tabs —<br/>
    except each tab is a full workspace with live terminals, running agents, and preserved layout.
  </p>

  <p>
    <a href="https://github.com/silo-code/silo/releases/latest"><strong>Download for macOS →</strong></a>
    &nbsp;·&nbsp;
    <a href="https://getsilo.dev">Docs</a>
    &nbsp;·&nbsp;
    <a href="https://getsilo.dev/roadmap">Roadmap</a>
  </p>

  <img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue" />
  <img alt="Platform: macOS" src="https://img.shields.io/badge/platform-macOS-lightgrey" />
  <img alt="Status: Early" src="https://img.shields.io/badge/status-early%20access-orange" />
</div>

---

<div align="center">
  <img src="https://github.com/user-attachments/assets/6c73421d-247a-436b-acbb-17e1a286a841" alt="Switching between three live workspaces in Silo" width="800" />
</div>

---

## The problem with one-workspace-at-a-time editors

VS Code and Cursor are file-first editors. They're built around a single active workspace — which made sense when _you_ were writing the code.

Now you're coordinating 3–5 AI coding agents simultaneously across different projects. Every time you switch context, you lose your terminal state. Your agents get interrupted. You spend more time rebuilding context than doing actual work.

**Silo is built around the opposite model.**

Open as many project workspaces as you need and tab between them instantly. Each workspace keeps its terminals running, its layout intact, and its agents working — exactly as you left it. Switching takes a keystroke, not a minute.

## How it works

- **Workspace tabs** — each project gets its own persistent tab; switch instantly without losing anything
- **Live backgrounds** — terminals keep running, agents keep working, layout stays put when you switch away
- **Terminal-first** — shells and coding agents are the primary surface; file editing is secondary
- **Extension SDK** — a small stable core with a public API; first-party features ship as extensions (modeled on VS Code / Obsidian)
- **Local-first** — everything runs on your machine; no cloud required

## Who it's for

- You run Claude Code, Aider, or other AI coding agents and want to keep several going at once
- You work across multiple projects simultaneously and hate losing terminal state when switching
- You live in the terminal more than the editor
- You've hit the ceiling of what a single-workspace editor can do for your workflow

## vs. VS Code / Cursor

|                          | VS Code / Cursor                     | Silo                                      |
| ------------------------ | ------------------------------------ | ----------------------------------------- |
| **Switching projects**   | Reopens folder, loses terminal state | Instant tab switch — everything preserved |
| **Multiple agents**      | One active workspace at a time       | Many workspaces, all live simultaneously  |
| **Primary surface**      | File editor                          | Terminal + agents                         |
| **Background terminals** | Die or disconnect                    | Stay running                              |
| **Extensible**           | Yes                                  | Yes — open SDK, MIT licensed              |

## Download

**macOS** (v0.4.0):

| Build                    | Link                                                                        |
| ------------------------ | --------------------------------------------------------------------------- |
| Apple Silicon (M1/M2/M3) | [Silo_0.4.0_aarch64.dmg](https://github.com/silo-code/silo/releases/latest) |
| Intel Mac                | [Silo_0.4.0_x64.dmg](https://github.com/silo-code/silo/releases/latest)     |

Windows and Linux builds are in progress — watch [Releases](https://github.com/silo-code/silo/releases) or star the repo to get notified.

---

## Develop

Silo is a [pnpm](https://pnpm.io/) workspace (monorepo). Run commands from the repo root.

```bash
pnpm install
pnpm dev             # runs the "Silo Dev" build (isolated identity + data)
```

`pnpm dev` launches a separate **Silo Dev** app with its own icon and storage,
so it runs side-by-side with an installed stable Silo without clobbering its
state.

| Task                              | Command                                |
| --------------------------------- | -------------------------------------- |
| Dev app (isolated identity)       | `pnpm dev`                             |
| Build a release bundle            | `pnpm --filter silo app:build`         |
| Typecheck                         | `pnpm --filter silo exec tsc --noEmit` |
| Lint (architecture boundary gate) | `pnpm lint`                            |
| Test                              | `pnpm test`                            |
| Docs site (live)                  | `pnpm docs:dev`                        |

### Repo layout

```
apps/desktop             # the Tauri desktop app (+ src-tauri Rust crate)
packages/sdk             # @silo-code/sdk — the public, types-first extension SDK
packages/extension-host  # the workbench host runtime (+ /internal surface)
packages/extensions-core / extensions-silo  # bundled first-party extensions
packages/ui              # internal shared components (private)
examples/extensions      # example extensions that dogfood the SDK
apps/docs                # @silo-code/docs — docs + API reference site (VitePress)
```

## Releases

Releases are driven by [Conventional Commits](https://www.conventionalcommits.org/).
On every push to `main`, [release-please](.github/workflows/release-please.yml)
maintains a "release vX.Y.Z" PR that bumps the version everywhere and updates
`CHANGELOG.md`. Merging that PR tags `silo-vX.Y.Z`, which triggers the
[release workflow](.github/workflows/release.yml) to build macOS installers and
publish them to GitHub Releases. The installed app checks for updates on launch
and via **Silo → Check for Updates…**.

## Architecture

- Extensions touch the app **only** through `ctx` and `@silo-code/sdk` types. The boundary is enforced by the package graph and lint (platform ban + design-token CSS rule). See [`CLAUDE.md`](CLAUDE.md) and [`docs/`](docs/).
- The API reference is generated from source: `pnpm docs:api` → [getsilo.dev](https://getsilo.dev/)

## License

[MIT](LICENSE) © Dave Weaver
