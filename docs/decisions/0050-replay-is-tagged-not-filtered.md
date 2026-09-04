---
status: accepted
date: 2026-09-03
---

# 0050. Reattach replay is tagged on the wire, not filtered out

## Context

A Silo terminal session outlives the app. Attaching to one that is already
running makes the session daemon replay up to 256KB of its ring buffer so the
client can show what happened while it was away. Until now those bytes went out
as ordinary `T_DATA` frames — byte-for-byte indistinguishable from output the
shell is producing this instant.

Every consumer therefore read a reattach as things happening right now, and two
separate failures followed from that one gap (issue #500):

- `TerminalPanel` painted the replay on top of the scrollback it had already
  restored from its own persisted buffer. Six agent terminals re-attaching at
  once took the renderer from ~450MB to ~1.7GB in seconds and wedged the window
  hard enough to need a kill — WebKit Malloc at 2.3GB across 3.6M live
  allocations, with the JS heap nearly empty.
- `agents-service` read the replay as agent activity: status indicators lit up
  and completion bells fired for turns that had finished before the app started.

The obvious fix — drop the replay before it reaches these consumers — works for
the terminal and fails outright for the agents service, because that service
works out _which_ agent owns a terminal from the same bytes. Filtering silenced
agent detection entirely on every reattached terminal. The data is both the
false signal and the necessary evidence.

## Decision

**The protocol says when bytes were produced; consumers decide what that
means.** Neither the daemon nor the host filters replay on anyone's behalf.

1. The pty-host daemon brackets its ring replay with `T_REPLAY_BEGIN` /
   `T_REPLAY_END` (`PROTO_VERSION` 2). Brackets rather than a second data tag:
   replay is already chunked into many frames, so one state bit beats two
   parallel data paths, and live output that interleaves mid-replay closes and
   reopens the bracket so it always describes exactly the frames inside it.
2. The app accepts a **range** of protocol versions, not one. A daemon forked by
   the previous release keeps serving its sessions on version 1 until they end;
   the client treats an untagged peer's output as entirely live, which is
   exactly the pre-0036 behavior. Rejecting version 1 would have been smaller,
   and would have killed every running terminal on every update that touches the
   protocol — the opposite of what a persistent session host is for.
3. The distinction travels the whole way up: the neutral `Connection` seam
   carries a `SessionReader` yielding classified chunks rather than a bare
   `Read`, and the `terminal_output` event payload carries a `replay` flag.
4. On `ctx`, **replay is opt-in and off by default**. `subscribeOutput`,
   `subscribeOsc`, and `ProcessSession.onData` deliver live output only unless
   the caller passes `{ includeReplay: true }`, in which case each chunk arrives
   with an `OutputOrigin`. Default-off rather than a bare flag, so every
   existing handler — first- and third-party — became correct with no code
   change, while the two consumers that genuinely need the history ask for it.
5. Consumers that opt in split the two uses apart: replayed bytes are
   **identity** evidence, never **activity**. `agents-service` still identifies
   agents from them but never raises attention or rings a bell, and the flag
   rides the idle-debounce timers so a delayed event doesn't sneak back in
   looking live.

## Consequences

- An extension watching terminal output no longer has to know that reattach
  exists. The failure mode this fixes was invisible from inside an extension —
  there was no way to tell replayed bytes from live ones — so it could only be
  fixed at the protocol.
- `PROTO_VERSION` bumps are now cheap. The compatibility range means a bump is
  no longer a decision about whether to strand every live session, which is what
  made the previous single-version check quietly expensive to touch.
- Replay's meaning is a per-consumer decision, so a future consumer has to make
  it deliberately. That is the point; the alternative was every consumer
  silently getting it wrong.
- `suppressNextAttention` is gone. It guessed at this problem from the restored
  state (`idle && !needsAttention`) and so missed an agent persisted mid-working.
  A fact from the wire replaces the heuristic.
- The one thing still inferred is the _boundary_ case where the ring's last byte
  and the session's first live byte split a multi-byte UTF-8 sequence. The
  completed character is attributed to the live chunk. The ring holds whole PTY
  writes, so this is vanishingly rare, and painting a stray glyph beats dropping
  one.

Recorded from RFC 0036; see that proposal for the full design and the evidence
behind the diagnosis.
