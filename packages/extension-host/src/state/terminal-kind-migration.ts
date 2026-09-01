import type { WorkspaceInternal } from "./types";

// RFC 0033: `TerminalKind`'s `"claude"` / `"pi"` values are deprecated. Nothing
// creates them any more, so a persisted record carrying one is normalized to
// `"shell"` at load — no `profileId` is synthesized (the terminal already
// exists and its launch already happened; a reference invented here would be
// fiction).
//
// Consequence, deliberate and documented (RFC 0033 R9): such a terminal no
// longer seeds `isAgent: true` from its kind via `initialState(kind)` in
// `agent-activity-model.ts`; it acquires agent identity by detection (ADR 0028)
// like every other terminal. Almost certainly unobservable — no in-repo call
// site has ever created such a record.
//
// Idempotent: a record already `"shell"` is returned untouched (same object),
// so nothing is needlessly rewritten.

/**
 * Normalize any deprecated terminal kind (`"claude"` / `"pi"`) on a workspace
 * record's terminals to `"shell"`. Returns the same object when nothing
 * changed.
 */
export function normalizeTerminalKinds(
  ws: WorkspaceInternal,
): WorkspaceInternal {
  const hasDeprecated = ws.terminals.some(
    (t) => t.kind === "claude" || t.kind === "pi",
  );
  if (!hasDeprecated) return ws;
  return {
    ...ws,
    terminals: ws.terminals.map((t) =>
      t.kind === "claude" || t.kind === "pi" ? { ...t, kind: "shell" } : t,
    ),
  };
}
