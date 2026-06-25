import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useSyncExternalStore,
} from "react";
import { HexColorPicker } from "react-colorful";
import { Tooltip } from "@silo-code/sdk";
import type {
  CustomTheme,
  ThemeVars,
  ThemeService,
  ExtensionStorage,
  FileService,
  UiService,
} from "@silo-code/sdk";
import "./ThemeEditorPanel.css";

// EyeDropper API — available in Chromium-based webviews (Tauri on macOS/Win)
declare class EyeDropper {
  open(): Promise<{ sRGBHex: string }>;
}
const hasEyeDropper = typeof window !== "undefined" && "EyeDropper" in window;

const VAR_GROUPS: { label: string; keys: (keyof ThemeVars)[] }[] = [
  // ── Design tokens (--silo-color-*) ──────────────────────────────────────
  {
    label: "General",
    keys: [
      "--silo-color-bg",
      "--silo-color-bg-hover",
      "--silo-color-bg-active",
      "--silo-color-button-bg",
      "--silo-color-button-text",
      "--silo-color-text-hi",
      "--silo-color-text",
      "--silo-color-text-lo",
      "--silo-color-input-bg",
      "--silo-color-input-text",
      "--silo-color-border",
      "--silo-color-border-strong",
      "--silo-color-accent",
      "--silo-color-accent-2",
    ],
  },
  {
    label: "Status",
    keys: ["--silo-color-ok", "--silo-color-warn", "--silo-color-err"],
  },
  {
    label: "Toolbar",
    keys: [
      "--silo-color-toolbar-bg",
      "--silo-color-toolbar-text",
      "--silo-color-toolbar-text-disabled",
      "--silo-color-toolbar-input-bg",
    ],
  },
  {
    label: "Content",
    keys: ["--silo-color-content-bg", "--silo-color-content-text"],
  },
  // ── Component tokens (surface-specific overrides) ────────────────────────
  {
    label: "Status Bar",
    keys: [
      "--silo-statusbar-bg",
      "--silo-statusbar-text",
      "--silo-statusbar-bg-hover",
    ],
  },
  {
    label: "Side Tabs",
    keys: [
      "--silo-tab-text",
      "--silo-tab-text-active",
      "--silo-tab-bg-hover",
      "--silo-tab-border-active",
    ],
  },
  {
    label: "Menus",
    keys: [
      "--silo-menu-bg",
      "--silo-menu-text",
      "--silo-menu-item-hover-bg",
      "--silo-menu-border",
    ],
  },
  {
    label: "Modals",
    keys: ["--silo-modal-bg", "--silo-modal-border"],
  },
  {
    label: "Notifications",
    keys: ["--silo-notify-bg", "--silo-notify-text", "--silo-notify-text-hi"],
  },
  {
    label: "Editor & Terminal",
    keys: [
      "--silo-content-terminal-bg",
      "--silo-content-editor-bg",
      "--silo-content-editor-selection",
      "--silo-content-editor-selection-inactive",
      "--silo-content-text",
      "--silo-content-editor-text-dim",
      "--silo-content-editor-text-faint",
    ],
  },
  {
    label: "Content Tabs",
    keys: [
      "--silo-content-tab-tray-bg",
      "--silo-content-tab-bg",
      "--silo-content-tab-tray-text",
      "--silo-content-tab-text-inactive",
      "--silo-content-tab-text",
      "--silo-content-tab-text-active",
    ],
  },
];

function resolveVar(key: keyof ThemeVars, vars: Partial<ThemeVars>): string {
  return (
    vars[key] ??
    getComputedStyle(document.documentElement).getPropertyValue(key).trim()
  );
}

/** Inline popover color picker for a single CSS variable. */
function ColorVarRow({
  varKey,
  vars,
  onChange,
}: {
  varKey: keyof ThemeVars;
  vars: Partial<ThemeVars>;
  onChange: (key: keyof ThemeVars, value: string) => void;
}) {
  const val = resolveVar(varKey, vars);
  const hex = val.startsWith("#") ? val : "#808080";
  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div className="theme-var-row">
      <label className="theme-var-name">{varKey.replace(/^--/, "")}</label>
      <div className="theme-color-wrap" ref={popRef}>
        <Tooltip content="Open color picker">
          <button
            className="theme-color-swatch"
            style={{ background: hex }}
            onClick={() => setOpen((o) => !o)}
          />
        </Tooltip>
        {open && (
          <div className="theme-color-popover">
            <HexColorPicker color={hex} onChange={(c) => onChange(varKey, c)} />
          </div>
        )}
      </div>
      <input
        className="theme-editor-input theme-hex-input"
        value={val}
        onChange={(e) => onChange(varKey, e.target.value)}
        spellCheck={false}
      />
      {hasEyeDropper && (
        <Tooltip content="Pick color from screen">
          <button
            className="theme-eyedropper-btn"
            onClick={async () => {
              try {
                const dropper = new EyeDropper();
                const result = await dropper.open();
                onChange(varKey, result.sRGBHex);
              } catch {
                /* cancelled */
              }
            }}
          >
            ⌖
          </button>
        </Tooltip>
      )}
    </div>
  );
}

interface EditorProps {
  theme: CustomTheme;
  themeService: ThemeService;
  files: FileService;
  ui: UiService;
  onDeleted: () => void;
  bodyRef?: React.Ref<HTMLDivElement>;
  onBodyScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
}

function ThemeEditor({
  theme,
  themeService,
  files,
  ui,
  onDeleted,
  bodyRef,
  onBodyScroll,
}: EditorProps) {
  const [name, setName] = useState(theme.name);
  const [base, setBase] = useState(theme.base);
  const [vars, setVars] = useState<Partial<ThemeVars>>({ ...theme.vars });
  const saveTimer = useRef<number | null>(null);

  // Reset when theme changes
  useEffect(() => {
    setName(theme.name);
    setBase(theme.base);
    setVars({ ...theme.vars });
  }, [theme.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const scheduleSave = useCallback(
    (updated: CustomTheme) => {
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        saveTimer.current = null;
        // saveCustom persists and reloads the store, so the list re-renders.
        themeService.saveCustom(updated).catch(console.error);
      }, 500);
    },
    [themeService],
  );

  function handleNameChange(value: string) {
    setName(value);
    scheduleSave({ ...theme, name: value, base, vars });
  }

  function handleBaseChange(value: "dark" | "light") {
    setBase(value);
    scheduleSave({ ...theme, name, base: value, colorScheme: value, vars });
  }

  function handleVarChange(key: keyof ThemeVars, value: string) {
    const updated = { ...vars, [key]: value };
    setVars(updated);
    scheduleSave({ ...theme, name, base, colorScheme: base, vars: updated });
  }

  async function handleExport() {
    const path = await ui.savePath({
      defaultPath: `${theme.name.replace(/\s+/g, "-").toLowerCase()}.json`,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!path) return;
    const exported = themeService.exportTheme({
      ...theme,
      name,
      base,
      colorScheme: base,
      vars,
    });
    await files.writeText(path, JSON.stringify(exported, null, 2));
  }

  async function handleDelete() {
    await themeService.deleteCustom(theme.id);
    onDeleted();
  }

  return (
    <div className="theme-editor">
      <div className="theme-editor-meta">
        <div className="theme-editor-row">
          <label>Name</label>
          <input
            className="theme-editor-input"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
          />
        </div>

        <div className="theme-editor-row">
          <label>Base</label>
          <div className="theme-base-radio">
            {(["dark", "light"] as const).map((b) => (
              <label key={b} className="theme-radio-label">
                <input
                  type="radio"
                  checked={base === b}
                  onChange={() => handleBaseChange(b)}
                />
                {b}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="theme-editor-body" ref={bodyRef} onScroll={onBodyScroll}>
        {VAR_GROUPS.map((group) => (
          <div key={group.label} className="theme-var-group">
            <div className="theme-var-group-label">{group.label}</div>
            {group.keys.map((key) => {
              const isColorKey = !key.startsWith("--silo-font");
              return isColorKey ? (
                <ColorVarRow
                  key={key}
                  varKey={key}
                  vars={vars}
                  onChange={handleVarChange}
                />
              ) : (
                <div key={key} className="theme-var-row">
                  <label className="theme-var-name">
                    {key.replace(/^--/, "")}
                  </label>
                  <input
                    className="theme-editor-input"
                    value={resolveVar(key, vars)}
                    onChange={(e) => handleVarChange(key, e.target.value)}
                  />
                </div>
              );
            })}
          </div>
        ))}

        <div className="theme-editor-actions">
          <button className="silo-button silo-button-sm" onClick={handleExport}>
            Export JSON
          </button>
          <button
            className="silo-button-danger silo-button-sm"
            onClick={handleDelete}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

interface Props {
  active: boolean;
  storage: ExtensionStorage;
  hydrated: boolean;
  theme: ThemeService;
  files: FileService;
  ui: UiService;
}

const STORAGE_SELECTED_ID = "selectedThemeId";
const STORAGE_SCROLL_TOP = "scrollTop";

export function ThemeEditorPanel({
  active: _active,
  storage,
  hydrated,
  theme,
  files,
  ui,
}: Props) {
  const snap = useSyncExternalStore((cb) => {
    const sub = theme.subscribe(cb);
    return () => sub.dispose();
  }, theme.getState);
  const customThemes = snap.customThemes;
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    storage.get<string | null>(STORAGE_SELECTED_ID, null),
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const scrollSaveTimer = useRef<number | null>(null);
  const restoredScrollRef = useRef(false);
  const userScrolledRef = useRef(false);

  // Restore selectedId once persisted state finishes loading.
  useEffect(() => {
    if (!hydrated) return;
    const saved = storage.get<string | null>(STORAGE_SELECTED_ID, null);
    if (saved !== selectedId) setSelectedId(saved);
    // intentionally only react to `hydrated` flipping true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // Persist selectedId whenever it changes (post-hydration).
  useEffect(() => {
    if (!hydrated) return;
    storage.set(STORAGE_SELECTED_ID, selectedId);
  }, [selectedId, hydrated, storage]);

  // Restore scroll position once content is mounted + hydrated. Uses a
  // ResizeObserver because the variable groups grow asynchronously as
  // ColorVarRow children render and styles compute.
  useEffect(() => {
    if (!hydrated) return;
    const el = scrollAreaRef.current;
    if (!el) return;
    const target = storage.get<number>(STORAGE_SCROLL_TOP, 0);
    if (!target) {
      restoredScrollRef.current = true;
      return;
    }
    restoredScrollRef.current = false;
    userScrolledRef.current = false;

    const tryApply = () => {
      if (userScrolledRef.current) return true;
      if (el.scrollHeight - el.clientHeight >= target) {
        el.scrollTop = target;
        restoredScrollRef.current = true;
        return true;
      }
      return false;
    };

    if (tryApply()) return;

    const ro = new ResizeObserver(() => {
      if (tryApply()) ro.disconnect();
    });
    ro.observe(el);
    // Safety: stop trying after 2s.
    const timeout = window.setTimeout(() => {
      ro.disconnect();
      restoredScrollRef.current = true;
    }, 2000);

    return () => {
      ro.disconnect();
      window.clearTimeout(timeout);
    };
  }, [hydrated, storage, selectedId]);

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    // Ignore scroll events fired by our own restore writes.
    if (!restoredScrollRef.current) return;
    userScrolledRef.current = true;
    const top = e.currentTarget.scrollTop;
    if (scrollSaveTimer.current !== null) {
      window.clearTimeout(scrollSaveTimer.current);
    }
    scrollSaveTimer.current = window.setTimeout(() => {
      scrollSaveTimer.current = null;
      storage.set(STORAGE_SCROLL_TOP, top);
    }, 200);
  }

  const selectedTheme = customThemes.find((t) => t.id === selectedId) ?? null;

  async function handleNewTheme() {
    setErrorMsg(null);
    try {
      const resolved = theme.resolve(snap.activeId);
      const newTheme: CustomTheme = {
        id: crypto.randomUUID(),
        version: 2,
        name: "My Theme",
        base: resolved.base,
        colorScheme: resolved.colorScheme,
        vars: { ...resolved.vars },
      };
      await theme.saveCustom(newTheme);
      setSelectedId(newTheme.id);
      theme.setActive(newTheme.id);
    } catch (err) {
      console.error("New theme failed", err);
      setErrorMsg(
        `Create failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async function handleImport() {
    setErrorMsg(null);
    const path = await ui.pickFile({
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!path) return;
    try {
      const text = await files.readText(path);
      const imported = theme.importTheme(JSON.parse(text));
      await theme.saveCustom(imported);
      setSelectedId(imported.id);
      theme.setActive(imported.id);
    } catch (err) {
      console.error("Import failed", err);
      setErrorMsg(
        `Import failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return (
    <div className="theme-editor-panel">
      <div className="theme-panel-header">
        <span className="theme-panel-title">Themes</span>
        <div className="theme-panel-header-actions">
          <Tooltip content="Import theme JSON">
            <button
              className="silo-button silo-button-sm"
              onClick={handleImport}
            >
              Import
            </button>
          </Tooltip>
          <button
            className="silo-button-primary silo-button-sm"
            onClick={handleNewTheme}
          >
            + New
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="theme-error" role="alert">
          {errorMsg}
        </div>
      )}

      {customThemes.length === 0 && (
        <div className="theme-empty">
          No custom themes yet. Click "+ New" to create one based on the current
          theme.
        </div>
      )}

      {customThemes.length > 0 && (
        <div className="theme-list">
          {customThemes.map((t) => (
            <button
              key={t.id}
              className={`theme-list-item${selectedId === t.id ? " selected" : ""}${snap.activeId === t.id ? " active-theme" : ""}`}
              onClick={() => setSelectedId(t.id)}
            >
              <span className="theme-list-name">{t.name}</span>
              <span className="theme-list-base">{t.base}</span>
            </button>
          ))}
        </div>
      )}

      {selectedTheme && (
        <ThemeEditor
          key={selectedTheme.id}
          theme={selectedTheme}
          themeService={theme}
          files={files}
          ui={ui}
          bodyRef={scrollAreaRef}
          onBodyScroll={handleScroll}
          onDeleted={() => {
            // deleteCustom already reloaded the store; just move the active
            // theme off the deleted one and clear the selection.
            if (snap.activeId === selectedTheme.id) {
              theme.setActive(
                selectedTheme.base === "light" ? "light" : "dark",
              );
            }
            setSelectedId(null);
          }}
        />
      )}
    </div>
  );
}
