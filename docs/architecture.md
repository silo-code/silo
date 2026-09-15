# Architecture

The **structure** of Silo: what the pieces are, what each owns, and which
direction dependencies flow. This is a map, not a rationale — every _why_ lives
in an ADR (`docs/decisions/`), and this file links to them rather than
restating them.

Deliberately narrow, because narrative architecture docs rot: it describes only
facts the build already enforces (the package graph, the process split, the
on-disk layout). A unit test
([`apps/docs/checks/architecture.sync.test.ts`](../apps/docs/checks/architecture.sync.test.ts))
fails when the package table below disagrees with the workspace's actual
`package.json` files, so this cannot silently drift the way a hand-written
overview would.

- Boundaries and the rules for staying inside them: `AGENTS.md`.
- The durable _why_ behind every choice here: `docs/decisions/`.
- Vocabulary: `docs/domain-language.md`.

## The shape in one paragraph

Silo is a Tauri desktop app: a **Rust host process** owning the window, the
filesystem, and long-lived child processes, and a **webview** running a React
workbench. The workbench is a small privileged core plus a set of
**extensions** — including most of what users think of as Silo itself (the file
explorer, git, the terminal, agents). First-party extensions are bundled and
loaded at startup; third-party extensions are installed at runtime. Everything
an extension is allowed to touch is reached through one object, `ctx`, typed by
the public `@silo-code/sdk` ([ADR 0001](./decisions/0001-in-process-extension-architecture.md),
[ADR 0004](./decisions/0004-sdk-types-first.md)).

## Packages

A pnpm workspace (`pnpm-workspace.yaml`: `apps/*`, `packages/*`,
`examples/extensions/*`). The boundary is the **package graph** — a package can
only import what it declares as a dependency, so several architectural rules
need no linting at all.

| Package                       | Path                             | Owns                                                                                                                              | Depends on (workspace)                                              | Published |
| ----------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | --------- |
| `@silo-code/sdk`              | `packages/sdk`                   | The public extension surface: `ctx` types, domain types, and the design-system kit. Types-first, zero runtime deps.               | —                                                                   | yes       |
| `@silo-code/extension-host`   | `packages/extension-host`        | The workbench runtime — state, services, layout, docking, panels, chrome, the extension registry and loader that construct `ctx`. | `sdk`                                                               | no        |
| `@silo-code/extensions-core`  | `packages/extensions-core`       | Bundled `core.*` extensions — the ones that may use privileged host internals.                                                    | `sdk`, `extension-host`, `git-api`                                  | no        |
| `@silo-code/extensions-silo`  | `packages/extensions-silo`       | Bundled `silo.*` extensions — held to the exact same surface a third party gets.                                                  | `sdk`, `git-api`                                                    | no        |
| `@silo-code/git-api`          | `packages/git-api`               | Published types for the `silo.git` provider: `GitAPI` and the live `GitRepoStore` watch session.                                  | `sdk` (peer)                                                        | yes       |
| `@silo-code/ui`               | `packages/ui`                    | Nothing. An empty placeholder — see [Vestigial](#vestigial) below.                                                                | —                                                                   | no        |
| `silo`                        | `apps/desktop`                   | The Tauri app and the composition root. Also the CLI, the Control API, and the dev automation bridge.                             | `sdk`, `extension-host`, `extensions-core`, `extensions-silo`, `ui` | no        |
| `@silo-code/docs`             | `apps/docs`                      | The docs site (VitePress), the generated API reference, and the repo's doc-consistency checks.                                    | `sdk`, `website`                                                    | no        |
| `@silo-code/website`          | `apps/website`                   | Marketing site components, shared with the recorder.                                                                              | —                                                                   | no        |
| `@silo-code/website-recorder` | `apps/website-recorder`          | Renders website assets to images/video.                                                                                           | `website`                                                           | no        |
| `@silo-code/update-server`    | `apps/update-server`             | The Cloudflare Worker behind update checks ([ADR 0031](./decisions/0031-update-check-analytics.md)).                              | —                                                                   | no        |
| `create-silo-extension`       | `packages/create-silo-extension` | The `npm create` scaffolder for third-party extensions.                                                                           | —                                                                   | yes       |

### The one edge that matters

```
extensions-silo ──► sdk ◄── extension-host ──► (nothing above it)
                     ▲              ▲
extensions-core ─────┘──────────────┘  (+ extension-host/internal)
```

`@silo-code/extensions-silo` depends on **`sdk` and `git-api` only**. It
therefore _physically cannot_ import the host — no lint rule required. That is
the enforcement mechanism for "extensions touch the app only through `ctx`,"
and it's why `silo.*` extensions are a credible proof that the public SDK is
sufficient to build real features.

`@silo-code/extensions-core` does depend on the host and can reach
`@silo-code/extension-host/internal`, the privileged subpath. That asymmetry is
the trust tier ([ADR 0013](./decisions/0013-trust-tiers-two-barrel-sdk.md)), not
an accident — but a capability `core.*` needs from internals is still a
standing question about whether it belongs in `ctx`.

The SDK is a **leaf**: it depends on nothing in the workspace, and nothing may
create a back-edge into it. The host importing _from_ the SDK (types and kit
components alike) is the normal direction.

### Inside the host

`packages/extension-host/src/` is layered, with `state` and `services` as
inner leaves that must not import outward:

| Directory            | Owns                                                                       |
| -------------------- | -------------------------------------------------------------------------- |
| `state/`             | The valtio store — the workbench's observable state.                       |
| `services/`          | Logic over that state, independent of React.                               |
| `layout/`            | The window shell, docking geometry, theming (`theme.css`).                 |
| `docked/`, `panels/` | Dock and panel chrome.                                                     |
| `components/`        | Host-owned chrome components.                                              |
| `extension-host/`    | The registry, loader, `ctx` construction, and each `ctx` domain's service. |

`extension-host/` is where `ctx` is assembled (`context.ts`) and where the
privileged barrel `sdk-internal.ts` is exported as
`@silo-code/extension-host/internal`.

## Processes

Silo is not one process ([user-facing detail](../apps/docs/guide/process-model.md)).

| Process       | Language | Owns                                                                                                                                      |
| ------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Main app      | Rust     | Window, menus, global shortcuts, filesystem, and every Tauri command in `src-tauri/src/commands/`.                                        |
| Webview       | TS/React | The entire workbench and every extension. In-process with each other ([ADR 0001](./decisions/0001-in-process-extension-architecture.md)). |
| Session hosts | Rust     | One per live terminal backend. Outlive the webview ([ADR 0010](./decisions/0010-persistent-process-sessions.md)).                         |

**The line that matters:** the webview is disposable — it reloads, and
extensions come and go with it. Anything that must survive a reload lives in
Rust. Terminal and agent sessions are the canonical case: a session host keeps
running while the UI reattaches to it, which is why reattach/replay has its own
protocol ([ADR 0050](./decisions/0050-replay-is-tagged-not-filtered.md)) and its
own durable log (`AGENTS.md` → "Terminal attach / restart post-mortems").

Extensions may not call Rust directly — no raw `@tauri-apps/*` — so every
capability crossing this line is a deliberate `ctx` method.

## Composition

`apps/desktop/src/builtins.ts` is the composition root: it imports every
bundled extension from the two barrels, orders them, and hands the list to the
host's `activateExtensions`. Adding a bundled extension means a new directory
under `extensions-core/src/` or `extensions-silo/src/`, a re-export from that
package's barrel, and an entry here — nothing else in the host knows it exists.

Runtime (third-party) extensions load through a different path — validated
manifest, trust prompt, permissions
([ADR 0019](./decisions/0019-runtime-extension-loading.md),
[ADR 0015](./decisions/0015-phased-security-model.md)) — and arrive at the same
`ctx`.

## Persistence

Three destinations with different rules
([ADR 0022](./decisions/0022-on-disk-storage-layout.md)):

| Kind      | Contains                                   | Survives reinstall |
| --------- | ------------------------------------------ | ------------------ |
| Config    | User settings, keybindings, enablement     | should             |
| App state | Layout, open panels, workspace arrangement | best-effort        |
| Runtime   | Caches, session scratch                    | no                 |

The host never deletes user data without asking
([ADR 0046](./decisions/0046-never-delete-user-data-unprompted.md)). The dev
build ("Silo Dev") and Nightly use separate identifiers and separate
directories, so all three trees exist per-channel
([ADR 0024](./decisions/0024-release-channels.md)).

## Two published surfaces

Most of the repo is private. Two packages ship to third parties and are
therefore breaking-change liabilities:

- **`@silo-code/sdk`** — the extension API. Versioned, documented by generation
  from source, and tracked on the public roadmap.
- **`@silo-code/git-api`** — `GitAPI` types for consumers of the `silo.git`
  provider, resolved at runtime via `ctx.getExtension("silo.git")`
  ([ADR 0037](./decisions/0037-git-repo-watch-session.md)).

Both are consumed at `workspace:*` inside this repo but by **published
version** in `silo-code/silo-extensions`, so third-party extensions ride a
version behind HEAD — the asymmetry described in
[ADR 0026](./decisions/0026-sdk-component-set.md) and
`docs/silo-extensions-repo.md`.

## Vestigial

`@silo-code/ui` is an **empty package**. [ADR 0005](./decisions/0005-ui-library-internal.md)
reserved it as the internal component library and the slot in the workspace
graph; [ADR 0026](./decisions/0026-sdk-component-set.md) then put the curated
component set in the public SDK instead, so nothing was ever extracted into it.
Its `src/index.ts` is `export {}` and a comment citing `REPO-STRATEGY`, a
document that no longer exists. `apps/desktop` still declares it as a
dependency and imports nothing from it.

Recorded here rather than quietly removed: deleting it is a small decision that
supersedes part of ADR 0005, and it should be made deliberately.
