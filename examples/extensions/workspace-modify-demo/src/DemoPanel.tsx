import { useEffect, useState } from "react";
import type { ExtensionContext, WorkspaceSectionProps } from "@silo-code/sdk";

// ─── Styles ──────────────────────────────────────────────────────────────────

const STYLE_ID = "silo-workspace-modify-demo-styles";
const STYLES = `
.wmd-panel {
  padding: 12px;
  font-family: var(--silo-font-ui);
  font-size: calc(1em - 1px);
  color: var(--silo-color-text);
}
.wmd-title {
  font-weight: 600;
  color: var(--silo-color-text-hi);
  margin-bottom: 12px;
  font-size: 1em;
}
.wmd-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px solid var(--silo-color-border, rgba(128,128,128,0.15));
}
.wmd-row:last-child {
  border-bottom: none;
}
.wmd-label {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.wmd-label-name {
  font-weight: 500;
  color: var(--silo-color-text-hi);
}
.wmd-label-desc {
  font-size: calc(1em - 1.5px);
  color: var(--silo-color-text-lo);
}
.wmd-toggle {
  position: relative;
  width: 32px;
  height: 18px;
  flex-shrink: 0;
}
.wmd-toggle input {
  opacity: 0;
  width: 0;
  height: 0;
  position: absolute;
}
.wmd-toggle-track {
  position: absolute;
  inset: 0;
  border-radius: 9px;
  background: rgba(128,128,128,0.25);
  cursor: pointer;
  transition: background 150ms ease;
}
.wmd-toggle input:checked + .wmd-toggle-track {
  background: #3b82f6;
}
.wmd-toggle-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  transition: transform 150ms ease;
  pointer-events: none;
}
.wmd-toggle input:checked ~ .wmd-toggle-thumb {
  transform: translateX(14px);
}
/* Demo section rendered in workspace rows */
.wmd-section {
  margin-top: 4px;
  padding: 4px 6px;
  border-radius: 3px;
  font-family: var(--silo-font-ui);
  font-size: calc(1em - 1.5px);
  color: var(--silo-color-text-lo);
  background: color-mix(in srgb, #a78bfa 8%, transparent);
  border: 1px solid color-mix(in srgb, #a78bfa 30%, transparent);
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

// ─── Toggle component ─────────────────────────────────────────────────────────

function Toggle({
  id,
  checked,
  onChange,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="wmd-toggle">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="wmd-toggle-track" />
      <span className="wmd-toggle-thumb" />
    </label>
  );
}

// ─── Demo section component ───────────────────────────────────────────────────

function DemoSection({ workspaceId }: WorkspaceSectionProps) {
  return (
    <div className="wmd-section">
      Demo section — workspace {workspaceId.slice(0, 8)}
    </div>
  );
}

// ─── Main panel ──────────────────────────────────────────────────────────────

export function DemoPanel({ ctx }: { ctx: ExtensionContext }) {
  const [statusOn, setStatusOn] = useState(false);
  const [sectionsOn, setSectionsOn] = useState(false);
  const [badgesOn, setBadgesOn] = useState(false);

  useEffect(() => {
    if (!statusOn) return;
    const d = ctx.workspaces.registerStatus({
      id: "silo.workspace-modify-demo.status",
      provide: () => [
        { id: "demo-ok", status: "ok", label: "Demo: everything looks good" },
        {
          id: "demo-busy",
          status: "busy",
          label: "Demo: task running",
          startedAt: new Date().toISOString(),
        },
      ],
    });
    return () => d.dispose();
  }, [ctx, statusOn]);

  useEffect(() => {
    if (!sectionsOn) return;
    const d = ctx.workspaces.registerSection({
      id: "silo.workspace-modify-demo.section",
      component: DemoSection,
      order: 99,
    });
    return () => d.dispose();
  }, [ctx, sectionsOn]);

  useEffect(() => {
    if (!badgesOn) return;
    const d = ctx.workspaces.registerBadge({
      id: "silo.workspace-modify-demo.badge",
      provide: () => [
        { id: "demo", text: "demo", color: "#60a5fa" },
        { id: "env", text: "dev" },
      ],
    });
    return () => d.dispose();
  }, [ctx, badgesOn]);

  return (
    <div className="wmd-panel">
      <div className="wmd-title">Workspace Modify Demo</div>

      <div className="wmd-row">
        <div className="wmd-label">
          <span className="wmd-label-name">Badges</span>
          <span className="wmd-label-desc">Next to the workspace name</span>
        </div>
        <Toggle id="badges" checked={badgesOn} onChange={setBadgesOn} />
      </div>

      <div className="wmd-row">
        <div className="wmd-label">
          <span className="wmd-label-name">Status rows</span>
          <span className="wmd-label-desc">Status rows below the path</span>
        </div>
        <Toggle id="status" checked={statusOn} onChange={setStatusOn} />
      </div>

      <div className="wmd-row">
        <div className="wmd-label">
          <span className="wmd-label-name">Sections</span>
          <span className="wmd-label-desc">
            Custom content below status rows
          </span>
        </div>
        <Toggle id="sections" checked={sectionsOn} onChange={setSectionsOn} />
      </div>
    </div>
  );
}
