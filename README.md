<div align="center">
  <img src="apps/desktop/src-tauri/icons/128x128.png" width="96" height="96" alt="Silo" />
  <p><strong>Run many workspaces at once — and switch between them instantly, without losing state.</strong></p>
</div>

Silo is a local-first desktop editor built for working across several projects
at the same time. Each workspace keeps its own terminals, panels, and layout
alive in the background, so switching between them is instant and lossless — no
reopening folders, no restarting your agents, no rebuilding context.

It's **terminal-first** by design. The workflow it optimizes for is the one a
lot of us actually live in now: driving coding agents (Claude Code and friends)
and shells in the foreground, with file editing as a secondary surface — the
inverse of the editor-first workflow VS Code is built around.

Under the hood it's a small stable core with a public extension SDK; first-party
features ship as extensions, modeled on the VS Code / Obsidian approach. Built
with Tauri, React, and TypeScript.

## Status

Early and moving fast. The platform is **100% open source** (MIT); the bar for
clean boundaries, a documented public surface, and a stable extension contract
is intentionally high. See the [Roadmap](https://silo.dev/roadmap) for what's stable
vs. planned.

## Develop

Silo is a [pnpm](https://pnpm.io/) workspace (monorepo). Run commands from the
repo root.

```bash
pnpm install
pnpm dev             # runs the "Silo Dev" build (isolated identity + data)
```

`pnpm dev` launches a separate **Silo Dev** app with its own icon and storage,
so it runs side-by-side with an installed stable Silo without clobbering its
state — the dogfooding setup. (It's a shortcut for `pnpm --filter silo app:dev`.)

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
apps/desktop          # the Tauri desktop app (+ src-tauri Rust crate)
packages/sdk          # @silo-code/sdk — the public, types-first extension SDK
packages/extension-host  # the workbench host runtime (+ /internal surface)
packages/extensions-core / extensions-silo  # bundled first-party extensions
packages/ui           # internal shared components (private)
examples/extensions   # example extensions that dogfood the SDK
apps/docs             # @silo-code/docs — docs + API reference site (VitePress)
```

## Releases & updates

Releases are driven by [Conventional Commits](https://www.conventionalcommits.org/).
On every push to `main`, [release-please](.github/workflows/release-please.yml)
maintains a "release vX.Y.Z" PR that bumps the version everywhere and updates
`CHANGELOG.md`. **Merging that PR** tags `silo-vX.Y.Z`, which triggers the
[release workflow](.github/workflows/release.yml) to build installers for macOS,
Windows, and Linux and publish them to GitHub Releases with the updater manifest.
The installed app checks for updates on launch and via **Silo → Check for Updates…**.

So cutting a release is just: land `feat:`/`fix:` PRs, then merge the release PR.

## Architecture & docs

- Extensions touch the app **only** through `ctx` and `@silo-code/sdk` types. The
  boundary is enforced first by the package graph (an extension package can only
  resolve what it depends on) and by lint (the platform ban + design-token CSS
  rule). See [`CLAUDE.md`](CLAUDE.md) and [`docs/`](docs/).
- The API reference is generated from source into the
  [docs site](https://silo.dev/) (`pnpm docs:api`).

## License

[MIT](LICENSE) © Dave Weaver
