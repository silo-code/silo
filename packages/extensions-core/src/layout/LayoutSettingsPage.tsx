import { useEffect, useState } from "react";
import { useSnapshot } from "valtio";
import { Crosshair } from "@phosphor-icons/react";
import type { ExtensionContext } from "@silo-code/sdk";
import {
  CheckboxRow,
  IconButton,
  Input,
  Section,
  SettingRow,
  Switch,
  Tooltip,
} from "@silo-code/sdk";
import {
  store,
  setSmallScreenModeEnabled,
  setSmallScreenThresholdPx,
  MIN_SMALL_SCREEN_THRESHOLD_PX,
  setGlobalPanelLayoutEnabled,
  setGlobalActiveTabEnabled,
  hasSavedGlobalPanelLayout,
  enableGlobalPanelLayout,
} from "@silo-code/extension-host/internal";
import { confirmEnableGlobalPanelLayout } from "./GlobalPanelLayoutConfirm";

// A module of the core.layout extension — small-screen mode's on/off switch
// and width threshold, plus Global Side Panel Layout's two settings. The
// auto-hide/auto-restore behavior and the panel-state mechanics themselves
// are host-internal (extension-host/small-screen-mode.ts,
// state/workspaces.ts); this page only edits the preferences they read.
//
// Factory (not a bare component) because enabling Global Side Panel Layout
// needs `ctx.ui.showModal` to confirm what to do about a previously-saved
// shared layout before committing — see `GlobalPanelLayoutConfirm.tsx`.
export function makeLayoutSettingsPage(ctx: ExtensionContext) {
  return function LayoutSettingsPage() {
    const snap = useSnapshot(store);
    const [thresholdInput, setThresholdInput] = useState(
      String(snap.smallScreenThresholdPx),
    );

    // Keep the text field in sync when the stored value changes from elsewhere
    // (the capture-width icon button below, or a future second surface).
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

    async function toggleGlobalPanelLayout(next: boolean): Promise<void> {
      if (!next) {
        setGlobalPanelLayoutEnabled(false);
        return;
      }
      const choice = await confirmEnableGlobalPanelLayout(
        ctx.ui,
        hasSavedGlobalPanelLayout(),
      );
      if (choice === "cancel") return;
      enableGlobalPanelLayout(choice);
    }

    return (
      <div className="es-page">
        <div className="es-header">
          <h2>Layout</h2>
        </div>
        <div className="es-scroll silo-scroll">
          <Section label="Side Panel Layout">
            {/* Hand-rolled instead of <SettingRow> (whose `hint` is a plain
                string) so the sub-setting checkbox can sit inside the same
                row's text column, directly under the hint, rather than as
                its own separate row below. */}
            <div className="silo-setting-row">
              <div className="silo-setting-row-text">
                <div className="silo-setting-row-label">
                  Share side panel layout across workspaces
                </div>
                <div className="silo-setting-row-hint">
                  Enable this setting to use the same side panel layout
                  (position, visibility, collapse) across workspaces.
                </div>
                <div style={{ marginTop: "8px", marginBottom: "12px" }}>
                  <CheckboxRow
                    label="Also maintain active tab"
                    checked={snap.globalActiveTabEnabled}
                    onChange={setGlobalActiveTabEnabled}
                    disabled={!snap.globalPanelLayoutEnabled}
                  />
                </div>
              </div>
              <div className="silo-setting-row-control">
                <Switch
                  checked={snap.globalPanelLayoutEnabled}
                  onChange={(next) => void toggleGlobalPanelLayout(next)}
                  aria-label="Share side panel layout across workspaces"
                />
              </div>
            </div>
          </Section>
          <Section label="Laptop Mode">
            <SettingRow
              label="Enable Laptop Mode"
              hint="Enable this setting to automatically hide the side panels when using Silo on a laptop (determined by threshold below)."
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
              <div
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                <Input
                  type="number"
                  min={MIN_SMALL_SCREEN_THRESHOLD_PX}
                  value={thresholdInput}
                  onChange={(e) => setThresholdInput(e.target.value)}
                  onBlur={(e) => commitThreshold(e.target.value)}
                />
                <Tooltip content="Capture current width">
                  <IconButton
                    aria-label="Capture current width"
                    onClick={() => setSmallScreenThresholdPx(window.innerWidth)}
                  >
                    <Crosshair size={16} weight="bold" />
                  </IconButton>
                </Tooltip>
              </div>
            </SettingRow>
          </Section>
        </div>
      </div>
    );
  };
}
