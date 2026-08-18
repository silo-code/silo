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

## Conventions

- **Numbering** is sequential (`NNNN-kebab-title.md`), permanent, never reused.
- **Self-contained.** Like ADRs, a proposal carries its own design; it links to
  other proposals/ADRs (stable) but only sparingly to the narrative docs, which
  will be overhauled. Once `implemented`, the proposal _is_ the record.
- **Format:** see [`template.md`](./template.md). Frontmatter: `status`, `created`,
  optional `supersedes` / `superseded-by`.

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
| [0018](./0018-ctx-agents-surface.md)                          | `ctx.agents` — host-computed agent activity + resume-hint surface | 2026-07-22 | draft       |
| [0019](./0019-agent-hook-shell-runtime.md)                    | Agent session hook — POSIX-shell runtime (replaces base64/Python) | 2026-07-29 | implemented |
| [0020](./0020-agent-hook-activity-channel.md)                 | Hooks as an authoritative agent-activity channel (over OSC)       | 2026-07-29 | draft       |
| [0021](./0021-follow-ups-extension-sdk.md)                    | Follow-ups extension — generic toolbar + tab-decoration SDK       | 2026-07-30 | accepted    |
| [0022](./0022-side-panel-tab-adornments.md)                   | Side-panel tab adornments — owner handle from registerSidePanel   | 2026-07-31 | draft       |
| [0023](./0023-workspace-panel-views.md)                       | The Navigator — a side panel of contributed views                 | 2026-08-06 | accepted    |
| [0024](./0024-git-detection-handler-claim-protocol.md)        | Git detection handler claim protocol                              | 2026-08-13 | draft       |
| [0025](./0025-extension-to-extension-version-dependencies.md) | Declaring a version floor on another extension's API              | 2026-08-13 | draft       |
| [0026](./0026-terminal-session-host-backpressure.md)          | Terminal session-host backpressure — no UI freeze, startup status | 2026-08-16 | draft       |
