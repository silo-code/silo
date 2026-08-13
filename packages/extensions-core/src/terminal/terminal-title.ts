/**
 * Pure title-derivation rules for a terminal tab, factored out of
 * `TerminalPanel` so they're unit-testable (the component stays glue: it feeds
 * live signals in and writes the result to dockview + the terminal record).
 *
 * The priority order is RFC 0010's, plus one rule the reattach path needs:
 *
 *   1. a user-assigned name (right-click → Rename) — always wins;
 *   2. a title the program pushed via an OSC 0/1/2 escape sequence (e.g. Claude
 *      Code), dropped once the host says we're back at a prompt (N1a);
 *   3. a running program with no OSC title of its own → its process name (N1b),
 *      **unless a restored title is still standing** (see below);
 *   4. the tmux status line;
 *   5. back at a prompt with nothing better → the shell's name (N1a's visible
 *      half — this is what clears a stale restored title).
 *
 * The restored-title rule (3) exists because a tab's OSC title does **not**
 * survive a reattach — an app restart or a workspace switch, both of which
 * remount the panel and re-attach the session. The buffer we restore is a
 * serialized *cell* snapshot with no escape sequences in it, and agents only
 * push a title when their status changes: an idle Claude Code sits there for
 * hours without emitting one. So after a reattach `oscTitle` is `""` while the
 * agent is still very much running, and rule 3 would replace the persisted
 * conversation title ("Fix the flaky test") with the bare process name
 * ("claude") — in the tab *and* in `TerminalRecord.title`, destroying it.
 * Keeping the restored title until live evidence supersedes it costs nothing:
 * for a non-agent program (`npm`, `node`) the restored title already *is* the
 * process name, and the moment the program exits, rule 5 takes over.
 */

/** The foreground-process facts rules 3/5 need, as reported by the PTY host. */
export interface TerminalForegroundState {
  /** True when the foreground group is the shell itself (i.e. at a prompt). */
  atPrompt: boolean;
  /** The foreground leader's program name (e.g. `vim`, `node`, `-zsh`). */
  leader: string;
}

/** Everything the rules read. `null`/`""` all mean "no signal yet". */
export interface TitleInputs {
  /** The user-assigned name, when the tab has one. */
  customName?: string;
  /**
   * The OSC title as it should be displayed (already stripped of agent status
   * markers), or `""` when the program hasn't pushed one this mount.
   */
  oscTitle: string;
  /** Foreground state from the host, or `null` until it reports. */
  fg: TerminalForegroundState | null;
  /**
   * The tmux status line's quoted text, `""` when the last row has none. Lazy:
   * scraping the buffer costs a `translateToString`, and rules 1–3 usually
   * answer first.
   */
  tmuxLine: () => string;
  /**
   * The persisted title this mount started with, until live evidence
   * supersedes it; `""` once it has (or when there was none).
   */
  restoredTitle: string;
}

/**
 * Which rule produced a title. `"custom"` is exempt from truncation — a name
 * the user typed is shown as typed.
 */
export type TitleSource = "custom" | "osc" | "process" | "tmux";

export interface DerivedTitle {
  text: string;
  source: TitleSource;
}

/** Shown when a rule produced an empty string. */
export const FALLBACK_TITLE = "Terminal";
/** Auto-derived titles longer than this are ellipsized. */
export const MAX_TITLE_LENGTH = 32;

/** `-zsh` → `zsh`, `/opt/homebrew/bin/node` → `node`. */
export function programName(leader: string): string {
  return (leader.replace(/^-/, "").split("/").pop() ?? leader).trim();
}

/** The quoted text tmux writes into its status line, or `""` if the row has none. */
export function tmuxStatusTitle(row: string): string {
  const match = row.match(/"([^"]*)"/);
  return match ? match[1].trim() : "";
}

/** An auto-derived title as it should appear on the tab. */
export function formatTitle(text: string): string {
  if (!text) return FALLBACK_TITLE;
  return text.length > MAX_TITLE_LENGTH
    ? text.slice(0, MAX_TITLE_LENGTH - 1) + "…"
    : text;
}

/**
 * The title this terminal should show, or `null` to leave the current one
 * alone (no rule matched, or a restored title is still the best answer).
 */
export function deriveTitle(input: TitleInputs): DerivedTitle | null {
  const { customName, oscTitle, fg, restoredTitle } = input;

  if (customName) return { text: customName, source: "custom" };

  const atPrompt = fg !== null && fg.atPrompt; // host says: at a prompt
  const running = fg !== null && !fg.atPrompt; // host says: program running

  if (oscTitle && !atPrompt) return { text: oscTitle, source: "osc" };

  if (running && fg.leader) {
    // A reattached program's title is unknown this mount, not absent — the
    // persisted one is better evidence than its process name.
    if (restoredTitle) return null;
    return { text: programName(fg.leader), source: "process" };
  }

  const tmuxLine = input.tmuxLine();
  if (tmuxLine) return { text: tmuxLine, source: "tmux" };

  if (atPrompt && fg.leader) {
    return { text: programName(fg.leader), source: "process" };
  }

  return null;
}
