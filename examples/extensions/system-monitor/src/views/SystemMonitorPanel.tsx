import { useEffect, useState } from "react";
import type { SidePanelProps } from "@silo-code/sdk";
import { sysmonStore } from "../store";
import { useStore } from "../hooks";
import { GearIcon } from "../icons";
import { getDescriptor } from "../registry";
import { SystemMonitorSettings } from "./SystemMonitorSettings";

export function SystemMonitorPanel({ storage, hydrated }: SidePanelProps) {
  const store = useStore();
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    if (hydrated) sysmonStore.hydrate(storage);
  }, [hydrated, storage]);

  const { settings, live } = store;
  const visiblePanels = settings.panels.filter((p) => p.enabled);

  return (
    <div className="sysmon">
      {!showSettings && (
        <button
          className="sm-gear-btn"
          onClick={() => setShowSettings(true)}
          title="Settings"
          aria-label="Settings"
        >
          <GearIcon />
        </button>
      )}

      {showSettings ? (
        <SystemMonitorSettings onClose={() => setShowSettings(false)} />
      ) : (
        <div className="sm-panels">
          {live.error ? (
            <div className="sm-error">{live.error}</div>
          ) : visiblePanels.length === 0 ? (
            <div
              style={{
                padding: "20px 14px",
                color: "var(--silo-color-text-lo)",
                fontSize: 11,
              }}
            >
              All panels hidden. Open Settings to re-enable them.
            </div>
          ) : (
            visiblePanels.map((p) => {
              const descriptor = getDescriptor(p.id);
              if (!descriptor?.PanelComponent) return null;
              const { PanelComponent } = descriptor;
              return <PanelComponent key={p.id} live={live} />;
            })
          )}
        </div>
      )}
    </div>
  );
}
