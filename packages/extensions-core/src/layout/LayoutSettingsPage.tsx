import { useEffect, useState } from "react";
import { useSnapshot } from "valtio";
import { Button, Input, Section, SettingRow, Switch } from "@silo-code/sdk";
import {
  store,
  setSmallScreenModeEnabled,
  setSmallScreenThresholdPx,
  MIN_SMALL_SCREEN_THRESHOLD_PX,
} from "@silo-code/extension-host/internal";

// A module of the core.layout extension — small-screen mode's on/off switch
// and width threshold. The auto-hide/auto-restore/peek behavior itself is
// host-internal (extension-host/small-screen-mode.ts); this page only edits
// the two preferences it reads.
export function LayoutSettingsPage() {
  const snap = useSnapshot(store);
  const [thresholdInput, setThresholdInput] = useState(
    String(snap.smallScreenThresholdPx),
  );

  // Keep the text field in sync when the stored value changes from elsewhere
  // (the "use current width" button below, or a future second surface).
  useEffect(() => {
    setThresholdInput(String(snap.smallScreenThresholdPx));
  }, [snap.smallScreenThresholdPx]);

  function commitThreshold(raw: string): void {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= MIN_SMALL_SCREEN_THRESHOLD_PX) {
      setSmallScreenThresholdPx(n);
    } else {
      setThresholdInput(String(snap.smallScreenThresholdPx));
    }
  }

  return (
    <div className="es-page">
      <div className="es-header">
        <h2>Layout</h2>
      </div>
      <div className="es-scroll silo-scroll">
        <Section label="Laptop Mode">
          <SettingRow
            label="Enable Laptop Mode"
            hint="Give a narrow window its own layout: side panels hide when the window narrows past the threshold below, and each workspace remembers what you show, hide, and resize while it's narrow. Your full-size layout is untouched, and comes back with the wider window. (Hovering the window's edge peeks a collapsed panel at any size.)"
          >
            <Switch
              checked={snap.smallScreenModeEnabled}
              onChange={setSmallScreenModeEnabled}
              aria-label="Enable Laptop Mode"
            />
          </SettingRow>
          <SettingRow
            label="Threshold width"
            hint="Below this window width (in pixels), side panels auto-hide."
          >
            <Input
              type="number"
              min={MIN_SMALL_SCREEN_THRESHOLD_PX}
              value={thresholdInput}
              onChange={(e) => setThresholdInput(e.target.value)}
              onBlur={(e) => commitThreshold(e.target.value)}
            />
          </SettingRow>
          <SettingRow
            label="Capture current width"
            hint="Resize the Silo window to whatever you consider too small, then use this to set the threshold to that exact width."
          >
            <Button
              size="sm"
              onClick={() => setSmallScreenThresholdPx(window.innerWidth)}
            >
              Use current window width
            </Button>
          </SettingRow>
        </Section>
      </div>
    </div>
  );
}
