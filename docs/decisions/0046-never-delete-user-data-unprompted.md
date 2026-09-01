---
status: accepted
date: 2026-08-30
---

# 0046. The host never deletes user data without asking

## Context

RFC 0004 (`ctx.storage`) originally sketched deleting an extension's persisted
state automatically when the extension is uninstalled — the tidy, VS-Code-like
default. RFC 0032 (per-extension storage **directories**) revisited that sketch
once the state in question became real files a person can open, edit, and back
up rather than an opaque key/value bag: a `.jsonl` task list, an export, a cache
a user has been pointing other tools at.

Silo will keep adding places where an extension's data outlives the extension
itself — `ctx.secrets` (RFC 0004's other open item) is the next obvious one, and
workspace deletion already faces the same question for `ctx.storage.workspace`.
Each of those would otherwise re-litigate "does uninstalling/deleting X delete
its data?" from scratch.

## Decision

**The host never deletes a user's files on its own.** Any operation that could
destroy user data the host has been holding on an extension's behalf — uninstall
today, and any future analog — offers deletion as an **explicit, opt-in choice**
at the moment of the destructive action, defaulting to **not deleted**. The host
may delete unprompted only when there is nothing to lose (an empty directory).

Concretely, for extension storage directories (RFC 0032): uninstalling keeps the
directory unless the user checks "Also delete its data" on the confirm; a
file-free directory is swept away either way, since there's nothing in it to
lose. Reinstalling finds the previous data. Retained data's path is written to
the Output panel — the one place a user can find it afterward, since nothing
else in the product names it.

## The converse: the host never _creates_ user data unprompted either

Same instinct, other direction (RFC 0033). A user-owned list — Agent Profiles,
in that case — that the product presents as empty until the user adds something
must not gain rows as a side effect of a programmatic call. RFC 0033's
`ctx.terminals.create({ kind: "claude" })` compatibility path launches a
matching profile _if one exists_ but never writes a profile record, and a
persisted `kind: "claude"` terminal is normalized to `"shell"` at load without
synthesizing a `profileId`. The rule: **the host adds a row to a user-owned
collection only in response to an explicit user gesture** (a click, a typed
command) — never inferred, never on migration, never behind a programmatic API
call. A missing back-reference nobody can act on is a better failure than a
fabricated one.

## Consequences

- A user can never lose files by uninstalling on reflex. The worst outcome of
  skipping the checkbox is bytes left on disk in a directory they can find and
  clean up manually — recoverable, unlike silent deletion.
- Every future "does deleting X delete its data?" question answers itself: no,
  unless the user is asked and says yes. `ctx.secrets` and any future
  workspace-delete cleanup should follow this rule rather than re-deciding it.
- The host carries the cost of the confirm UI (the opt-in checkbox, the file
  count/size probe behind it) wherever this applies, rather than the simpler
  "just delete it" default.
- Built-in extensions, which can only be disabled and never uninstalled, have no
  in-product path to delete their data at all — deliberately: there is no
  uninstall event to hang the choice off. The Output-panel path is the only
  pointer such a user gets. Not revisited by this decision; flagged as a known
  gap if it ever becomes a real complaint.

## Alternatives considered

- **Delete automatically on uninstall** (RFC 0004's original sketch). Rejected:
  silently deleting files a user could have been editing is a worse failure mode
  than leaving bytes on disk in a directory they can find.
- **Never delete, no opt-in at all** (require a separate manual step, e.g.
  revealing the folder and deleting it yourself). Rejected as friction with no
  offsetting safety benefit — an explicit, unchecked-by-default checkbox is
  exactly as safe and removes a manual multi-step chore for the common case
  ("I'm done with this extension and its data").

## References

- [RFC 0032](../proposals/0032-ctx-extension-storage-directory.md) — the first
  application: per-extension storage directories and the uninstall confirm.
- [RFC 0004](../proposals/0004-ctx-storage.md) — `ctx.storage`, whose original
  sketch this departs from; also the open `ctx.secrets` item this rule should
  govern when it lands.
- [RFC 0033](../proposals/0033-agent-profiles.md) — Agent Profiles; the first
  application of the converse ("never _create_ user data unprompted").
