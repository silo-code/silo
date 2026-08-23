import { useRef, useState } from "react";
import type { Disposable, Extension, ExtensionContext } from "@silo-code/sdk";
import { Button, Input, List, ListRow } from "@silo-code/sdk";

// An example Silo extension: a side panel that pushes entries into the host
// StatusBar's busy-status slot (`ctx.ui.busyStatus`) and demonstrates the
// error-notification counterpart (`ctx.ui.notify`). Open two or more entries
// to see the numbered badge; click the status line for the popover. Errors
// belong in notifications, not sticky status — the "Notify error" button
// shows why.

/* -------------------------------------------------------------------------- */
/* Styles. A runtime-loaded extension's CSS isn't auto-injected (the host only  */
/* imports the JS bundle), so we inject a <style> on activate and remove it on   */
/* deactivate. Consume only `--silo-*` design tokens so it themes correctly and  */
/* scales with uiFontSize.                                                       */
/* -------------------------------------------------------------------------- */

const STYLE_ID = "silo-busy-status-demo-styles";
const STYLES = `
.busy-status-demo {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  height: 100%;
  box-sizing: border-box;
  font-family: var(--silo-font-ui);
  color: var(--silo-color-text);
}

.busy-status-demo__blurb {
  margin: 0;
  font-size: var(--silo-font-size-sm);
  color: var(--silo-color-text-lo);
  line-height: 1.4;
}

.busy-status-demo__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: var(--silo-font-size-sm);
}

.busy-status-demo__urgency,
.busy-status-demo__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.busy-status-demo__list {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.busy-status-demo__empty {
  color: var(--silo-color-text-lo);
  font-size: var(--silo-font-size-sm);
}

.busy-status-demo__row-label {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.busy-status-demo__meta {
  font-size: var(--silo-font-size-sm);
  color: var(--silo-color-text-lo);
  opacity: 0.7;
}
`;

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = STYLES;
  document.head.appendChild(el);
}

function removeStyles(): void {
  document.getElementById(STYLE_ID)?.remove();
}

/* -------------------------------------------------------------------------- */
/* Contribution: a side panel that pushes/clears busyStatus entries.           */
/* -------------------------------------------------------------------------- */

type LocalEntry = {
  id: string;
  label: string;
  urgency: "normal" | "high";
  disposable: Disposable;
};

function BusyStatusDemoPanel({ ctx }: { ctx: ExtensionContext }) {
  const [label, setLabel] = useState("Restoring terminals…");
  const [urgency, setUrgency] = useState<"normal" | "high">("normal");
  const [entries, setEntries] = useState<LocalEntry[]>([]);
  const seq = useRef(0);

  const push = () => {
    const text = label.trim() || "Busy…";
    const id = `busy-status-demo.${++seq.current}`;
    const disposable = ctx.ui.busyStatus.set({
      id,
      label: text,
      detail: `demo id ${id}`,
      urgency,
    });
    setEntries((prev) => [...prev, { id, label: text, urgency, disposable }]);
  };

  const clearOne = (id: string) => {
    setEntries((prev) => {
      const hit = prev.find((e) => e.id === id);
      hit?.disposable.dispose();
      return prev.filter((e) => e.id !== id);
    });
  };

  const clearAll = () => {
    setEntries((prev) => {
      for (const e of prev) e.disposable.dispose();
      return [];
    });
  };

  const notifyError = () => {
    ctx.ui.notify("error", "2 terminals need reconnect", {
      title: "Terminal restore",
    });
  };

  return (
    <div className="busy-status-demo">
      <p className="busy-status-demo__blurb">
        Pushes entries into the host StatusBar busy-status slot. Open two or
        more to see the numbered badge; click the status line for the popover.
        Errors belong in notifications, not sticky status.
      </p>

      <label className="busy-status-demo__field">
        <span>Label</span>
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") push();
          }}
        />
      </label>

      <div
        className="busy-status-demo__urgency"
        role="group"
        aria-label="Urgency"
      >
        <Button
          variant={urgency === "normal" ? "primary" : "normal"}
          size="sm"
          onClick={() => setUrgency("normal")}
        >
          normal
        </Button>
        <Button
          variant={urgency === "high" ? "primary" : "normal"}
          size="sm"
          onClick={() => setUrgency("high")}
        >
          high
        </Button>
      </div>

      <div className="busy-status-demo__actions">
        <Button variant="primary" size="sm" onClick={push}>
          Push entry
        </Button>
        <Button
          variant="normal"
          size="sm"
          onClick={clearAll}
          disabled={entries.length === 0}
        >
          Clear all
        </Button>
        <Button variant="normal" size="sm" onClick={notifyError}>
          Notify error
        </Button>
      </div>

      <div className="busy-status-demo__list">
        <List aria-label="Active demo entries">
          {entries.length === 0 ? (
            <ListRow>
              <span className="busy-status-demo__empty">No active entries</span>
            </ListRow>
          ) : (
            entries.map((e) => (
              <ListRow
                key={e.id}
                trailing={
                  <Button
                    variant="normal"
                    size="sm"
                    onClick={() => clearOne(e.id)}
                  >
                    Clear
                  </Button>
                }
              >
                <span className="busy-status-demo__row-label">
                  {e.label}
                  <span className="busy-status-demo__meta">
                    {e.urgency} · {e.id}
                  </span>
                </span>
              </ListRow>
            ))
          )}
        </List>
      </div>
    </div>
  );
}

export const extension: Extension = {
  id: "silo.busy-status-demo",
  activate(ctx) {
    injectStyles();
    ctx.subscriptions.push(
      ctx.registerSidePanel({
        id: "busy-status-demo",
        location: "right",
        title: "Busy Status Demo",
        order: 90,
        lazyMount: true,
        component: () => <BusyStatusDemoPanel ctx={ctx} />,
      }),
    );
  },
  deactivate() {
    removeStyles();
  },
};
