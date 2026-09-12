/**
 * The live-Chat-session half of `ctx.agents` (RFC 0038 phase 2).
 *
 * `agents-service.ts` owns Terminal sessions (one entry per tracked terminal,
 * fed by OSC/foreground detection). A **Chat session** has no terminal and no
 * detection — it is an Agent Client Protocol child whose `AgentInfo` is
 * *reported* by `acp-sessions-service.ts` as the connection progresses. This
 * module is the small shared store the two halves meet in: the sessions
 * service writes here, `agents-service.ts` reads here and merges the result
 * into its snapshots, and a single change listener keeps the two in step.
 *
 * Kept separate from `agents-service.ts` (rather than a second `Map` inside it)
 * so the sessions service can register a session without importing the whole
 * detection stack — and so there is no import cycle between the two.
 */

import type { AgentInfo } from "@silo-code/sdk";

/** Host-owned controls for one Chat session, invoked by `ctx.agents.reveal` /
 *  `ctx.agents.resume` when they resolve to a Chat session. Both optional — a
 *  session with no `resume` control simply cannot be resumed through Silo. */
export interface ChatSessionControls {
  /** Bring the session's own UI into view — supplied by whoever called
   *  `ctx.agents.sessions.connect()` as `options.reveal` (the bundled Chat
   *  panel passes `api.setActive()`). Absent for a session whose UI Silo does
   *  not own, in which case `reveal(id)` only activates the workspace. */
  reveal?(): void;
  /** Spawn a fresh agent process and `session/load` the conversation back
   *  (RFC 0038 phase 4). Only present when the agent advertised `session/load`. */
  resume?(): void | Promise<void>;
}

interface Entry {
  info: AgentInfo;
  controls: ChatSessionControls;
}

const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

/** Every live Chat session's `AgentInfo`, newest registration last. The
 *  returned objects are the stored ones — stable between unrelated changes, so
 *  `agents-service.ts`'s by-reference snapshot diffing works. */
export function chatAgentInfos(): AgentInfo[] {
  return Array.from(entries.values(), (e) => e.info);
}

export function getChatAgentEntry(id: string): Readonly<Entry> | undefined {
  return entries.get(id);
}

/** Register (or replace) a Chat session. */
export function registerChatAgent(
  info: AgentInfo,
  controls: ChatSessionControls = {},
): void {
  entries.set(info.id, { info, controls });
  emit();
}

/** Patch a registered session's `AgentInfo`. A no-op for an unknown id (the
 *  session was disposed). Pass `attentionSince: undefined` to clear it. */
export function patchChatAgent(id: string, patch: Partial<AgentInfo>): void {
  const e = entries.get(id);
  if (!e) return;
  e.info = { ...e.info, ...patch };
  emit();
}

/** Swap a session's host controls without touching its `AgentInfo` — used when
 *  {@link ChatSessionControls.resume} replaces the underlying connection. */
export function setChatAgentControls(
  id: string,
  controls: ChatSessionControls,
): void {
  const e = entries.get(id);
  if (!e) return;
  e.controls = controls;
}

export function removeChatAgent(id: string): void {
  if (entries.delete(id)) emit();
}

/** Fires after any register / patch / remove. `agents-service.ts` subscribes
 *  once to re-run its `notify()`. */
export function onChatAgentsChanged(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Tests only — drop every registered session so one case can't leak into the
 *  next. Deliberately leaves {@link onChatAgentsChanged} listeners in place:
 *  `agents-service.ts` subscribes once at module load, and clearing that would
 *  silently sever Chat sessions from `ctx.agents` for the rest of the run. */
export function resetChatAgentRegistry(): void {
  entries.clear();
}
