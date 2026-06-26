import { useSnapshot } from "valtio";
import {
  store,
  setTerminalSetting,
  type TerminalSettings,
  type TerminalCursorStyle,
  MIN_TERMINAL_SCROLL_SENSITIVITY,
  MAX_TERMINAL_SCROLL_SENSITIVITY,
  MAX_TERMINAL_FAST_SCROLL_SENSITIVITY,
} from "@silo-code/extension-host/internal";
// Reuse the editor settings page's layout/control styles (the es-* classes are
// generic settings-page styling).
import "../editor/EditorSettingsPage.css";

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <label className="es-switch">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
      />
      <span className="es-switch-track" />
    </label>
  );
}

// A module of the core.terminal extension, registered from its activate as the
// "terminal" settings page.
export function TerminalSettingsPage() {
  const snap = useSnapshot(store);
  const s = snap.terminalSettings;
  const toggle = (key: keyof TerminalSettings) => (next: boolean) =>
    setTerminalSetting(key, next as TerminalSettings[typeof key]);

  return (
    <div className="es-page">
      <div className="es-header">
        <h2>Terminal</h2>
      </div>
      <div className="es-scroll">
        <section className="es-section">
          <h3 className="es-section-title">Display</h3>
          <div className="es-rows">
            <div className="es-row">
              <div className="es-row-text">
                <span className="es-label">Breadcrumbs</span>
                <span className="es-hint">
                  Show the working-directory bar at the top of the terminal.
                </span>
              </div>
              <div className="es-control">
                <Toggle
                  label="Breadcrumbs"
                  checked={s.breadcrumbs}
                  onChange={toggle("breadcrumbs")}
                />
              </div>
            </div>
            <div className="es-row">
              <div className="es-row-text">
                <span className="es-label">Cursor style</span>
              </div>
              <div className="es-control">
                <select
                  className="es-select"
                  value={s.cursorStyle}
                  onChange={(e) =>
                    setTerminalSetting(
                      "cursorStyle",
                      e.target.value as TerminalCursorStyle,
                    )
                  }
                >
                  <option value="block">Block</option>
                  <option value="bar">Bar</option>
                  <option value="underline">Underline</option>
                </select>
              </div>
            </div>
          </div>
        </section>

        <section className="es-section">
          <h3 className="es-section-title">Behavior</h3>
          <div className="es-rows">
            <div className="es-row">
              <div className="es-row-text">
                <span className="es-label">Copy on selection</span>
                <span className="es-hint">
                  Copy selected text to the clipboard automatically.
                </span>
              </div>
              <div className="es-control">
                <Toggle
                  label="Copy on selection"
                  checked={s.copyOnSelect}
                  onChange={toggle("copyOnSelect")}
                />
              </div>
            </div>
            <div className="es-row">
              <div className="es-row-text">
                <span className="es-label">Paste on right-click</span>
                <span className="es-hint">
                  Right-click pastes the clipboard instead of opening the
                  context menu.
                </span>
              </div>
              <div className="es-control">
                <Toggle
                  label="Paste on right-click"
                  checked={s.pasteOnRightClick}
                  onChange={toggle("pasteOnRightClick")}
                />
              </div>
            </div>
          </div>
        </section>

        <section className="es-section">
          <h3 className="es-section-title">Scrolling</h3>
          <div className="es-rows">
            <div className="es-row">
              <div className="es-row-text">
                <span className="es-label">Scroll speed</span>
                <span className="es-hint">
                  Lines scrolled per mouse-wheel tick. Default: 3.
                </span>
              </div>
              <div className="es-control">
                <input
                  className="es-number"
                  type="number"
                  min={MIN_TERMINAL_SCROLL_SENSITIVITY}
                  max={MAX_TERMINAL_SCROLL_SENSITIVITY}
                  step={1}
                  value={s.scrollSensitivity}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (
                      Number.isFinite(n) &&
                      n >= MIN_TERMINAL_SCROLL_SENSITIVITY &&
                      n <= MAX_TERMINAL_SCROLL_SENSITIVITY
                    ) {
                      setTerminalSetting("scrollSensitivity", n);
                    }
                  }}
                />
              </div>
            </div>
            <div className="es-row">
              <div className="es-row-text">
                <span className="es-label">Fast scroll speed</span>
                <span className="es-hint">
                  Lines scrolled per tick while holding Alt/Option. Default: 5.
                </span>
              </div>
              <div className="es-control">
                <input
                  className="es-number"
                  type="number"
                  min={MIN_TERMINAL_SCROLL_SENSITIVITY}
                  max={MAX_TERMINAL_FAST_SCROLL_SENSITIVITY}
                  step={1}
                  value={s.fastScrollSensitivity}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (
                      Number.isFinite(n) &&
                      n >= MIN_TERMINAL_SCROLL_SENSITIVITY &&
                      n <= MAX_TERMINAL_FAST_SCROLL_SENSITIVITY
                    ) {
                      setTerminalSetting("fastScrollSensitivity", n);
                    }
                  }}
                />
              </div>
            </div>
          </div>
        </section>

        <section className="es-section">
          <h3 className="es-section-title">Shell</h3>
          <div className="es-rows">
            <div className="es-row">
              <div className="es-row-text">
                <span className="es-label">Shell path</span>
                <span className="es-hint">
                  Program to launch. Leave empty to use your $SHELL. Applies to
                  new terminals.
                </span>
              </div>
              <div className="es-control">
                <input
                  className="es-text"
                  type="text"
                  placeholder="$SHELL"
                  value={s.shell}
                  spellCheck={false}
                  onChange={(e) => setTerminalSetting("shell", e.target.value)}
                />
              </div>
            </div>
            <div className="es-row">
              <div className="es-row-text">
                <span className="es-label">Shell arguments</span>
                <span className="es-hint">
                  Whitespace-separated args (e.g. <code>-l</code> for a login
                  shell). Applies to new terminals.
                </span>
              </div>
              <div className="es-control">
                <input
                  className="es-text"
                  type="text"
                  placeholder="-l"
                  value={s.shellArgs}
                  spellCheck={false}
                  onChange={(e) =>
                    setTerminalSetting("shellArgs", e.target.value)
                  }
                />
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
