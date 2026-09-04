/**
 * The webview half of the Control API's wire contract (RFC 0034).
 *
 * The Rust listener owns the socket, the envelope and the allowlist; this side
 * owns the handlers. What crosses between them is these three shapes, so they
 * are declared once rather than inline at each handler.
 */

/** The **closed** error vocabulary (RFC 0034 R4), mirroring `ErrorCode` in
 *  `src-tauri/src/commands/control/envelope.rs`.
 *
 *  A handler may only refuse with one of these. The Rust side refuses to
 *  deserialize anything else, so a code invented here would not reach the caller
 *  as a new code — it would time out. `invalid-args` is deliberately absent from
 *  a handler's reach: it is decided client-side, before any instance is
 *  contacted, and never travels the wire. */
export type ControlErrorCode =
  | "not-found"
  | "denied"
  | "timeout"
  | "failed"
  | "internal";

/** One request, as the host emits it on `control://request`. */
export interface ControlRequestEvent {
  /** The host's correlation id. Echoed back verbatim on `control://reply`. */
  id: number;
  /** The allowlisted op name — the host has already refused anything else. */
  op: string;
  args: Record<string, unknown>;
  /** The calling shell's canonicalized working directory. */
  cwd: string;
}

/**
 * A handler's answer: `data` on success, or a classified refusal.
 *
 * Deliberately not a thrown exception — a handler that throws is a handler that
 * timed out from the caller's point of view, and RFC 0034 exists to stop
 * commands failing as silence.
 */
export type ControlResult =
  | { ok: true; data: unknown }
  | { ok: false; code: ControlErrorCode; message: string };

/** A success carrying `data`. */
export function ok(data: unknown): ControlResult {
  return { ok: true, data };
}

/** A classified refusal. */
export function fail(code: ControlErrorCode, message: string): ControlResult {
  return { ok: false, code, message };
}
