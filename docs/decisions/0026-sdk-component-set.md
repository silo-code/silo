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

## Host consumption and the chrome line

The kit has **one source** — `@silo-code/sdk` — consumed by every tier the same
way. There is deliberately **no internal fork or mirror package**: the
would-be-internal design system and the public one are the same code. The
monorepo makes this work without a bridge — the host and the bundled extensions
depend on the SDK via `workspace:*` and import the components directly, so
"internal Silo UI" and "third-party extension UI" build from identical markup.
(The instinct to add a private `@silo-code/ui-internal` that re-exports the
public kit is the pattern for a _published_ design system consumed across repos;
here the `workspace:*` graph already gives internal consumers the kit at HEAD, so
that layer would only add drift.)

Consumers, and the direction of the dependency:

- **Bundled extensions** (`@silo-code/extensions-core` = `core.*`,
  `@silo-code/extensions-silo` = `silo.*`) use the kit exactly as a third party
  would — they are where most first-party UI lives, and their modals are the
  migration target in RFC 0016's sequencing.
- **The host** (`@silo-code/extension-host`) may import the kit components from
  the public SDK just as it already imports SDK **types** — the SDK is a leaf and
  host → SDK is the normal (acyclic) direction. No boundary rule restricts it;
  the platform ban and leaf-layering rules point the other way.

The **chrome line** — what the kit covers vs. what stays host-owned:

- **Kit territory** (design-token-styled `.silo-*` content): the _content_ of
  modals, settings pages, and workspace property tabs. Whoever renders that
  content — host or extension — uses the kit.
- **Host chrome** (component-token-styled, bespoke, host-owned): the `<Modal>`
  shell/backdrop/z-stack (ADR 0018), the Settings **rail**, the status-bar
  container, panels, and the title bar. These are styled via **component tokens**
  (`--silo-content-*`, `--silo-statusbar-*`, …) the kit and extensions may not
  touch, and they are intentionally absent from the public kit (RFC 0016
  non-goals). Panels and the status bar adopt kit _pieces_ only when a later
  RFC phase promotes them — until then they stay bespoke.

**Version asymmetry (by design):** internal consumers ride the kit at HEAD
through `workspace:*`; third-party extensions ride the last _published_ SDK. A
new component is usable app-side the day it lands but reaches third parties only
after a publish + their `@silo-code/sdk` bump. Keep the kit's public contract
additive-only regardless of who consumes it first.

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
