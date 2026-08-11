import type { DemoScriptStep } from "./demo-config";
import { isDemoScriptClickStep } from "./demo-config";

/** Cursor settle after click before the next step advances (DemoWorkspace). */
export const SCRIPT_CLICK_RELEASE_MS = 260;
/** Default hover before click when holdMs is omitted (DemoWorkspace). */
export const SCRIPT_DEFAULT_HOLD_MS = 880;
/**
 * How long the cursor takes to glide onto the click target (from the top on
 * first appearance, or from the previous target on later steps). Counts as
 * part of `holdMs` (must be ≤ hold for a pre-click hover).
 */
export const SCRIPT_CURSOR_TRAVEL_MS = 1400;
/** Starting Y (% of demo wrap) when the cursor enters from the top. */
export const SCRIPT_CURSOR_TOP_Y_PCT = 2;

/**
 * Wall-clock length of one linear pass through a script (no loop pause).
 * Must stay in sync with DemoWorkspace's step timers.
 */
export function scriptDurationMs(script: DemoScriptStep[]): number {
  let total = 0;
  for (const step of script) {
    if (isDemoScriptClickStep(step)) {
      total +=
        step.afterMs +
        (step.holdMs ?? SCRIPT_DEFAULT_HOLD_MS) +
        SCRIPT_CLICK_RELEASE_MS;
    } else {
      total += step.afterMs;
    }
  }
  return total;
}

function easeOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - x, 3);
}

/** 0 at enter (top), 1 once the glide onto the target has finished. */
export function cursorTravelProgress(
  arriveAtMs: number,
  seekMs: number,
): number {
  const raw = (seekMs - arriveAtMs) / SCRIPT_CURSOR_TRAVEL_MS;
  return easeOutCubic(raw);
}

/** Cursor pose for a scrubbed / clock-driven playhead. */
export type ScriptCursorPlan = {
  selector: string;
  /**
   * Prior click target to glide from. `null` = enter from the top of the demo.
   */
  fromSelector: string | null;
  clicking: boolean;
  /** 0 = travel start, 1 = on target (eased). */
  travelProgress: number;
};

/** How to rebuild demo UI state for a scrubbed playhead time. */
export type ScriptSeekPlan = {
  nextIndex: number;
  showWorktreeToast: boolean;
  /** Whether `reveal-todos-panel` has already fired. */
  revealTodosPanel: boolean;
  /**
   * Absolute script time when `start-claude-terminal` fired, or null if idle.
   * Codex / Claude transcripts use this as their clock origin.
   */
  claudeTerminalOriginMs: number | null;
  /**
   * Absolute script time when `reveal-codex-tab` fired, or null if hidden.
   */
  codexTerminalOriginMs: number | null;
  /** Click-step selectors that should already have been activated. */
  clicks: string[];
  /** Where the script cursor should sit (null = hidden). */
  cursor: ScriptCursorPlan | null;
  /**
   * Remaining ms before the step at `nextIndex` fires (action or click).
   * Null when the seek is at/past the end of the script.
   */
  delayMs: number | null;
};

function clickHidesWorktreeToast(selector: string): boolean {
  return (
    selector.includes("worktree-toast-dismiss") ||
    selector.includes("worktree-toast-add")
  );
}

/**
 * Map an absolute script time to the demo mutations + next pending step.
 * Used when scrubbing the vignette recorder playhead.
 */
export function planScriptSeek(
  script: DemoScriptStep[],
  seekMs: number,
): ScriptSeekPlan {
  const seek = Math.max(0, seekMs);
  let t = 0;
  let showWorktreeToast = false;
  let revealTodosPanel = false;
  let claudeTerminalOriginMs: number | null = null;
  let codexTerminalOriginMs: number | null = null;
  const clicks: string[] = [];
  let lastClickSelector: string | null = null;

  for (let i = 0; i < script.length; i++) {
    const step = script[i];
    if (!isDemoScriptClickStep(step)) {
      const fireAt = t + step.afterMs;
      if (fireAt <= seek) {
        if (step.action === "show-worktree-toast") showWorktreeToast = true;
        if (step.action === "hide-worktree-toast") showWorktreeToast = false;
        if (step.action === "reveal-todos-panel") revealTodosPanel = true;
        if (step.action === "start-claude-terminal")
          claudeTerminalOriginMs = fireAt;
        if (step.action === "reveal-codex-tab") codexTerminalOriginMs = fireAt;
        t = fireAt;
        continue;
      }
      return {
        nextIndex: i,
        showWorktreeToast,
        revealTodosPanel,
        claudeTerminalOriginMs,
        codexTerminalOriginMs,
        clicks,
        cursor: null,
        delayMs: fireAt - seek,
      };
    }

    const hold = step.holdMs ?? SCRIPT_DEFAULT_HOLD_MS;
    const arriveAt = t + step.afterMs;
    const clickAt = arriveAt + hold;
    const doneAt = clickAt + SCRIPT_CLICK_RELEASE_MS;
    const fromSelector = lastClickSelector;

    if (doneAt <= seek) {
      clicks.push(step.selector);
      if (clickHidesWorktreeToast(step.selector)) showWorktreeToast = false;
      lastClickSelector = step.selector;
      t = doneAt;
      continue;
    }

    if (clickAt <= seek) {
      clicks.push(step.selector);
      if (clickHidesWorktreeToast(step.selector)) showWorktreeToast = false;
      return {
        nextIndex: i + 1,
        showWorktreeToast,
        revealTodosPanel,
        claudeTerminalOriginMs,
        codexTerminalOriginMs,
        clicks,
        cursor: {
          selector: step.selector,
          fromSelector,
          clicking: true,
          travelProgress: 1,
        },
        delayMs: i + 1 < script.length ? doneAt - seek : null,
      };
    }

    if (arriveAt <= seek) {
      return {
        nextIndex: i,
        showWorktreeToast,
        revealTodosPanel,
        claudeTerminalOriginMs,
        codexTerminalOriginMs,
        clicks,
        cursor: {
          selector: step.selector,
          fromSelector,
          clicking: false,
          travelProgress: cursorTravelProgress(arriveAt, seek),
        },
        delayMs: clickAt - seek,
      };
    }

    return {
      nextIndex: i,
      showWorktreeToast,
      revealTodosPanel,
      claudeTerminalOriginMs,
      codexTerminalOriginMs,
      clicks,
      cursor: null,
      delayMs: arriveAt - seek,
    };
  }

  return {
    nextIndex: script.length,
    showWorktreeToast,
    revealTodosPanel,
    claudeTerminalOriginMs,
    codexTerminalOriginMs,
    clicks,
    cursor: null,
    delayMs: null,
  };
}
