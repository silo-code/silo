---
status: accepted
date: 2026-06-02
---

# 0014. Per-extension enablement config (Obsidian-style)

## Context

Users should be able to disable optional features, but we don't want
per-contribution gating.

## Decision

Extensions are listed in a JSON config with per-**extension** enabled state
(bundled extensions default-on). The host discovers available extensions, reads
the config, and activates only enabled ones. Enable/disable keys off **extension
id** (which works with the provider/view split). Non-removable extensions
(`removable: false`; the `core.*` set) are **never offered as disableable**, and
the host enforces that — config cannot override it.

## Consequences

- Obsidian-familiar; per-extension granularity; core identity is protected.
- Deployment (bundled vs. independently shipped) is a separate axis — see
  [0020](./0020-silo-extensions-bundled.md).

## Alternatives considered

- **Per-contribution gating** — rejected: the provider/view split
  ([0008](./0008-extension-decomposition-provider-view.md)) removes the need.

## References

- Related: [0008](./0008-extension-decomposition-provider-view.md),
  [0020](./0020-silo-extensions-bundled.md).
