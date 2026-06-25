import { useEffect, useState } from "react";
import type { WorkspaceSectionProps } from "@silo-code/sdk";
import type { ExtensionContext } from "@silo-code/sdk";

const STYLE_ID = "silo-workspace-section-demo-styles";
const STYLES = `
.wsd-section {
  margin-top: 4px;
  font-family: var(--silo-font-ui);
  font-size: calc(1em - 1.5px);
}
.wsd-heading {
  display: flex;
  align-items: center;
  gap: 4px;
  font-weight: 600;
  color: var(--silo-color-text-hi);
  cursor: pointer;
  user-select: none;
  margin-bottom: 2px;
}
.wsd-heading:hover {
  color: var(--silo-color-text-hi);
  opacity: 0.8;
}
.wsd-chevron {
  display: inline-block;
  font-size: 0.75em;
  transition: transform 120ms ease;
  color: var(--silo-color-text-lo);
}
.wsd-chevron[data-open="true"] {
  transform: rotate(90deg);
}
.wsd-row {
  display: flex;
  align-items: center;
  color: var(--silo-color-text-lo);
  min-width: 0;
  padding: 1px 0;
}
.wsd-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
`;

export function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = STYLES;
  document.head.appendChild(el);
}

export function removeStyles(): void {
  document.getElementById(STYLE_ID)?.remove();
}

export function makeTerminalSummarySection(ctx: ExtensionContext) {
  return function TerminalSummarySection({
    workspaceId,
  }: WorkspaceSectionProps) {
    const [terminals, setTerminals] = useState(
      () => ctx.workspaces.get(workspaceId)?.terminals ?? [],
    );
    const [open, setOpen] = useState(true);

    useEffect(() => {
      const sub = ctx.workspaces.subscribe(() => {
        setTerminals(ctx.workspaces.get(workspaceId)?.terminals ?? []);
      });
      return () => sub.dispose();
    }, [workspaceId]);

    if (terminals.length === 0) return null;

    return (
      <div className="wsd-section">
        <div className="wsd-heading" onClick={() => setOpen((o) => !o)}>
          <span className="wsd-chevron" data-open={String(open)}>
            ▶
          </span>
          Terminals ({terminals.length})
        </div>
        {open &&
          terminals.map((t) => (
            <div key={t.id} className="wsd-row">
              <span className="wsd-label">{t.customName ?? t.title}</span>
            </div>
          ))}
      </div>
    );
  };
}
