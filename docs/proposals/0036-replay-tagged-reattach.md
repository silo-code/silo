---
status: implemented
created: 2026-09-03
---

# 0036. Tagging reattach replay on the wire

## Summary

A Silo terminal session outlives the app, and attaching to one that is already
running makes the session daemon replay up to 256KB of its ring buffer. Those
bytes went out as ordinary `T_DATA` frames — indistinguishable from output the
shell is producing this instant — so every consumer read a reattach as things
happening right now. This adds a "this already happened" signal to the pty-host
wire protocol and carries it through the seam, the host, and `ctx`, so each
consumer decides for itself what a replayed byte means.

## Motivation

The protocol had one data frame type and no way to say _when_ the bytes were
produced. Two user-visible failures followed from that single gap (issue #500).

**The app wedged.** `TerminalPanel` restores its persisted `SerializeAddon`
buffer on attach, and then the daemon's ring replay arrived through the same
`onData` stream and was written again — up to 256KB of agent TUI escape
sequences per terminal, the full-screen-redraw kind. With six agent terminals
re-attaching at once (switching into a large workspace, or launching with it
active), the renderer went from ~450MB to ~1.7GB in seconds and the window
stopped responding hard enough to need a kill. `vmmap` on a wedged renderer
showed WebKit Malloc at 2.3GB across 3.6M live allocations with the JS heap
nearly empty — render-tree memory, not JS objects. Under memory pressure it was
close to deterministic, which is why it read as intermittent for so long.

**Phantom agent activity.** `agents-service` subscribed to the same stream and
had no way to know the bytes were old: indicators flipped to working and BEL
bytes in the replay rang the bell, for turns that finished before the app
started. The foreground snapshot delivered at attach had the same shape — it was
reduced as a _transition_ rather than taken as the baseline, so an agent found
at its shell prompt read as a turn that had just completed.

The obvious fix — drop the replay before it reaches these consumers — fixes the
terminal and breaks the agents service outright, because that service works out
_which_ agent owns a terminal from the same bytes. Filtering left every
reattached terminal with no agent status at all. The data is both the false
signal and the necessary evidence, which is what made this a protocol problem
rather than a filtering problem.

## What shipped

**The wire.** The daemon brackets its ring replay with `T_REPLAY_BEGIN` /
`T_REPLAY_END`, and `PROTO_VERSION` moved to 2. Brackets rather than a second
data tag: replay is already chunked into many frames, so one state bit beats two
parallel data paths. Live output that lands between two replay chunks closes the
bracket and reopens it after, so a bracket always describes exactly the frames
inside it — the client needs no timing assumptions.

**Compatibility.** The app now accepts a _range_ of protocol versions rather
than one. A daemon forked by the previous release keeps serving its sessions on
version 1 until they end, and the client treats an untagged peer's output as
entirely live — exactly the previous behavior. Upgrading Silo no longer orphans
running terminals, and the negotiated version is logged at attach so a
post-mortem can tell which protocol a session was speaking.

**The seam.** `Connection.reader` became a `SessionReader` yielding classified
chunks instead of a bare `Read`, and the `terminal_output` event payload gained
a `replay` boolean. A single event never mixes replayed and live bytes.

**`ctx`.** Replay is opt-in and off by default: `subscribeOutput`,
`subscribeOsc`, and `ProcessSession.onData` deliver live output only unless the
caller passes `{ includeReplay: true }`, in which case each chunk arrives with an
`OutputOrigin`. Default-off rather than a bare flag, so every existing handler —
first- and third-party — became correct with no code change, while the two
consumers that genuinely need the history ask for it.

**The terminal.** `TerminalPanel` opts in and drops the replayed copy when it
already restored a non-empty persisted buffer, and paints it when it did not
(the ring is then the only scrollback there is). That is the fix for the wedge.

**The agents service.** It opts in on both its OSC and raw-output
subscriptions, and splits the two uses of the data apart: replayed bytes are
_identity_ evidence — `isAgent`, the catalog id, the resume hint — and never
_activity_. Replay cannot touch attention in either direction: it may not raise
it (that was the phantom bell) and may not clear it (a restored
`needsAttention: true` was never acknowledged, and the ring cannot say whether
it predates the persisted flag). The flag rides the idle-debounce timers a
detection arms, so the delayed event they dispatch is still recognised as
describing the past rather than arriving as a live tick after the replay is
over. Finally, the seed foreground snapshot no longer runs prompt demotion:
it is the baseline the session was already in, not a transition.

This replaced `suppressNextAttention`, which guessed at the same problem from
the restored state and only armed when it was `idle && !needsAttention` — so an
agent persisted mid-working still announced a phantom completion.

## Alternatives considered

**Filter the replay inside the host and never surface it.** Fixes Silo's own
terminal and leaves every third-party extension with the identical bug and no
way to work around it, since an extension cannot tell replayed bytes from live
ones. It also cannot fix the agents half at all.

**A distinct `T_REPLAY_DATA` frame tag instead of brackets.** Equivalent on the
wire, but every layer would carry two parallel data paths instead of one path
plus a state bit, and a future third category would need a third tag.

**Have the daemon skip replay when the client says it has a persisted buffer.**
Moves a rendering decision into the session host, which has no idea what the
client actually restored, and still leaves the agents service with nothing to
identify agents from.

**Reject protocol version 1 outright.** The smallest change — the mismatch path
already existed — and it would kill every running terminal on every update that
touches the protocol.

## Outcome

Implemented across the pty-host crate, the Tauri seam, the extension host, the
SDK, `core.terminal`, and `agents-service`, with unit and integration tests at
each layer: bracket framing and version negotiation in Rust, `SocketReader`
classification (including an untagged peer and a payload split across reads),
per-listener `includeReplay` fan-out, the terminal's paint decision, and the
agents service's identity-without-attention behavior.

The durable decision is recorded in
[ADR 0049](../decisions/0049-replay-is-tagged-not-filtered.md); `Replay` and
`Live Output` are in [the glossary](../domain-language.md); the public surface
is on the roadmap and in the `ctx` reference.

**Not done here:** the temporary `ws_switch_*` / `ui_data_rate` instrumentation
that made this diagnosable was deliberately left out — the `ws_switch_*` phase
trace in particular is worth reintroducing as a considered change, since Output
dies with the webview and a durable trail is the only thing that survives a
kill. Related open issues, all untouched: #378 (surface write-queue-full /
backpressure to the UI), #377 (restoring terminals waits the full budget when
inactive tabs do not mount), #497 (PTY writes silently truncated after a
one-second deadline).
