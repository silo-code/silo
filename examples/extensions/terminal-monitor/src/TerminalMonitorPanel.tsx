import { useEffect, useState } from "react";
import type { ExtensionContext } from "@silo-code/sdk";
import type { IconChoice } from "./types";

interface Props {
  ctx: ExtensionContext;
  iconChoices: Map<string, IconChoice>;
  setIconChoice: (terminalId: string, choice: IconChoice) => void;
}

const ICON_OPTIONS: { value: IconChoice; label: string }[] = [
  { value: "none", label: "—" },
  { value: "working", label: "⚡ Working" },
  { value: "waiting", label: "⏸ Waiting" },
  { value: "done", label: "✓ Done" },
  { value: "error", label: "✗ Error" },
];

export function TerminalMonitorPanel({
  ctx,
  iconChoices,
  setIconChoice,
}: Props) {
  const [, setTick] = useState(0);
  useEffect(
    () =>
      ctx.workspaces.subscribeDecorations(() => setTick((t) => t + 1)).dispose,
    [ctx.workspaces],
  );

  const ws = ctx.workspaces.getState();

  const rows: Array<{
    workspaceName: string;
    terminalId: string;
    tabTitle: string;
    oscTitle: string;
  }> = [];

  for (const workspace of ws.all) {
    for (const t of workspace.terminals) {
      rows.push({
        workspaceName: workspace.name,
        terminalId: t.id,
        tabTitle: t.customName ?? t.title,
        oscTitle: t.title,
      });
    }
  }

  if (rows.length === 0) {
    return (
      <div className="tm-panel-empty">
        <p>No terminals open.</p>
      </div>
    );
  }

  return (
    <div className="tm-panel">
      {rows.map(({ workspaceName, terminalId, tabTitle, oscTitle }) => (
        <div key={terminalId} className="tm-terminal-row">
          <div
            className="tm-terminal-info tm-terminal-info--clickable"
            role="button"
            tabIndex={0}
            title="Go to terminal"
            onClick={() => ctx.terminals.focus(terminalId)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ")
                ctx.terminals.focus(terminalId);
            }}
          >
            <span className="tm-terminal-title">{tabTitle}</span>
            {oscTitle !== tabTitle && (
              <span className="tm-terminal-osc">{oscTitle}</span>
            )}
            <span className="tm-terminal-workspace">{workspaceName}</span>
          </div>
          <select
            className="tm-icon-select"
            value={iconChoices.get(terminalId) ?? "none"}
            onChange={(e) =>
              setIconChoice(terminalId, e.target.value as IconChoice)
            }
          >
            {ICON_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}
