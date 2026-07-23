import { useEffect, useState } from "react";
import type { AgentInfo, ExtensionContext } from "@silo-code/sdk";

interface Props {
  ctx: ExtensionContext;
}

// useServiceState (the SDK's blessed hook) only supports no-arg getState()/
// subscribe() — it can't thread the { allWorkspaces } option through, so the
// toggle here re-subscribes manually whenever it flips.
function useAgentState(
  ctx: ExtensionContext,
  allWorkspaces: boolean,
): AgentInfo[] {
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

export function AgentInspectorPanel({ ctx }: Props) {
  const [allWorkspaces, setAllWorkspaces] = useState(false);
  const agents = useAgentState(ctx, allWorkspaces);

  return (
    <div className="ai-panel">
      <div className="ai-toolbar">
        <label className="ai-toggle">
          <input
            type="checkbox"
            checked={allWorkspaces}
            onChange={(e) => setAllWorkspaces(e.target.checked)}
          />
          All workspaces
        </label>
      </div>

      {agents.length === 0 ? (
        <div className="ai-empty">
          <p>No tracked terminals.</p>
          <p>Open a terminal to see its agent activity here.</p>
        </div>
      ) : (
        <div className="ai-list">
          {agents.map((a) => (
            <AgentRow key={a.terminalId} agent={a} ctx={ctx} />
          ))}
        </div>
      )}
    </div>
  );
}

function AgentRow({ agent, ctx }: { agent: AgentInfo; ctx: ExtensionContext }) {
  const isDead = agent.activity === "dead";
  // ctx.processes is a separate, unrelated SDK service (not ctx.agents) — its
  // sessionId is the PTY backend's own session id, e.g. what a
  // `--session-host silo-<prefix>` process argument is derived from. Shown
  // distinctly from agent.sessionId (the resolved Claude conversation id,
  // when present) so the two "session id" concepts don't get confused.
  const ptySessionId = ctx.processes.getByTerminalId(
    agent.terminalId,
  )?.sessionId;

  return (
    <div className={`ai-row ${isDead ? "ai-row--dead" : ""}`}>
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
          <span className="ai-badge ai-badge--attention">needs attention</span>
        )}
      </div>

      <div className="ai-row-meta">
        <span>kind: {agent.kind}</span>
        <span>isAgent: {String(agent.isAgent)}</span>
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
              Claude session: {agent.sessionId}
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
