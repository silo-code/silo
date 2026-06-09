---
status: accepted
date: 2026-05-30
---

# 0006. Open-platform MIT licensing

## Context

Silo ships **100% open source**. This records the public **license posture**. The
detailed monetization strategy is kept **private** — it does not belong in the
open repo.

## Decision

- The **entire platform** — app shell, SDK, host, and the free built-ins — ships
  under **MIT**.
- **`@silo-code/sdk` is MIT permanently** (treated as irreversible) — a permissive SDK
  is what lets third parties build freely.
- **No gated editor core**, and **nothing proprietary enters the open repo.** Any
  commercial work is developed separately, in private, against the same public
  `@silo-code/sdk` — exactly like a third-party extension.

## Consequences

- The open core can't be rug-pulled: the SDK license is the one thing we never
  revisit, and a paid layer (if any) rides the same public contract as everyone
  else, which keeps that contract honest.
- The open repo stays unambiguously open — no source-available gray zones.

## Alternatives considered

- **Source-available core, dual-licensing, or a gated editor** — rejected: they
  create gray zones and contributor confusion and undercut adoption.

## References

- The MIT `LICENSE` file is the legal artifact. The monetization strategy is kept
  private (a separate commercial repo), deliberately out of the open repo.
