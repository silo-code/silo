# Chat transcript load-test rig (RFC 0050)

A repeatable way to put a Chat panel in front of an arbitrarily large transcript
without spending tokens, hitting the network, or waiting on a vendor agent — so
the cost of a workspace switch can be measured before and after each step of
RFC 0050.

## Pieces

- **`fake-acp-agent.mjs`** — a ~90-line ACP agent over stdio. Answers
  `initialize` / `session/new` / `session/prompt`, and **refuses**
  `session/load` and `session/resume`. That refusal is the point: a restore then
  takes the `via: "none"` branch in `tryResumeOrLoad`, the session degrades to
  `"journal-only"`, and the panel paints the journal verbatim — no replay to
  race, no `dropSeed` to discard the planted lines.
- **`gen-journal.mjs`** — writes a synthetic journal (RFC 0042 JSONL) modelled
  on a real 28 MB session measured 2026-09-16: 48 user turns, 625 tool calls,
  3,014 agent message chunks, 2,481 tool-call updates, 26 lines over 200 KB.
  Deterministic per `--seed`, so a before/after comparison measures the change
  and not a different transcript.

## The one non-obvious constraint

**Planting the journal requires the app to be stopped.** Two reasons:

1. The live `ChatSessionJournalWriter` holds every line of its session in memory
   and rewrites the **whole file** on flush, so a flush from a running app will
   overwrite a planted journal.
2. Closing and reopening a workspace does **not** remount its Chat panel —
   `CenterDock` keeps every warmed workspace's dock mounted, which is the whole
   premise of Silo. So the seed effect (keyed on `[ctx, params.sessionId,
nonce]`) never re-runs, and a journal planted under a running app is simply
   never read. Only a real app restart remounts the panel.

## Setup (once)

Already done in the dev app on this machine, and all of it persists across
restarts:

- Agent profile `loadtest-fake` → `node fake-acp-agent.mjs`, interface `chat`.
- Workspace `load-test` (`ws_8ac003cd-f838-4520-bb06-e40fee2743c3`).
- A Chat panel in it, session `355c5104-f06e-47ea-aec2-d434da2fa031`.

To build it from scratch elsewhere: `openWorkspace`, `addAgentProfile`, then
`exec core.newAgent.loadtest-fake`, and read the session id back from
`listPanels`.

## Each measurement run

```sh
# 1. quit the dev app  (the writer must not be alive)

# 2. plant a transcript
./plant.sh 48          # ~13.7 MB, 48 turns, ~650 tool calls
./plant.sh 96          # roughly double

# 3. start the dev app, and make the load-test workspace active
```

The panel restores → connect finds the journal, fails to resume → journal-only →
the whole transcript paints and **stays** painted for the life of the process.
Switch workspaces and measure.

## Measuring

Install the frame recorder from the RFC 0050 work (per-frame `scrollTop`
sampling plus a `MutationObserver` on the dock content container) via the
automation bridge's `eval`, switch workspaces by hand, and read it back.

The window must be **frontmost** while switching: `requestAnimationFrame` is
suspended for an occluded WKWebView, so both the sampler and the code under test
stop running. This invalidated the first attempt at measuring the switch flash.

## Cleanup

```sh
curl -s -X POST http://127.0.0.1:7878/ -H 'X-Silo-Automation: 1' \
  -H 'Content-Type: application/json' \
  --data '{"op":"deleteWorkspace","args":{"id":"ws_8ac003cd-f838-4520-bb06-e40fee2743c3"}}'
curl -s -X POST http://127.0.0.1:7878/ -H 'X-Silo-Automation: 1' \
  -H 'Content-Type: application/json' \
  --data '{"op":"removeAgentProfile","args":{"id":"loadtest-fake"}}'
```
