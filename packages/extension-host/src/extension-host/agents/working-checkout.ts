/**
 * Where a Chat session is actually working — its **working checkout**.
 *
 * A session's `cwd` is fixed at `session/new` and never revised: the Agent
 * Client Protocol has no working-directory-change notification, and
 * `SessionInfoUpdate` omits `cwd` on the stated premise that it is immutable.
 * Agents relocate anyway — Claude Code's `EnterWorktree` creates a git worktree
 * and reports "The session is now working in the worktree" — so the host
 * watches for that and reports the result as {@link AgentInfo.cwd}, the same
 * field a Terminal session fills from its foreground process.
 *
 * ## Only announcements, deliberately
 *
 * An earlier revision also *inferred* the location from where tool-call
 * `locations` settled. That is gone, and the measurements are the reason.
 * Across 327 recorded sessions containing seven real relocations:
 *
 * - The announcement fired on **5 of 5** sessions that used it, immediately,
 *   before any file was touched.
 * - Inference produced **no true positives at all**. `locations` ride on
 *   `edit`/`read` calls, so a session working through the shell emits none —
 *   three of the seven relocations had zero. What inference did produce was a
 *   third of sessions proposing an ordinary subdirectory, held back only by a
 *   `.git` probe, plus a latent false positive for git submodules.
 *
 * So the honest surface is: report a relocation the agent *states*, and
 * otherwise report the session root. A signal that never once fired correctly
 * is not a safety net, it is a source of wrong answers.
 *
 * The general fix is upstream — `cwd` on `SessionInfoUpdate`, which is what the
 * alignment rule in ACP's own Session Info Update RFD already implies. When
 * that lands it becomes the signal and this module goes away.
 */

import type { AgentSessionUpdate, AgentToolCallContent } from "@silo-code/sdk";

/**
 * Vendor tools that **relocate the session**, keyed on the tool's title.
 *
 * The one vendor-coupled thing in the host's agent layer, and a table rather
 * than a general scrape so the coupling stays visible and finite. Claude Code's
 * `EnterWorktree` announces in a stable sentence (6 occurrences across the
 * sessions examined, all one template), and `ExitWorktree` answers "Exited and
 * removed worktree at …". The exit is matched on its **name alone**: the
 * destination is always the session root, so there is nothing to extract and
 * one less thing to break when the wording moves.
 *
 * Read from the call's **modelled content blocks**, never `rawOutput` — the
 * announcement arrives as an ordinary content block, so this stays inside the
 * rule that only modelled fields are read.
 *
 * No other agent has an equivalent. Cursor and Codex sessions simply report
 * their session root, which is accurate; they are not silently wrong.
 */
const ENTER_WORKTREE_TOOL = "EnterWorktree";
const EXIT_WORKTREE_TOOL = "ExitWorktree";

/** `Created worktree at <abs path> on branch <name>. …` */
const ENTER_WORKTREE_PATH = /Created worktree at (\/[^\n]*?) on branch /;

function textOf(content: readonly AgentToolCallContent[] | undefined): string {
  if (!content) return "";
  const out: string[] = [];
  for (const block of content) {
    if (block.type === "content" && block.content?.text) {
      out.push(block.content.text);
    }
  }
  return out.join("\n");
}

/**
 * What a tool call announces: an absolute path the session moved to, `null` for
 * an explicit return to the session root, or `undefined` when the call is not a
 * relocation at all.
 *
 * Keyed on the tool's title, so the same sentence quoted in another tool's
 * output (a `Bash` call that happens to print it) is not a relocation.
 */
export function announcementFrom(
  title: string | undefined,
  content: readonly AgentToolCallContent[] | undefined,
): string | null | undefined {
  if (title === EXIT_WORKTREE_TOOL) return null;
  if (title !== ENTER_WORKTREE_TOOL) return undefined;
  const m = ENTER_WORKTREE_PATH.exec(textOf(content));
  return m ? m[1] : undefined;
}

/**
 * Follows one Chat session's update stream and reports where it says it is
 * working.
 *
 * Stateful because the stream is: a relocation is announced once and holds
 * until the next one. Seeded by replaying a restored session's journal through
 * {@link observe}, so a resumed session knows its location without waiting for
 * the agent to act again.
 */
export function createWorkingCheckoutTracker(sessionRoot: string) {
  /** Title per tool call id. A `tool_call_update` carries only what changed, so
   *  the opening call's title has to be remembered to make sense of the content
   *  that lands later — the shape observed on the wire. */
  const titles = new Map<string, string>();
  /** `undefined` = never announced, `null` = announced a return to the root. */
  let announced: string | null | undefined;

  function observe(update: AgentSessionUpdate): void {
    if (update.kind !== "tool_call" && update.kind !== "tool_call_update") {
      return;
    }
    const call = update.toolCall;
    if (!call?.toolCallId) return;

    const title = call.title || titles.get(call.toolCallId);
    if (title) titles.set(call.toolCallId, title);

    const move = announcementFrom(title, call.content);
    if (move !== undefined) announced = move;
  }

  /**
   * The directory to confirm, or `null` when the session has not announced a
   * move — in which case the caller reports the session root.
   *
   * An announced path outside the session root is honoured: a worktree created
   * with `git worktree add ../name` is a sibling, and the agent named the
   * destination explicitly.
   */
  function announcedCheckout(): string | null {
    return announced && announced !== sessionRoot ? announced : null;
  }

  return { observe, announcedCheckout };
}

export type WorkingCheckoutTracker = ReturnType<
  typeof createWorkingCheckoutTracker
>;
