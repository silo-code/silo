import { useEffect, useState } from "react";
import type { Extension, ReactiveService } from "@silo-code/sdk";
import { useServiceState } from "@silo-code/sdk";

/* -------------------------------------------------------------------------- */
/* Styles. A runtime-loaded extension's CSS isn't auto-injected (the host only  */
/* imports the JS bundle), so we inject our own <style> on activate and remove  */
/* it on deactivate. Consume only `--silo-*` design tokens (plus the settings   */
/* dialog's --settings-* contract for contributed pages) so the extension       */
/* themes correctly and scales with uiFontSize.                                 */
/* -------------------------------------------------------------------------- */

const STYLE_ID = "acme-clock-styles";
const STYLES = `
.clock-status { font-variant-numeric: tabular-nums; }

/* Settings page — mirrors the host's Editor / Keyboard Shortcuts pages so a
   third-party page reads as one family. */
.clock-page { display: flex; flex-direction: column; height: 100%; gap: 12px; }
.clock-header { display: flex; align-items: center; min-height: var(--settings-header-height); }
.clock-header h2 { margin: 0; font-size: 1.1em; color: var(--silo-color-text-hi); }
.clock-list { display: flex; flex-direction: column; margin-left: calc(var(--settings-pane-pad) * -1); }
.clock-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 7px 8px 7px var(--settings-pane-pad);
  border-bottom: 1px solid var(--silo-color-border);
}
.clock-row-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.clock-label { color: var(--silo-color-text-hi); }
.clock-hint {
  font-size: calc(var(--settings-font) - 2px);
  color: var(--silo-color-text-lo);
  line-height: 1.35;
}
.clock-switch { position: relative; display: inline-flex; align-items: center; cursor: pointer; flex: 0 0 auto; }
.clock-switch input { position: absolute; opacity: 0; width: 0; height: 0; }
.clock-switch-track {
  width: 34px; height: 18px; border-radius: 9px;
  background: var(--silo-color-bg-active);
  border: 1px solid var(--silo-color-border-strong);
  transition: background 0.15s ease;
  position: relative;
}
.clock-switch-track::after {
  content: ""; position: absolute; top: 2px; left: 2px;
  width: 12px; height: 12px; border-radius: 50%;
  background: var(--silo-color-text-lo);
  transition: transform 0.15s ease, background 0.15s ease;
}
.clock-switch input:checked + .clock-switch-track { background: var(--silo-color-accent); border-color: var(--silo-color-accent); }
.clock-switch input:checked + .clock-switch-track::after { transform: translateX(16px); background: var(--silo-button-primary-text, #fff); }
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
/* A tiny reactive settings store implementing the SDK's ReactiveService, so    */
/* the clock and the settings page stay in sync via useServiceState — the same  */
/* pattern the host's own services use.                                         */
/* -------------------------------------------------------------------------- */

interface ClockSettings {
  use24h: boolean;
  showSeconds: boolean;
}

let settings: ClockSettings = { use24h: true, showSeconds: false };
const listeners = new Set<(s: ClockSettings) => void>();

const settingsService: ReactiveService<ClockSettings> & {
  set(patch: Partial<ClockSettings>): void;
} = {
  getState: () => settings,
  subscribe(listener) {
    listeners.add(listener);
    return { dispose: () => listeners.delete(listener) };
  },
  set(patch) {
    settings = { ...settings, ...patch };
    for (const l of listeners) l(settings);
  },
};

function formatNow(s: ClockSettings): string {
  const now = new Date();
  return now.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: s.showSeconds ? "2-digit" : undefined,
    hour12: !s.use24h,
  });
}

/* -------------------------------------------------------------------------- */
/* Contributions                                                                */
/* -------------------------------------------------------------------------- */

function Clock() {
  const s = useServiceState(settingsService);
  const [time, setTime] = useState(() => formatNow(s));
  useEffect(() => {
    const tick = () => setTime(formatNow(settingsService.getState()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [s]);
  return <span className="clock-status">🕐 {time}</span>;
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="clock-row">
      <div className="clock-row-text">
        <span className="clock-label">{label}</span>
        <span className="clock-hint">{hint}</span>
      </div>
      <label className="clock-switch">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.currentTarget.checked)}
          aria-label={label}
        />
        <span className="clock-switch-track" />
      </label>
    </div>
  );
}

function ClockSettingsPage() {
  const s = useServiceState(settingsService);
  return (
    <div className="clock-page">
      <div className="clock-header">
        <h2>Clock</h2>
      </div>
      <div className="clock-list">
        <ToggleRow
          label="24-hour clock"
          hint="Use a 24-hour clock instead of AM/PM."
          checked={s.use24h}
          onChange={(v) => settingsService.set({ use24h: v })}
        />
        <ToggleRow
          label="Show seconds"
          hint="Include seconds in the status-bar clock."
          checked={s.showSeconds}
          onChange={(v) => settingsService.set({ showSeconds: v })}
        />
      </div>
    </div>
  );
}

export const extension: Extension = {
  id: "acme.clock",
  activate(ctx) {
    injectStyles();

    ctx.registerStatusItem({
      id: "clock.status",
      alignment: "right",
      priority: 10,
      component: Clock,
    });

    ctx.registerCommand({
      id: "acme.clock.toggle24h",
      label: "Clock: Toggle 24-hour clock",
      run: () =>
        settingsService.set({ use24h: !settingsService.getState().use24h }),
    });

    // No group needed — the host groups non-core settings pages under Extensions.
    ctx.registerSettingsPage({
      id: "clock",
      title: "Clock",
      component: ClockSettingsPage,
    });
  },
  deactivate() {
    removeStyles();
    listeners.clear();
  },
};
