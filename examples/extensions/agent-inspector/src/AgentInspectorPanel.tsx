import { useEffect, useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import type {
  AgentInfo,
  ExtensionContext,
  WorkspaceState,
} from "@silo-code/sdk";

interface Props {
  ctx: ExtensionContext;
}

/** Which workspaces' agents to show. `ctx.agents` itself only knows
 * "active workspace" vs "every tracked terminal regardless of workspace" —
 * "open"/"closed" are a client-side filter over the latter, cross-referenced
 * against `ctx.workspaces`' own open/closed split. A *closed* workspace's
 * terminals keep running in the background (closing is soft — see
 * `Workspace.closedAt`'s doc comment), so `ctx.agents` still tracks them;
 * this scope just lets you look at that slice specifically. */
type Scope = "current" | "open" | "closed" | "all";

// useServiceState (the SDK's blessed hook) only supports no-arg getState()/
// subscribe() — it can't thread the { allWorkspaces } option through, so the
// hook here re-subscribes manually whenever the scope needs the wider fetch.
function useAgentState(ctx: ExtensionContext, scope: Scope): AgentInfo[] {
  const allWorkspaces = scope !== "current";
  const [state, setState] = useState<AgentInfo[]>(() =>
    ctx.agents.getState({ allWorkspaces }),
  );

  useEffect(() => {
    setState(ctx.agents.getState({ allWorkspaces }));
    const sub = ctx.agents.subscribe(setState, { allWorkspaces });
    return () => sub.dispose();
  }, [ctx, allWorkspaces]);

  return state;
}

function useWorkspaceState(ctx: ExtensionContext): WorkspaceState {
  const [state, setState] = useState<WorkspaceState>(() =>
    ctx.workspaces.getState(),
  );

  useEffect(() => {
    setState(ctx.workspaces.getState());
    const sub = ctx.workspaces.subscribe(setState);
    return () => sub.dispose();
  }, [ctx]);

  return state;
}

const SCOPE_STORAGE_KEY = "scope";

export function AgentInspectorPanel({ ctx }: Props) {
  // A UI preference, not workspace-specific data — global scope, so it's
  // remembered the same way regardless of which workspace happens to be
  // active when you reopen this panel.
  const [scope, setScopeState] = useState<Scope>(() =>
    ctx.storage.global.get<Scope>(SCOPE_STORAGE_KEY, "current"),
  );
  function setScope(next: Scope) {
    setScopeState(next);
    ctx.storage.global.set(SCOPE_STORAGE_KEY, next);
  }
  const agents = useAgentState(ctx, scope);
  const workspaces = useWorkspaceState(ctx);

  // Tracks the currently active terminal so its row can be highlighted
  // (see AgentRow's ai-row--active) — seeded from getActive() since
  // subscribeActive only reports *changes*, not the terminal that's already
  // active when this panel mounts. Deliberately does *not* call
  // ctx.agents.acknowledge() on focus — that's what the per-row Ack button
  // is for (and matches the host policy: acknowledge is consumer-driven,
  // not auto-on-view).
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(() =>
    ctx.terminals.getActive(),
  );

  useEffect(() => {
    const sub = ctx.terminals.subscribeActive((terminalId) => {
      setActiveTerminalId(terminalId);
    });
    return () => sub.dispose();
  }, [ctx]);

  const visible = useMemo(() => {
    if (scope === "current" || scope === "all") return agents;
    const ids = new Set(
      (scope === "open" ? workspaces.open : workspaces.closed).map((w) => w.id),
    );
    return agents.filter((a) => ids.has(a.workspaceId));
  }, [agents, workspaces, scope]);

  return (
    <div className="ai-panel">
      <div className="ai-toolbar">
        <select
          className="ai-scope-select"
          value={scope}
          onChange={(e) => setScope(e.target.value as Scope)}
          aria-label="Workspace scope"
        >
          <option value="current">Current workspace</option>
          <option value="open">Open workspaces</option>
          <option value="closed">Closed workspaces</option>
          <option value="all">All workspaces</option>
        </select>
      </div>

      {visible.length === 0 ? (
        <div className="ai-empty">
          <p>No tracked terminals.</p>
          <p>Open a terminal to see its agent activity here.</p>
        </div>
      ) : (
        <div className="ai-list">
          {visible.map((a) => (
            <AgentRow
              key={a.terminalId}
              agent={a}
              ctx={ctx}
              isActive={a.terminalId === activeTerminalId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AgentRow({
  agent,
  ctx,
  isActive,
}: {
  agent: AgentInfo;
  ctx: ExtensionContext;
  isActive: boolean;
}) {
  const isDead = agent.activity === "dead";
  // ctx.processes is a separate, unrelated SDK service (not ctx.agents) — its
  // sessionId is the PTY backend's own session id, e.g. what a
  // `--session-host silo-<prefix>` process argument is derived from. Shown
  // distinctly from agent.sessionId (the resolved Claude conversation id,
  // when present) so the two "session id" concepts don't get confused.
  const ptySessionId = ctx.processes.getByTerminalId(
    agent.terminalId,
  )?.sessionId;

  // ctx.workspaces.activate reopens a closed workspace too (its own doc
  // comment: "Activate (and reopen if closed)"), so this works uniformly
  // regardless of which scope filter found this row — including the
  // "Closed workspaces" case. ctx.terminals.focus then switches to that
  // workspace *and* activates the terminal's own tab in one call; calling
  // activate() first just makes the reopen-if-closed step explicit rather
  // than relying on focus() to also handle it.
  function openAndFocus() {
    ctx.workspaces.activate(agent.workspaceId);
    ctx.terminals.focus(agent.terminalId);
  }

  // A real <button> can't contain another interactive <button> (the "Ack"
  // one below) — HTML disallows nested interactive elements. This is the
  // standard workaround: a div with button semantics/keyboard handling
  // wired manually, so it stays fully keyboard-operable (Tab to it, Enter/
  // Space to activate) while still allowing a real nested button for the
  // secondary action.
  function handleRowKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openAndFocus();
    }
  }

  return (
    <div
      className={`ai-row ${isDead ? "ai-row--dead" : ""} ${isActive ? "ai-row--active" : ""}`}
      role="button"
      tabIndex={0}
      onClick={openAndFocus}
      onKeyDown={handleRowKeyDown}
    >
      <div className="ai-row-header">
        <span
          className={`ai-dot ai-dot--${agent.activity}`}
          aria-hidden="true"
        />
        <span className="ai-terminal-id">{agent.terminalId}</span>
        <span className="ai-activity">{agent.activity}</span>
        {agent.stale && (
          <span className="ai-badge ai-badge--stale">unconfirmed</span>
        )}
        {agent.needsAttention && (
          <>
            <span className="ai-badge ai-badge--attention">
              needs attention
            </span>
            <button
              type="button"
              className="ai-ack-button"
              // Stop the click from also bubbling up to the row's own
              // onClick (which would open+focus the terminal) — this button
              // is a distinct action, not a shortcut to that one.
              onClick={(e) => {
                e.stopPropagation();
                ctx.agents.acknowledge(agent.terminalId);
              }}
            >
              Ack
            </button>
          </>
        )}
      </div>

      <div className="ai-row-meta">
        <span>kind: {agent.kind}</span>
        <span>isAgent: {String(agent.isAgent)}</span>
        {agent.agentName && (
          <span>
            agent: {agent.agentName}
            {agent.agentId && ` (${agent.agentId})`}
          </span>
        )}
        {ptySessionId && <span>PTY session: {ptySessionId}</span>}
        {agent.workingSince && <span>working since {agent.workingSince}</span>}
        {agent.attentionSince && (
          <span>attention since {agent.attentionSince}</span>
        )}
      </div>

      {/* Shown for every entry that has them (live or dead) — this is what
       * lets the resolve-at-start-and-persist path be verified without any
       * restart: open a Claude terminal and watch these populate. */}
      {(agent.sessionId || agent.resumeCommand) && (
        <div className={`ai-resume ${isDead ? "ai-resume--dead" : ""}`}>
          {isDead && <div className="ai-resume-callout">Session ended</div>}
          {agent.agentName && (
            <div className="ai-resume-line">{agent.agentName}</div>
          )}
          {agent.sessionId && (
            <div className="ai-resume-line ai-resume-mono">
              Session: {agent.sessionId}
            </div>
          )}
          {agent.resumeCommand && (
            <div className="ai-resume-line ai-resume-mono">
              {agent.resumeCommand}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
