// Deciding what to paint when a terminal re-attaches (RFC 0036).
//
// Two sources want to put the same history on screen:
//
//   1. The persisted `SerializeAddon` buffer this panel saved on its way out,
//      restored with `term.write(restored)` on attach.
//   2. The session host's ring, replayed over the wire when we attach to a
//      session that was already running.
//
// Painting both writes the same content twice. The second copy is up to 256KB
// of agent TUI escape sequences per terminal — full-screen redraws, the
// expensive kind — and with several agent terminals re-attaching at once it
// took the renderer from ~450MB to ~1.7GB in a few seconds and wedged the app
// (issue #500). But the replay is not redundant in general: when there is no
// persisted buffer it is the *only* scrollback there is.

/**
 * Whether a chunk of output should be written to the xterm instance.
 *
 * @param replay - Whether the session host is replaying this chunk from its
 *   ring (as opposed to the session producing it just now).
 * @param restoredFromBuffer - Whether this attach already wrote a non-empty
 *   persisted buffer to the terminal.
 */
export function shouldPaintChunk(
  replay: boolean,
  restoredFromBuffer: boolean,
): boolean {
  // Live output always paints.
  if (!replay) return true;
  // Replayed history paints only when nothing else supplied the scrollback.
  return !restoredFromBuffer;
}
