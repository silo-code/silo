/**
 * The Agent Monitor settings page component. Split from `settings-store.ts`
 * so the pure store (and its unit tests) never has to load the real
 * `@silo-code/sdk` runtime — this file is the only place that does, via
 * `useServiceState`.
 */

import {
  useServiceState,
  IconButton,
  Input,
  RadioCard,
  RadioGroup,
  Section,
  Select,
  SettingRow,
  Switch,
} from "@silo-code/sdk";
import type { SoundName } from "./synth";
import {
  settingsService,
  SOUND_IDS,
  MIN_STALE_DONE_HOURS,
  type FocusBehavior,
  type IconMode,
} from "./settings-store";
import { previewSound } from "./sound";

export {
  settingsService,
  initSettings,
  clearSettingsListeners,
  DEFAULT_SHOW_WS_STATUS_ROWS,
  DEFAULT_STALE_DONE_ENABLED,
  DEFAULT_STALE_DONE_HOURS,
  MIN_STALE_DONE_HOURS,
  type AgentMonitorSettings,
  type FocusBehavior,
  type IconMode,
} from "./settings-store";

function soundLabel(name: SoundName): string {
  return name[0].toUpperCase() + name.slice(1);
}

const FOCUS_OPTIONS: { value: FocusBehavior; label: string; hint: string }[] = [
  {
    value: "clear",
    label: "Clear the finished indicator",
    hint: "Viewing the terminal acknowledges the run — the green check disappears and the status dot turns grey.",
  },
  {
    value: "hide",
    label: "Clear it, and hide the focused terminal's status row",
    hint: "As above, plus the workspace status row is hidden entirely for whichever terminal you're currently viewing.",
  },
  {
    value: "none",
    label: "Keep it until the next run",
    hint: "Viewing changes nothing — the green check and status stay until the agent starts working again.",
  },
];

const ICON_MODE_OPTIONS: { value: IconMode; label: string }[] = [
  { value: "none", label: "No icons" },
  { value: "color", label: "Color" },
  { value: "monotone", label: "Monotone" },
];

/**
 * Embeddable behavior block — composed into the `core.agents-settings`
 * **Behavior** tab via `getExtension`. Covers what viewing a finished agent
 * does to its status, and the stop-working sound.
 */
export function AgentsBehaviorPanel() {
  const s = useServiceState(settingsService);
  return (
    <div className="am-options-panel">
      <div className="am-intro">
        <span className="am-intro-title">
          When you view a finished agent's terminal
        </span>
        <span className="am-hint">
          An agent that finishes a run shows a green check on its tab and a
          green dot in the workspace status until you look at it. Choose what
          viewing its terminal should do.
        </span>
        <div className="am-options">
          <RadioGroup
            value={s.focusBehavior}
            onChange={(value) =>
              settingsService.set({ focusBehavior: value as FocusBehavior })
            }
          >
            {FOCUS_OPTIONS.map((opt) => (
              <RadioCard
                key={opt.value}
                value={opt.value}
                title={opt.label}
                description={opt.hint}
              />
            ))}
          </RadioGroup>
        </div>
      </div>
      <Section label="Sound">
        {/* Hand-rolled instead of <SettingRow> so the sound picker can sit
            inside the same row's text column, directly under the hint, rather
            than as its own row below. */}
        <div className="silo-setting-row">
          <div className="silo-setting-row-text">
            <div className="silo-setting-row-label">
              Play a sound when an agent stops working
            </div>
            <div className="silo-setting-row-hint">
              Plays whenever an agent stops working, whether or not you're
              watching its terminal.
            </div>
            <div className="am-sound-control am-sound-subrow">
              <Select
                value={s.soundId}
                disabled={!s.soundEnabled}
                onChange={(e) =>
                  settingsService.set({ soundId: e.target.value as SoundName })
                }
                aria-label="Notification sound"
              >
                {SOUND_IDS.map((name) => (
                  <option key={name} value={name}>
                    {soundLabel(name)}
                  </option>
                ))}
              </Select>
              <IconButton
                size="sm"
                disabled={!s.soundEnabled}
                onClick={() => previewSound(s.soundId)}
                aria-label={`Preview ${soundLabel(s.soundId)} sound`}
              >
                ▶
              </IconButton>
            </div>
          </div>
          <div className="silo-setting-row-control">
            <Switch
              checked={s.soundEnabled}
              onChange={(soundEnabled) => settingsService.set({ soundEnabled })}
              aria-label="Play a sound when an agent stops working"
            />
          </div>
        </div>
      </Section>
    </div>
  );
}

/**
 * Embeddable Navigator-preferences block — composed into the
 * `core.agents-settings` **Navigator** tab via `getExtension`. Covers how
 * agents surface in the Navigator: the per-workspace status rows and the
 * Agents view's handling of long-finished runs.
 */
export function AgentsNavigatorPanel() {
  const s = useServiceState(settingsService);
  return (
    <div className="am-options-panel">
      <Section label="Workspace rows">
        <SettingRow
          label="Show agent status on workspace rows"
          hint="Adds a per-terminal status row (working / waiting / done) under each workspace in the Navigator."
        >
          <Switch
            checked={s.showWorkspaceStatusRows}
            onChange={(showWorkspaceStatusRows) =>
              settingsService.set({ showWorkspaceStatusRows })
            }
            aria-label="Show agent status on workspace rows"
          />
        </SettingRow>
      </Section>
      <Section label="Agent views">
        {/* Hand-rolled instead of <SettingRow> (whose `hint` is a plain string)
            so the cutoff-period control can sit inside the same row's text
            column, directly under the hint, rather than as its own row below. */}
        <div className="silo-setting-row">
          <div className="silo-setting-row-text">
            <div className="silo-setting-row-label">Collapse older agents</div>
            <div className="silo-setting-row-hint">
              Agents drop off into a collapsed section once they are older than
              the cutoff period.
            </div>
            <div className="am-hours-control am-hours-subrow">
              <span className="am-hours-label">Cutoff period</span>
              <Input
                className="am-hours-input"
                type="number"
                min={MIN_STALE_DONE_HOURS}
                step={1}
                value={s.staleDoneHours}
                disabled={!s.staleDoneEnabled}
                onChange={(e) => {
                  const hours = Math.trunc(Number(e.target.value));
                  if (!Number.isFinite(hours) || hours < MIN_STALE_DONE_HOURS)
                    return;
                  settingsService.set({ staleDoneHours: hours });
                }}
                aria-label="Cutoff period in hours"
              />
              <span className="am-hours-unit">hours</span>
            </div>
          </div>
          <div className="silo-setting-row-control">
            <Switch
              checked={s.staleDoneEnabled}
              onChange={(staleDoneEnabled) =>
                settingsService.set({ staleDoneEnabled })
              }
              aria-label="Collapse older agents"
            />
          </div>
        </div>
      </Section>
    </div>
  );
}

/**
 * Embeddable display block — composed into the `core.agents-settings`
 * **Display** tab via `getExtension`. Covers the agent brand icons shown in
 * the agent views.
 */
export function AgentsDisplayPanel() {
  const s = useServiceState(settingsService);
  return (
    <div className="am-options-panel">
      <Section label="Agent icons">
        <SettingRow label="Show agent app icons in the agent views">
          <Select
            value={s.iconMode}
            onChange={(e) =>
              settingsService.set({ iconMode: e.target.value as IconMode })
            }
            aria-label="Show agent app icons in the agent views"
          >
            {ICON_MODE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </SettingRow>
      </Section>
    </div>
  );
}
