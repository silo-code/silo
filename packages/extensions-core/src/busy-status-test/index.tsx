import { useRef, useState } from "react";
import type { Disposable, Extension, ExtensionContext } from "@silo-code/sdk";
import { Button, Input, List, ListRow } from "@silo-code/sdk";
import "./BusyStatusTestPanel.css";

/**
 * DEV-only scratch panel to exercise StatusBar busy status (RFC 0026) before
 * real consumers land. Reachable via Window → Busy Status Test (dev builds).
 * Delete this extension once restore + pending-remove migration prove the API.
 */

type LocalEntry = {
  id: string;
  label: string;
  urgency: "normal" | "high";
  disposable: Disposable;
};

function BusyStatusTestPanel({ ctx }: { ctx: ExtensionContext }) {
  const [label, setLabel] = useState("Restoring terminals…");
  const [urgency, setUrgency] = useState<"normal" | "high">("normal");
  const [entries, setEntries] = useState<LocalEntry[]>([]);
  const seq = useRef(0);

  const push = () => {
    const text = label.trim() || "Busy…";
    const id = `busy-status-test.${++seq.current}`;
    const disposable = ctx.ui.busyStatus.set({
      id,
      label: text,
      detail: `test id ${id}`,
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
    <div className="busy-status-test">
      <p className="busy-status-test__blurb">
        Pushes entries into the host StatusBar busy-status slot. Open two or
        more to see the numbered badge; click the status line for the popover.
        Errors belong in notifications, not sticky status.
      </p>

      <label className="busy-status-test__field">
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
        className="busy-status-test__urgency"
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

      <div className="busy-status-test__actions">
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

      <div className="busy-status-test__list">
        <List aria-label="Active test entries">
          {entries.length === 0 ? (
            <ListRow>
              <span className="busy-status-test__empty">No active entries</span>
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
                <span className="busy-status-test__row-label">
                  {e.label}
                  <span className="busy-status-test__meta">
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
  id: "core.busy-status-test",
  manifest: {
    name: "Busy Status Test",
    description: "DEV scratch panel for StatusBar busy status (RFC 0026).",
  },
  activate(ctx) {
    if (!import.meta.env.DEV) return;

    ctx.registerSidePanel({
      id: "busy-status-test",
      location: "right",
      title: "Busy Status Test",
      order: 90,
      lazyMount: true,
      component: () => <BusyStatusTestPanel ctx={ctx} />,
    });

    ctx.registerCommand({
      id: "core.busyStatusTest.show",
      label: "Busy Status Test",
      run: () => {
        ctx.layout.revealSidePanel("busy-status-test");
        ctx.layout.setSidePanelCollapsed("right", false);
      },
    });

    ctx.registerMenuItem({
      id: "core.menu.busyStatusTest",
      menu: "window",
      command: "core.busyStatusTest.show",
      group: "9_dev",
      order: -4,
    });
  },
};
