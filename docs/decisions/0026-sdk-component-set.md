---
status: accepted
date: 2026-07-18
---

# 0026. A curated presentational component set joins the public SDK

## Context

ADR 0005 keeps the component library (`@silo-code/ui`) internal, on the
reasoning that every exported component is a forever breaking-change liability
— while explicitly reserving the door: "we can **promote** components to public
later; we can't un-publish an API." Since then the SDK has already shipped one
real component (`Tooltip`) plus behavior hooks (`useFocusGroup`,
`useServiceState`), extensions externalize `react` and `@silo-code/sdk` so SDK
runtime resolves to the host's copy, and the modal surface has accumulated
enough drift (RFC 0016's motivation) that "no shared components" now costs more
than the API liability it avoids.

## Decision

A **curated, capped** set of presentational components — the modal-content kit
specified in RFC 0016 — is promoted into `@silo-code/sdk`, joining `Tooltip` on
the public leaf. This amends ADR 0005's blanket "components stay internal";
everything else in that ADR stands:

- `packages/ui` remains a `private: true` placeholder; there is no general
  public component library.
- `<Modal>` stays host-internal (ADR 0018): it sits on host state, and the
  public capability remains `ctx.ui.confirm`/`prompt`/`showModal`. The kit is
  modal _content_, not chrome.
- Admission bar for any future promotion: presentational only, no host stores,
  no deps beyond `react`/`react-dom`, keyboard behavior via the public focus
  utilities, styled exclusively by host-provided `.silo-*` classes (the
  `Tooltip` pattern). Additions require an RFC; the set is not open-ended.
- The rendered `.silo-*` class names are public API, pinned by unit tests;
  renames are breaking. Visual values stay host-owned (theme.css /
  components.css) so restyles propagate app-side without SDK bumps —
  RFC 0016's propagation contract.

## Consequences

- Extensions (and coding agents) get a normative, importable answer to "make a
  modal that blends in"; the bundled modals migrate onto the same kit, so
  first- and third-party modals converge on one language.
- Each exported component is permanent npm surface — accepted deliberately,
  bounded by the cap + admission bar. Props and classes evolve additive-only
  within a major.
- ADR 0004's "types-first SDK" tagline erodes further (the SDK is now
  types-first _plus a small blessed runtime_); the trade was already made with
  `Tooltip` and the hooks — this names it.
- The external `silo-extensions` repo picks the kit up on its next published
  SDK bump; until each extension migrates, its modals simply keep their
  current look.
