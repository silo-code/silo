---
status: implemented
created: 2026-11-09
---

# 0066. Verified file links in Chat and Terminal

## Summary

Every file path shown in the Chat panel or in terminal output is clickable,
including paths with spaces — in a directory, in the filename, or both, with no
quotes or brackets around them. Link detection stopped being a pure regular
expression and became three layers: the **path the agent already sent over the
protocol**, the **filesystem** (consulted on hover and on activation, never
while rendering), and the regular expression as the fallback for text that is
neither.

## Motivation

A path in a tool row or terminal line is how a user gets from "the agent
touched that file" to "the file is open in front of me". It was failing twice
on any path with a space in it: the link that should work was cut short, and a
second, bogus link was invented out of the remainder. The reported case:

```
Edit /Users/dweaver/.xerro/documents/ServiceTitan/Global Navigation/Overview.md
```

linked `…/ServiceTitan/Global`, then separately linked `Navigation/Overview.md`
— a relative path that resolved against the workspace folder and opened
nothing. The real file could not be reached by clicking.

Spaces were handled only inside a delimiter pair (`(…)`, `[…]`, `"…"`, `'…'`),
which is how quoted shell output presents a path and not how an agent writes a
title. No amount of regular-expression work fixes the general case: text alone
cannot say whether the words after a space are more filename or the rest of a
sentence. Two things can — the protocol, and the filesystem.

## What shipped

### Layer 1 — the path the agent already told us

ACP tool calls carry `locations[]`: the files a call is about, independent of
its title. The host already parsed it and the public SDK already exposed it
(`AgentToolCall.locations`); the Chat panel was dropping it when building a
row. `ToolEntry` now carries it, accumulated across frames the way the
subagent / backgrounded markers are — an update that mentions no locations
means "unchanged", not "none".

`matchChatLinks(text, knownPaths?)` takes those paths, finds them in the text
literally, and emits them as spans **before** the regular expressions run,
which then drop anything that overlaps. A known path is exact, so a title
naming a file with spaces links it whole with no guessing and no filesystem
access. `locations` is optional in the protocol; an agent that omits it falls
through to the layers below.

### Layer 2 — the filesystem decides, lazily

For free prose, tool output, and terminal lines, an ambiguous span proposes a
**candidate ladder** — the span, then the span plus each following word, capped
at 10 words — and a verifier walks it in two passes against
`ctx.files.pathExists`.

**Pass 1** takes the longest reading that exists. It runs to the end of the
ladder before the second pass starts, so `updated /src/foo.ts and bar.ts` lands
on the file that exists rather than letting a longer reading claim the sentence
on the strength of `/src` alone.

**Pass 2** runs only when every reading is dead, and takes the longest one
written into a real directory — an agent announcing a file it is _about_ to
create reads exactly like that, and a dead short link helps nobody. It walks up
a level or two (a file in a directory as new as itself), floored at the seed's
own parent so it can never reach back past what the regular expression read.

A not-yet-written file and a sentence that runs on past a path are **identical
on disk**: real directory, filename-shaped tail, nothing that exists. The
tiebreak is therefore the English — a speculative reading may not cross a word
like `and`, `then`, `just`, `with`. That list is consulted by pass 2 only, so a
directory genuinely named `Rock and Roll` links whole the moment it exists.

**When it runs is the design.** Never during render:

- **Terminal** — xterm's `provideLinks(line, callback)` may answer
  asynchronously, so the hovered line is verified before its links are
  reported, and no other line is ever probed.
- **Chat** — spans render from the regular expression as before; the existing
  hover resolves, and a longer verified reading extends the underline and
  swallows the bogus span after it.
- **Activation** never trusts the underline: a ⌘-click faster than the hover
  probe resolves the ladder first (normally a cache hit), so the file that
  opens is the one that exists.

Results are cached per base directory, misses included; concurrent walks
coalesce; each probe is abandoned after 200 ms, and a rejection counts as "does
not exist". Nothing is ever de-linked — every failure mode degrades to the
previous behavior.

### Layer 3 — lexical forms that need no filesystem

Backslash-escaped spaces (`~/Blog\ Posts/My\ Post.md`) now match, with the
escapes collapsed in what the editor is handed; `file://` URLs open their
decoded path in the editor rather than being handed to the OS. The span model
grew an `href` alongside its `text` for exactly this: what is underlined and
what is opened are no longer always the same string.

### The regular expression got _less_ greedy

A bare match takes **one** interior space per directory segment, not a run of
them. A greedy walk crosses a sentence to reach the next word followed by a
slash, linking `/a/b.md then src/foo.ts` as one path — and verification can
only _extend_ a span, never shrink one the regular expression over-read. One
space covers the common real cases (`Program Files\`, `Blog Posts/`) and cannot
reach past the word after it; anything longer is the filesystem's call.

## Performance

The binding constraint was RFC 0050: a transcript rebuild already costs seconds
of main thread on a large session, and probing during render would have added
thousands of IPC round trips and as many state updates on top of it. That is
the one way this feature could have frozen the UI, and it is why verification
is lazy.

- Render does no I/O and allocates no ladder: deciding whether a span is even
  ambiguous is a single character lookup.
- The activation ladder lives in a `WeakMap` keyed by element, not in `data-`
  attributes, so the transcript's DOM does not grow.
- `knownPaths` is memoized per tool entry so `LinkifiedText`'s `memo` still
  holds.
- Nothing blocks the main thread in any case: `pathExists` is async IPC and the
  syscall happens on the Rust side.

## Alternatives considered

- **More regular expression** — allow spaces in the final segment too.
  Rejected: `I updated /src/foo.ts and bar.ts` would link `/src/foo.ts and
bar.ts`. One wrong link traded for another.
- **Probe during render** — spans correct the moment they paint. Rejected on
  the RFC 0050 grounds above.
- **Resolve only at click time** — cheapest, and it does open the right file,
  but the user still _sees_ the path cut in half with a bogus link beside it.
- **A new `ctx` capability for path resolution** — unnecessary;
  `ctx.files.pathExists` already does it and is already available to both
  extensions. Nothing moved on the host ↔ extension boundary.

## Decision

Accepted and implemented 2026-11-09. Verification is lazy by rule, not by
tuning: probing during render is rejected outright, and any future caller of
the verifier is expected to keep that line.

Not done, deliberately: honouring a location's `line` (the editor has no
goto-line API), and verifying paths for a session running on a remote machine —
a remote path simply fails to verify and keeps its heuristic span.
