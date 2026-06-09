# Decision records (ADRs)

Decisions **already made**, recorded so the _why_ outlives the conversation.
Part of the project's governance layer.

## ADR vs. RFC — when to write which

- **ADR (here, `docs/decisions/`)** — a decision that's **settled**. Retrospective,
  short. "We decided X, here's why, here's what it costs." Write one whenever a
  non-obvious choice is made that someone would otherwise re-litigate.
- **RFC (`docs/proposals/`, when it exists)** — a **forward-looking change** that's
  cross-cutting, hard to reverse, or contentious and needs design before deciding
  (a new `ctx` domain, a breaking change, the sandbox model, the manifest format).
  Rule of thumb: _if getting it wrong means a breaking SDK change later, write the
  RFC._ An RFC can crystallize into an ADR when it lands.

A small, obvious choice needs neither.

## Conventions

- **Numbering** is sequential (`NNNN-kebab-title.md`) and permanent; never reused.
  (This initial batch was seeded retroactively in **decision-date order**, so the
  numbers track when each decision was made.)
- **Self-contained, minimal external links.** An ADR is the **durable** record, so
  it links **only to other ADRs** (stable). The narrative/planning docs (strategy,
  architecture audits, plans) **will be overhauled** — ADRs mention them only as
  brief plain-text provenance, never as navigation links that would rot. The
  decision's full meaning lives in the ADR.
- **Never delete or rewrite history.** A reversed decision isn't deleted — a new
  ADR supersedes it and the old one's `status` flips to `superseded-by NNNN`.
- **Status:** `proposed` · `accepted` · `rejected` · `superseded-by NNNN`.
- **Format:** MADR-lite — see `template.md`.

## Index

| ADR                                                     | Title                                               | Date       | Status   |
| ------------------------------------------------------- | --------------------------------------------------- | ---------- | -------- |
| [0001](./0001-in-process-extension-architecture.md)     | In-process, registry-based extension architecture   | 2026-05-23 | accepted |
| [0002](./0002-imperative-registration-no-manifest.md)   | Imperative registration; no static manifest (v1)    | 2026-05-23 | accepted |
| [0003](./0003-monorepo-pnpm.md)                         | Monorepo with pnpm workspaces                       | 2026-05-29 | accepted |
| [0004](./0004-sdk-types-first.md)                       | Public `@silo-code/sdk` is types-first              | 2026-05-29 | accepted |
| [0005](./0005-ui-library-internal.md)                   | Component library (`@silo-code/ui`) stays internal  | 2026-05-29 | accepted |
| [0006](./0006-open-platform-licensing.md)               | Open-platform MIT licensing                         | 2026-05-30 | accepted |
| [0007](./0007-core-primitive-vs-extension-test.md)      | Core-primitive vs extension-feature test            | 2026-05-31 | accepted |
| [0008](./0008-extension-decomposition-provider-view.md) | Extension decomposition; provider/view split        | 2026-05-31 | accepted |
| [0009](./0009-extension-communication-and-events.md)    | Extension communication: typed APIs + domain events | 2026-05-31 | accepted |
| [0010](./0010-persistent-process-sessions.md)           | Persistent process sessions as a core primitive     | 2026-05-31 | accepted |
| [0011](./0011-editor-and-terminal-are-core.md)          | Editor and terminal are core surfaces               | 2026-05-31 | accepted |
| [0012](./0012-dev-automation-rpc.md)                    | Dev-only automation RPC                             | 2026-06-01 | accepted |
| [0013](./0013-trust-tiers-two-barrel-sdk.md)            | Extension trust tiers + two-barrel SDK              | 2026-06-02 | accepted |
| [0014](./0014-per-extension-enablement.md)              | Per-extension enablement config (Obsidian-style)    | 2026-06-02 | accepted |
| [0015](./0015-phased-security-model.md)                 | Phased security model for privileged primitives     | 2026-06-02 | accepted |
| [0016](./0016-ctx-dnd-primitive.md)                     | First-class drag-and-drop primitive (`ctx.dnd`)     | 2026-06-02 | accepted |
| [0017](./0017-css-theming-contract.md)                  | CSS theming contract (`--silo-*` token tiers)       | 2026-06-02 | accepted |
| [0018](./0018-host-owned-chrome.md)                     | Host-owned UI chrome: modals + unified menu         | 2026-06-03 | accepted |
| [0019](./0019-runtime-extension-loading.md)             | Runtime extension loading + manifest validation     | 2026-06-04 | accepted |
| [0020](./0020-silo-extensions-bundled.md)               | Ship `silo.*` bundled, surfaced as disable-able     | 2026-06-04 | accepted |
| [0021](./0021-keyboard-navigation-architecture.md)      | Keyboard nav: headless focus-group + region model   | 2026-06-08 | accepted |
