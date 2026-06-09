import { useRef, useSyncExternalStore } from "react";
import type { MenuEntry, ThemeService, UiService } from "@silo-code/sdk";
import "./ThemeStatusItem.css";

const SWATCH_KEYS = [
  "--silo-content-tab-bg",
  "--silo-color-bg-hover",
  "--silo-color-accent",
  "--silo-color-text",
] as const;

// Resolve the swatch colors for a built-in base palette by reading the authored
// values straight out of theme.css — `theme.css` is the single source of truth.
// A detached probe carrying `data-theme` picks up the `:root`/`[data-theme=…]`
// rules directly, so an active custom theme's injected `:root` vars can't bleed
// into the preview.
function readBaseVars(base: "dark" | "light"): Record<string, string> {
  const probe = document.createElement("div");
  probe.setAttribute("data-theme", base);
  probe.style.cssText =
    "position:absolute;visibility:hidden;pointer-events:none";
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const out: Record<string, string> = {};
  for (const k of SWATCH_KEYS) out[k] = cs.getPropertyValue(k).trim();
  document.body.removeChild(probe);
  return out;
}

function ThemeSwatch({
  vars,
  base,
}: {
  vars: Record<string, string>;
  base: "dark" | "light";
}) {
  const baseVars = readBaseVars(base);
  const r = (key: string) => vars[key] ?? baseVars[key] ?? "transparent";

  return (
    <span className="theme-swatch" aria-hidden="true">
      <span style={{ background: r("--silo-content-tab-bg") }} />
      <span style={{ background: r("--silo-color-bg-hover") }} />
      <span style={{ background: r("--silo-color-text") }} />
      <span style={{ background: r("--silo-color-accent") }} />
    </span>
  );
}

export function ThemeStatusItem({
  theme,
  ui,
}: {
  theme: ThemeService;
  ui: UiService;
}) {
  const snap = useSyncExternalStore((cb) => {
    const sub = theme.subscribe(cb);
    return () => sub.dispose();
  }, theme.getState);
  const { activeId, presets, customThemes } = snap;
  const buttonRef = useRef<HTMLButtonElement>(null);

  const resolved = theme.resolve(activeId);

  const activePreset = presets.find((p) => p.id === activeId);
  const activeCustom = customThemes.find((t) => t.id === activeId);
  const activeName = activePreset?.name ?? activeCustom?.name ?? activeId;

  function openPicker() {
    const items: MenuEntry[] = [{ type: "header", label: "Built-in" }];
    for (const preset of presets) {
      items.push({
        label: preset.name,
        icon: (
          <ThemeSwatch
            vars={preset.vars as Record<string, string>}
            base={preset.base}
          />
        ),
        checked: activeId === preset.id,
        run: () => theme.setActive(preset.id),
      });
    }
    if (customThemes.length > 0) {
      items.push({ type: "header", label: "Custom" });
      for (const custom of customThemes) {
        items.push({
          label: custom.name,
          icon: (
            <ThemeSwatch
              vars={custom.vars as Record<string, string>}
              base={custom.base}
            />
          ),
          checked: activeId === custom.id,
          run: () => theme.setActive(custom.id),
        });
      }
    }
    void ui.showMenu({ items, anchor: buttonRef.current });
  }

  return (
    <div className="theme-selector">
      <button
        ref={buttonRef}
        className="theme-selector-btn"
        onClick={openPicker}
        title="Change theme"
      >
        <ThemeSwatch
          vars={resolved.vars as Record<string, string>}
          base={resolved.base}
        />
        <span className="theme-label">{activeName}</span>
      </button>
    </div>
  );
}
