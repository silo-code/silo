# Proposals (RFCs)

Forward-looking **changes that need design before they're decided** — the
prospective companion to [`docs/decisions/`](../decisions/README.md) (ADRs, which
record decisions already made). Part of the governance workstream.

## RFC vs. ADR — when to write which

- **RFC (here)** — a change that is **cross-cutting, hard to reverse, or
  contentious** and needs design first: a new `ctx` domain, a breaking change, the
  sandbox model, the extension manifest/package format. Rule of thumb: _if getting
  it wrong means a breaking SDK change later, write the RFC._
- **ADR (`docs/decisions/`)** — a decision already **settled**.
- **Neither** — a small surface addition that fits existing patterns (one new
  `ctx` method) just gets a `planned` entry on the [roadmap](../../apps/docs/roadmap.md).

## Lifecycle

A single `status` field drives it; nothing is deleted — it changes state and stays
as the permanent record.

```
  draft ──► accepted ──► implemented      ← stays forever as the record
    │           │
    └─► rejected └─► superseded-by NNNN    ← also stays, as the record of "no"
```

When an RFC lands it leaves a trail: the proposal flips to `implemented`, the
roadmap badge flips `planned → stable`, optionally an ADR records the crystallized
decision, and the CHANGELOG/semver reflect it. **Rejected/superseded proposals are
never deleted** — "we considered X and rejected it" stops the debate recurring.

## Planning packages (for substantial implementation work)

When a proposal is `accepted` and real implementation work is about to start, it
may temporarily expand from a single file into a directory of the same name:

```
docs/proposals/NNNN-name/
├── proposal.md       ← the overview + frontmatter
├── requirements.md   ← behavioural spec + acceptance criteria
├── design.md         ← technical design
└── tasks.md          ← the implementation checklist
```

`requirements.md` / `design.md` / `tasks.md` are **ephemeral working
artifacts**. When the work is implemented and verified they are deleted and the
directory collapses back to a single curated `NNNN-name.md` with
`status: implemented` — the numbered proposal file itself is never deleted.
Skeletons: [`planning-template/`](./planning-template/). Full workflow (when to
expand, how to collapse, cross-repo work): the
[change-planning convention](../change-planning-convention.md). Small changes
don't get a proposal at all — see below.

## Conventions

- **Numbering** is sequential (`NNNN-kebab-title.md`), permanent, never reused —
  a planning package keeps its proposal's number.
- **Self-contained.** Like ADRs, a proposal carries its own design; it links to
  other proposals/ADRs (stable) but only sparingly to the narrative docs, which
  will be overhauled. Once `implemented`, the proposal _is_ the record.
- **Format:** see [`template.md`](./template.md). Frontmatter: `status`, `created`,
  optional `supersedes` / `superseded-by`.
- **The index is enforced, not curated by memory.** A new proposal, a status
  change, or an expansion into a planning package all mean updating the row
  below — a unit test
  ([`apps/docs/checks/doc-indexes.sync.test.ts`](../../apps/docs/checks/doc-indexes.sync.test.ts))
  fails when the table and this directory disagree on which documents exist,
  where a row links, or a row's `created` / `status`. Expanding into a package
  repoints the link at `NNNN-name/proposal.md`; collapsing points it back.
  Titles are yours — the index shortens some deliberately.

## Index

| RFC                                                           | Title                                                             | Created    | Status      |
| ------------------------------------------------------------- | ----------------------------------------------------------------- | ---------- | ----------- |
| [0001](./0001-ctx-ui-slice-2.md)                              | `ctx.ui` slice 2 — quickPick / inputBox / progress                | 2026-06-04 | draft       |
| [0002](./0002-ctx-events.md)                                  | Typed `ctx` events (`Event<T>`)                                   | 2026-06-04 | draft       |
| [0003](./0003-ctx-settings.md)                                | `ctx.settings` — per-extension configuration                      | 2026-06-04 | superseded  |
| [0004](./0004-ctx-storage.md)                                 | `ctx.storage` — global / workspace / secret                       | 2026-06-04 | accepted    |
| [0005](./0005-declarative-contributes-activation.md)          | Declarative `contributes` + activation events                     | 2026-06-04 | draft       |
| [0006](./0006-extension-permissions-sandbox.md)               | Extension permissions + sandbox model                             | 2026-06-04 | draft       |
| [0007](./0007-extension-authoring-toolchain.md)               | Extension authoring toolchain (build/dev, scaffolder, CSS, store) | 2026-06-04 | draft       |
| [0008](./0008-extension-package-format-remote-install.md)     | Extension package format + remote install (GitHub / npm)          | 2026-06-04 | draft       |
| [0009](./0009-language-intelligence-lsp.md)                   | Language intelligence — TS/JS via `tsserver`                      | 2026-05-29 | draft       |
| [0010](./0010-pty-host-daemon.md)                             | Self-owned PTY host daemon (replace abduco)                       | 2026-06-04 | implemented |
| [0011](./0011-iframe-navigation-events.md)                    | Iframe navigation events via webview init script                  | 2026-06-21 | implemented |
| [0012](./0012-keyboard-navigation-architecture.md)            | Keyboard navigation architecture                                  | 2026-06-06 | implemented |
| [0013](./0013-context-menu-contributions.md)                  | Context-menu contributions for built-in surfaces                  | 2026-07-02 | accepted    |
| [0014](./0014-extension-registry.md)                          | Extension registry — publishing, discovery, install               | 2026-07-12 | draft       |
| [0015](./0015-workspace-extension-contributions.md)           | Workspace extension contributions — property pages + context menu | 2026-07-15 | accepted    |
| [0016](./0016-modal-design-system.md)                         | Modal design system: a public SDK component set                   | 2026-07-18 | accepted    |
| [0017](./0017-pty-host-daemon-outside-appimage-mount.md)      | Relocate the pty-host daemon binary outside the AppImage mount    | 2026-07-22 | draft       |
| [0018](./0018-ctx-agents-surface.md)                          | `ctx.agents` — host-computed agent activity + resume-hint surface | 2026-07-22 | accepted    |
| [0019](./0019-agent-hook-shell-runtime.md)                    | Agent session hook — POSIX-shell runtime (replaces base64/Python) | 2026-07-29 | implemented |
| [0020](./0020-agent-hook-activity-channel.md)                 | Hooks as an authoritative agent-activity channel (over OSC)       | 2026-07-29 | draft       |
| [0021](./0021-follow-ups-extension-sdk.md)                    | Follow-ups extension — generic toolbar + tab-decoration SDK       | 2026-07-30 | accepted    |
| [0022](./0022-side-panel-tab-adornments.md)                   | Side-panel tab adornments — owner handle from registerSidePanel   | 2026-07-31 | draft       |
| [0023](./0023-workspace-panel-views.md)                       | The Navigator — a side panel of contributed views                 | 2026-08-06 | accepted    |
| [0024](./0024-git-detection-handler-claim-protocol.md)        | Git detection handler claim protocol                              | 2026-08-13 | draft       |
| [0025](./0025-extension-to-extension-version-dependencies.md) | Declaring a version floor on another extension's API              | 2026-08-13 | draft       |
| [0026](./0026-terminal-session-host-backpressure.md)          | Terminal session-host backpressure — no UI freeze, startup status | 2026-08-16 | draft       |
| [0027](./0027-side-dock-layout-tree.md)                       | SideDock layout tree — free-form splits inside a side dock        | 2026-08-21 | implemented |
| [0028](./0028-terminal-identity-environment.md)               | Terminal identity in the environment                              | 2026-08-23 | implemented |
| [0029](./0029-sdk-sheet-homedir-confirm-dont-show.md)         | Public SDK: `showSheet`, `homeDir`, `confirmWithDontShowAgain`    | 2026-08-25 | implemented |
| [0030](./0030-navigator-view-arrangement.md)                  | Navigator view arrangement — reorder, disable, and a stacked mode | 2026-08-27 | implemented |
| [0031](./0031-tasks-extension.md)                             | Tasks extension — Silo tasks, third-party trackers as sources     | 2026-08-30 | draft       |
| [0032](./0032-ctx-extension-storage-directory/proposal.md)    | A per-extension storage directory on `ctx`                        | 2026-08-30 | accepted    |
