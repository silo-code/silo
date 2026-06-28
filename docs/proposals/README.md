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

| RFC                                                       | Title                                                             | Created    | Status      |
| --------------------------------------------------------- | ----------------------------------------------------------------- | ---------- | ----------- |
| [0001](./0001-ctx-ui-slice-2.md)                          | `ctx.ui` slice 2 — quickPick / inputBox / progress                | 2026-06-04 | draft       |
| [0002](./0002-ctx-events.md)                              | Typed `ctx` events (`Event<T>`)                                   | 2026-06-04 | draft       |
| [0003](./0003-ctx-settings.md)                            | `ctx.settings` — per-extension configuration                      | 2026-06-04 | superseded  |
| [0004](./0004-ctx-storage.md)                             | `ctx.storage` — global / workspace / secret                       | 2026-06-04 | accepted    |
| [0005](./0005-declarative-contributes-activation.md)      | Declarative `contributes` + activation events                     | 2026-06-04 | draft       |
| [0006](./0006-extension-permissions-sandbox.md)           | Extension permissions + sandbox model                             | 2026-06-04 | draft       |
| [0007](./0007-extension-authoring-toolchain.md)           | Extension authoring toolchain (build/dev, scaffolder, CSS, store) | 2026-06-04 | draft       |
| [0008](./0008-extension-package-format-remote-install.md) | Extension package format + remote install (GitHub / npm)          | 2026-06-04 | draft       |
| [0009](./0009-language-intelligence-lsp.md)               | Language intelligence — TS/JS via `tsserver`                      | 2026-05-29 | draft       |
| [0010](./0010-pty-host-daemon.md)                         | Self-owned PTY host daemon (replace abduco)                       | 2026-06-04 | implemented |
