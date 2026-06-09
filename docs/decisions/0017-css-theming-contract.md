---
status: accepted
date: 2026-06-02
---

# 0017. CSS theming contract: `--silo-*` token tiers, relative sizing, semantic treatments

## Context

Extensions and theme authors both touch CSS. Without a contract, extension CSS
collides with host variables, and global primitive overrides are too blunt to
re-style specific UI.

## Decision

- **Namespacing:** every host custom property is prefixed `--silo-*` — the
  collision firewall.
- **The name encodes the contract:** **design tokens** (`--silo-color-*`,
  `--silo-font*`, `--silo-radius-*`) are consumable by extensions; **component
  tokens** (`--silo-<component>-*`) are overridable by themes but **not**
  consumable by extensions; **`--silo-internal-*`** is neither. (Overridable ≠
  consumable — two orthogonal axes.)
- **Sizing:** the host owns one absolute base (`--silo-font-size-base` from
  `uiFontSize`) and sizes panel slots; extensions size **relatively** (`em`) — so
  `Cmd/Ctrl +/-/0` scaling works via the cascade, no JS.
- **Theming targets named semantic treatments** (e.g. "editor tab corners"), not
  raw primitives.
- A stylelint rule (`silo/extension-design-tokens-only`) enforces extension
  consumption as a ratchet (burned down to 0).

## Consequences

- Safe extension styling **and** rich theme overrides on two orthogonal axes; font
  scaling for free via the cascade.
- More tokens + a stylelint ratchet to maintain.

## Alternatives considered

- **Bare token names** (collisions), **a flat list** (no boundary), **global
  primitive overrides** (too coarse) — all rejected.

## References

- Related: [0005](./0005-ui-library-internal.md),
  [0018](./0018-host-owned-chrome.md).
