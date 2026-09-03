---
status: draft # draft | accepted | implemented | rejected | superseded-by NNNN
created: 2026-09-03
---

# 0035. Choosing an agent and reviewing a prompt before it runs

## Summary

RFC 0033 phase 3 shipped the machinery for handing a coding agent an opening
prompt — `ctx.agents.profiles.launch({ prompt })` composes a quoted line and
types it into a real shell. It is deliberately **headless**: it takes a profile
id and a string, types immediately, and returns. This proposes the UI half —
a host-owned **Agent Prompt Composer**: a profile picker showing each agent's
brand mark, and an editable prompt, shown before anything is typed.

It is a **second entry point, not a mode of `launch()`**. `launch()` stays the
direct, synchronous primitive; the composer is what a surface reaches for when
the user should see what is about to run in their name.

## Motivation

Two gaps, one about safety and one about what extensions can actually build.

**A prompt the user never saw still lands in their scrollback and history.**
RFC 0033 R5a is explicit that this is intended: the composed line is typed into
the user's own interactive shell so a launch is something they can see, edit,
and re-run. That reasoning holds when the user typed the prompt. It gets thinner
when an **extension generated it** — from a task title, an issue body, a
selection — because then the first time the user sees the text is after it has
executed and entered their shell history. The phase's own docs have to warn
"don't put a secret in one," which is a sign the gap is real: today there is no
moment at which a user can look at a generated prompt and say no.

**An extension cannot show the user which agent it is about to run.** The host
has everything needed — `ctx.agents.catalog()` returns `CatalogAgentSummary`
with an `AgentIcon`, and the SDK exports `AgentIconGlyph` to render it — but
`AgentProfileSummary` (`id`, `label`, `isDefault`, `acceptsPrompt`) carries **no
route from a profile to its catalog agent**. So a third-party picker built from
`list()` + `ctx.ui.showMenu` can show labels and nothing else, while Silo's own
Profiles tab renders the icons using `resolveProfileAgentId` from the privileged
internal barrel. That asymmetry is the thing ADR 0026 exists to prevent: first-
party and third-party UI should build from the same parts.

RFC 0031's **Start Task** is the first consumer that wants both — "run this task
with an agent" is exactly a generated prompt plus a choice of agent — and it is
the reason to design this now rather than earlier.

## Design

### The composer

One new host-owned surface, reached by one new method:

```ts
interface AgentProfilesService {
  list(): readonly AgentProfileSummary[];
  launch(options?: LaunchAgentProfileOptions): LaunchAgentProfileResult;

  /** Show the composer, then launch what the user confirms. Resolves when
   *  they confirm or dismiss — never types anything before that. */
  compose(
    options?: ComposeAgentPromptOptions,
  ): Promise<LaunchAgentProfileResult>;
}

interface ComposeAgentPromptOptions {
  /** Pre-selected profile. Defaults to the resolved default profile. */
  profileId?: string;
  /** Starting prompt text, editable by the user. */
  prompt?: string;
  /** Title for the dialog, e.g. "Start this task with an agent". */
  title?: string;
  workspaceId?: string;
  cwd?: string;
}
```

`compose()` returns the **same result type** as `launch()`, with one added
refusal — `"cancelled"` — so a caller branches on one shape either way. It is
async where `launch()` is sync, which is the honest difference between "do it"
and "ask, then do it."

Host-owned for the same reason RFC 0033 refused to add `pick()` and pointed at
`ctx.ui.showMenu`: the chrome is shared. Every extension that asks this question
should ask it the same way, and the profile→icon mapping should not have to be
reinvented (or made public) for each one.

The composer shows, at minimum:

- a **profile picker** listing each profile with its agent's `AgentIconGlyph`,
  its label, and the default marked — with profiles whose agent cannot take an
  opening prompt visibly annotated rather than silently failing later
  (`acceptsPrompt` already carries this);
- an **editable prompt**, multi-line, seeded from `options.prompt`;
- the **refusal up front**, not after: if the current selection cannot take the
  prompt, say so in the dialog instead of returning
  `"agent-takes-none"` from a confirm.

### The profile→agent gap

`AgentProfileSummary` gains what an extension needs to render a profile the way
Silo does. The narrow fix is the resolved catalog agent id, which composes with
the existing `catalog()`:

```ts
interface AgentProfileSummary {
  readonly id: string;
  readonly label: string;
  readonly isDefault: boolean;
  readonly acceptsPrompt: boolean;
  /** The Catalog Agent this profile resolves to, when it resolves to one —
   *  join against `ctx.agents.catalog()` for its display name and icon. */
  readonly agentId?: string;
}
```

Deliberately the **id**, not an embedded `AgentIcon`: the icon is already
reachable through `catalog()`, and duplicating it onto every profile summary
would mean two copies of the same data to keep frozen and in sync. This is
useful independently of the composer — it is what makes a hand-rolled picker
possible at all — and is small enough to ship first.

### Who calls which

The decision "should the user see this before it runs" is **knowable by the
caller**, not by the user at click time:

| Situation                                                     | Call        |
| ------------------------------------------------------------- | ----------- |
| The user typed the prompt in your UI a moment ago             | `launch()`  |
| Your extension generated the prompt (task title, issue, diff) | `compose()` |
| A keybinding the user configured with a fixed prompt          | `launch()`  |
| A one-click "run this with an agent" on someone else's data   | `compose()` |

That is why this is two methods rather than one method with a flag: the caller
already knows, and a flag invites callers to pass it through from somewhere that
doesn't.

## Alternatives considered

**A modal inside `launch()`, on by default.** Rejected. `launch()` is an API an
extension calls, not a gesture a user makes — a modal by default interrupts
every programmatic caller, and it would break the contract RFC 0033 just
published as `@beta`: `launch()` returns a **synchronous** result today, and
prompting makes it async and adds a cancellation outcome. A verb that can block
on a human is also awkward for the automation paths RFC 0034 is building.

**A `confirm: boolean` option on `launch()`.** Rejected as the primary shape for
the reason in "Who calls which" — it looks like a caller decision but reads like
a user preference, and callers end up plumbing it from their own settings. Two
named methods make the choice explicit at each call site. (A future `compose()`
caller wanting to skip the dialog under some condition can simply call
`launch()`.)

**A "don't ask me again" checkbox.** Rejected. Whether you want to review a
prompt is **per-invocation intent**, not a standing preference: the same user
wants to edit a generated task prompt and not to edit one they just typed. A
checkbox converts a decision that legitimately changes every time into a
permanent one, and the escape hatch (a settings page) is far from where the
decision is made. `confirmWithDontShowAgain` (RFC 0029) is the right tool for
_warnings_, which this is not.

**Shift-to-bypass the dialog.** Rejected as the _only_ affordance:
undiscoverable, unavailable from a menu item or a touch surface, and backwards —
it makes the un-reviewed path the default that a modifier escapes, in a feature
whose entire discipline is "refuse rather than approximate." Reasonable later as
an accelerator layered on a visible control, never as the way to reach a mode.

**A split button — "Launch" with a "Edit prompt first…" dropdown.** Not
rejected, but not this proposal's job: it is a choice each _surface_ makes, and
it composes from the two methods above. Worth it only where one surface
genuinely serves both intents; most serve one.

## A related constraint the composer will run into

Prompts are capped at **2 KiB** — about a page — and that number is not
arbitrary. RFC 0033 phase-3 verification measured a plugin-heavy zsh losing
bytes above ~4 KiB and truncating reliably at 8 KiB, silently, because the
prompt is _typed_ and a line editor running syntax highlighting cannot keep up
(silo-code/silo#497). The limit is set well below the cliff so a caller gets a
`too-large` it can act on rather than an agent working from a truncated brief.

This bears on the composer directly: an editor invites longer text than a
one-line API call does. Whatever it looks like, it should show the limit and
refuse **in the dialog**, before the user has written two pages — the same
principle as surfacing `acceptsPrompt` up front rather than as a refusal after
confirming.

It also puts a third option on the table that this RFC does not choose:
**stop typing the payload.** Writing the prompt to a temp file and typing
`agent "$(cat <file>)"` makes the line editor see ~80 bytes regardless of size,
and the ceiling disappears. The cost is R5a's transparency — the composed line
in scrollback stops being the instruction and becomes a `cat` of an opaque
path, no longer something the user can read, edit, and re-run — plus a file on
disk with a lifetime to manage. If a consumer ever genuinely needs prompts
larger than a page, that trade is the decision to make, and it should be made
deliberately rather than as a side effect of raising a constant.

## Decision

Not yet decided — `draft`.

Sequencing note: the `AgentProfileSummary.agentId` addition stands on its own and
could ship ahead of the composer. The composer itself should be designed against
RFC 0031's **Start Task** as its first real consumer rather than speculatively;
building it before a caller exists is the kind of ahead-of-need abstraction
`AGENTS.md` warns against for implementation code.
