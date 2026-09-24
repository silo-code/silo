import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { confirm } from "./modal-service";
import { chatAgentInfos } from "./agents/chat-agent-registry";

// Warns before a close/quit cancels a chat agent that is actively mid-turn.
// The window close button, Cmd+Q, and the app menu's Quit item (see
// `menu-items.ts`) all funnel through Tauri's `WindowEvent::CloseRequested` on
// the Rust side (`apps/desktop/src-tauri/src/lib.rs`), which prevents the close
// and emits `agent-close-warning` whenever at least one ACP child process is
// alive — a cheap, synchronous registry check with no round trip here. But
// "connected" isn't the same as "working": a connected-but-idle chat session
// costs the user nothing to lose, so the actual decision to bother them lives
// here, keyed on `activity === "working"` (the finer-grained state Rust has no
// visibility into). No agent working → this closes the app itself, silently,
// finishing the close Rust only paused. This refines, not reverses, the "don't
// gate the OS close button" decision documented in `main.tsx` — that reasoning
// holds for the general case (unsaved edits already have durable backups); it
// doesn't hold for a running agent turn, which has no such fallback.

let initialized = false;

/** Call once at startup (desktop only). */
export function initAgentCloseGuard(): void {
  if (initialized) return;
  initialized = true;
  void listen("agent-close-warning", () => {
    void handleCloseWarning();
  });
}

/** Wording for the close-confirmation body. Only ever called for `runningCount
 *  >= 1` — {@link handleCloseWarning} finishes the close silently otherwise. */
export function describeCloseWarning(runningCount: number): string {
  return runningCount === 1
    ? "1 chat agent is currently running. Closing Silo will cancel it."
    : `${runningCount} chat agents are currently running. Closing Silo will cancel them.`;
}

async function handleCloseWarning(): Promise<void> {
  const running = chatAgentInfos().filter(
    (a) => a.activity === "working",
  ).length;
  if (running === 0) {
    // Rust paused the close because a connection exists, but nothing on it is
    // actually mid-turn — nothing would be lost, so finish the close without
    // bothering the user.
    await invoke("force_quit");
    return;
  }
  const proceed = await confirm({
    title: "Close Silo?",
    body: describeCloseWarning(running),
    confirmLabel: "Close Anyway",
    cancelLabel: "Cancel",
    danger: true,
  });
  if (proceed) await invoke("force_quit");
}
