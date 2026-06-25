import type {
  Extension,
  ExtensionContext,
  WorkspaceStatusRow,
  TerminalTabDecoration,
} from "@silo-code/sdk";
import { TerminalMonitorPanel } from "./TerminalMonitorPanel";
import type { IconChoice } from "./types";

const STYLE_ID = "silo-terminal-monitor-styles";

// OSC 0 title encoding used by Claude Code (and compatible agent CLIs):
// - Braille block characters (U+2800–U+28FF) as the first character → agent is busy/running
// - ✳ (U+2733) as the first character → agent is idle, waiting for input
const BRAILLE_START = 0x2800;
const BRAILLE_END = 0x28ff;
const IDLE_CHAR = "\u2733"; // ✳

// OSC 9 progress protocol (ConEmu / Windows Terminal / GitHub Copilot CLI):
// Payload format: "4;<state>" or "4;<state>;<progress>"
// Copilot emits state=3 while running and state=0 when done;
// we treat states 1/2/3 as working and 0/4 as waiting.
const OSC9_PROGRESS_PREFIX = "4;";

// OSC 133 shell integration protocol (FTCS / iTerm2 / zsh/bash with shell integration):
// A=prompt start, B=command entered, C=command output start, D[;exit]=command done
// C → working, A/D → waiting (at prompt)
const OSC133_WORKING = "C"; // output started — command is running
const OSC133_IDLE_A = "A"; // prompt mark — shell is idle

function choiceToStatus(
  choice: IconChoice | undefined,
): WorkspaceStatusRow["status"] {
  switch (choice) {
    case "working":
      return "busy";
    case "waiting":
      return "warn";
    case "done":
      return "ok";
    case "error":
      return "error";
    default:
      return undefined;
  }
}

function choiceToTabDecoration(
  choice: IconChoice,
): TerminalTabDecoration | null {
  switch (choice) {
    case "working":
      return { icon: <SpinnerIcon />, color: "accent", tooltip: "Working" };
    case "waiting":
      return {
        icon: <WaitingIcon />,
        color: "warn",
        tooltip: "Waiting for input",
      };
    case "done":
      return { icon: <DoneIcon />, color: "ok", tooltip: "Done" };
    case "error":
      return { icon: <ErrorIcon />, color: "error", tooltip: "Error" };
    default:
      return null;
  }
}

function activate(ctx: ExtensionContext) {
  const iconChoices = new Map<string, IconChoice>();
  // Terminals where the user has explicitly chosen a status — auto-detection
  // will not overwrite these.
  const manualOverrides = new Set<string>();
  // Disposables for per-terminal OSC subscriptions, keyed by terminal id.
  const oscSubs = new Map<string, { dispose(): void }>();
  // Per-terminal debounce timers for OSC 133 "working" → "waiting" fallback.
  // Some agents (e.g. pi) emit 133;C for each step but never emit 133;A/D on
  // completion. When the stream goes silent for SHELL_IDLE_MS we clear to waiting.
  const SHELL_IDLE_MS = 3_000;
  const shellIdleTimers = new Map<string, ReturnType<typeof setTimeout>>();

  function clearShellIdleTimer(terminalId: string) {
    const t = shellIdleTimers.get(terminalId);
    if (t !== undefined) {
      clearTimeout(t);
      shellIdleTimers.delete(terminalId);
    }
  }

  function scheduleShellIdle(terminalId: string) {
    clearShellIdleTimer(terminalId);
    shellIdleTimers.set(
      terminalId,
      setTimeout(() => {
        shellIdleTimers.delete(terminalId);
        setAutoStatus(terminalId, "waiting");
      }, SHELL_IDLE_MS),
    );
  }

  function setIconChoice(terminalId: string, choice: IconChoice) {
    if (choice === "none") {
      iconChoices.delete(terminalId);
      manualOverrides.delete(terminalId);
    } else {
      iconChoices.set(terminalId, choice);
      manualOverrides.add(terminalId);
    }
    ctx.workspaces.invalidateDecorations();
    ctx.terminals.invalidateTabDecorations();
  }

  function setAutoStatus(terminalId: string, choice: IconChoice | "none") {
    if (manualOverrides.has(terminalId)) return;
    if (choice === "none") {
      iconChoices.delete(terminalId);
    } else {
      iconChoices.set(terminalId, choice);
    }
    ctx.workspaces.invalidateDecorations();
    ctx.terminals.invalidateTabDecorations();
  }

  function subscribeTerminalOsc(terminalId: string) {
    if (oscSubs.has(terminalId)) return;
    const sub = ctx.terminals.subscribeOsc(terminalId, ({ code, payload }) => {
      if (code === 0) {
        // Claude Code / OSC 0 title-based status encoding
        const first = payload.charCodeAt(0);
        if (first >= BRAILLE_START && first <= BRAILLE_END) {
          setAutoStatus(terminalId, "working");
        } else if (payload.startsWith(IDLE_CHAR)) {
          setAutoStatus(terminalId, "waiting");
        }
      } else if (code === 9 && payload.startsWith(OSC9_PROGRESS_PREFIX)) {
        // GitHub Copilot CLI / ConEmu OSC 9;4 progress protocol.
        // Payload: "4;<state>;<progress%>" (progress may be absent).
        // Copilot emits state=3 while actively running and state=0 when done,
        // so we treat states 1/2/3 as working and 0/4 as waiting.
        const state = parseInt(payload.slice(OSC9_PROGRESS_PREFIX.length), 10);
        if (state === 1 || state === 2 || state === 3) {
          setAutoStatus(terminalId, "working");
        } else if (state === 0 || state === 4) {
          setAutoStatus(terminalId, "waiting");
        }
      } else if (code === 133) {
        // OSC 133 shell integration (FTCS / iTerm2 / zsh+bash shell integration).
        // C = command output starting → working; A = prompt shown / D = done → waiting.
        // A and D may carry extra params (e.g. "A;k=s" in kitty protocol), so use startsWith.
        // Some agents (e.g. pi) never emit A/D on completion — scheduleShellIdle() clears
        // the status after SHELL_IDLE_MS of silence following the last C.
        if (payload === OSC133_WORKING) {
          setAutoStatus(terminalId, "working");
          scheduleShellIdle(terminalId);
        } else if (
          payload.startsWith(OSC133_IDLE_A) ||
          payload.startsWith("D")
        ) {
          clearShellIdleTimer(terminalId);
          setAutoStatus(terminalId, "waiting");
        }
      }
    });
    oscSubs.set(terminalId, sub);
    ctx.subscriptions.push(sub);
  }

  function syncOscSubscriptions() {
    const ws = ctx.workspaces.getState();
    const live = new Set<string>();
    for (const workspace of ws.all) {
      for (const t of workspace.terminals) {
        live.add(t.id);
        subscribeTerminalOsc(t.id);
      }
    }
    // Clean up subscriptions for terminals that no longer exist.
    for (const [id, sub] of oscSubs) {
      if (!live.has(id)) {
        sub.dispose();
        oscSubs.delete(id);
        iconChoices.delete(id);
        manualOverrides.delete(id);
        clearShellIdleTimer(id);
      }
    }
  }

  ctx.subscriptions.push(
    ctx.workspaces.subscribe(() => {
      ctx.workspaces.invalidateDecorations();
      syncOscSubscriptions();
    }),
  );

  // Subscribe to any terminals already open at activation time.
  syncOscSubscriptions();

  ctx.subscriptions.push(
    ctx.workspaces.registerDecoration({
      id: "silo.terminal-monitor.workspace",
      provide(workspaceId): WorkspaceStatusRow[] {
        const ws = ctx.workspaces.get(workspaceId);
        if (!ws) return [];
        return ws.terminals.map((t) => ({
          id: t.id,
          label: t.customName ?? t.title,
          status: choiceToStatus(iconChoices.get(t.id)),
        }));
      },
    }),
  );

  ctx.subscriptions.push(
    ctx.terminals.registerTabDecoration({
      id: "silo.terminal-monitor.tab",
      provide(terminalId): TerminalTabDecoration | null {
        const choice = iconChoices.get(terminalId);
        if (!choice) return null;
        return choiceToTabDecoration(choice);
      },
    }),
  );

  ctx.subscriptions.push(
    ctx.registerSidePanel({
      id: "silo.terminal-monitor",
      location: "right",
      title: "Terminals",
      order: 10,
      lazyMount: true,
      component: () => (
        <TerminalMonitorPanel
          ctx={ctx}
          iconChoices={iconChoices}
          setIconChoice={setIconChoice}
        />
      ),
    }),
  );

  injectStyles();
}

function deactivate() {
  document.getElementById(STYLE_ID)?.remove();
}

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .tm-panel { padding: 8px 0; }
    .tm-panel-empty {
      padding: 24px 16px;
      font-family: var(--silo-font-ui);
      font-size: var(--silo-font-size-sm);
      color: var(--silo-color-text-lo);
    }
    .tm-terminal-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      border-bottom: 1px solid var(--silo-color-border);
    }
    .tm-terminal-info {
      flex: 1;
      min-width: 0;
      border-radius: var(--silo-radius-sm);
      padding: 2px 4px;
      margin: -2px -4px;
    }
    .tm-terminal-info--clickable {
      cursor: pointer;
    }
    .tm-terminal-info--clickable:hover {
      background: var(--silo-color-bg-hover);
    }
    .tm-terminal-info--clickable:focus-visible {
      outline: 2px solid var(--silo-color-accent);
      outline-offset: 1px;
    }
    .tm-terminal-title {
      display: block;
      font-family: var(--silo-font-ui);
      font-size: var(--silo-font-size-sm);
      color: var(--silo-color-text-hi);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .tm-terminal-osc {
      display: block;
      margin-top: 1px;
      font-family: var(--silo-font-ui);
      font-size: calc(var(--silo-font-size-sm) - 1px);
      color: var(--silo-color-text-lo);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .tm-terminal-workspace {
      display: block;
      margin-top: 1px;
      font-family: var(--silo-font-ui);
      font-size: calc(var(--silo-font-size-sm) - 1px);
      color: var(--silo-color-text-lo);
    }
    .tm-icon-select {
      flex-shrink: 0;
      appearance: none;
      background: var(--silo-color-bg-2);
      border: 1px solid var(--silo-color-border);
      border-radius: var(--silo-radius-sm);
      color: var(--silo-color-text-hi);
      font-family: var(--silo-font-ui);
      font-size: var(--silo-font-size-sm);
      padding: 2px 4px;
      cursor: pointer;
    }
    .tm-icon-select:hover {
      border-color: var(--silo-color-border-hi);
    }
    /* Tab decoration icons */
    .tm-spinner {
      width: 12px; height: 12px;
      border: 1.5px solid currentColor;
      border-top-color: transparent;
      border-radius: 50%;
      animation: tm-spin 0.7s linear infinite;
    }
    @keyframes tm-spin { to { transform: rotate(360deg); } }
    .tm-waiting-icon { display: flex; gap: 2px; align-items: center; }
    .tm-waiting-icon span {
      display: block; width: 2.5px; height: 8px;
      background: currentColor; border-radius: 1px;
    }
  `;
  document.head.appendChild(style);
}

function SpinnerIcon() {
  return <div className="tm-spinner" aria-hidden="true" />;
}
function WaitingIcon() {
  return (
    <div className="tm-waiting-icon" aria-hidden="true">
      <span />
      <span />
    </div>
  );
}
function DoneIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        d="M10 3L5 9 2 6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
function ErrorIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M6 1a5 5 0 1 0 0 10A5 5 0 0 0 6 1zm-.5 2.5h1v4h-1v-4zm0 5h1v1h-1v-1z" />
    </svg>
  );
}

export const extension: Extension = {
  id: "silo.terminal-monitor",
  activate,
  deactivate,
};
