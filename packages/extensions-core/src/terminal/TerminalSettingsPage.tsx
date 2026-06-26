import { useState, useEffect, useRef, type ReactNode } from "react";
import { useSnapshot } from "valtio";
import {
  store,
  setTerminalSetting,
  type TerminalSettings,
  type TerminalCursorStyle,
} from "@silo-code/extension-host/internal";
// Reuse the editor settings page's layout/control styles (the es-* classes are
// generic settings-page styling).
import "../editor/EditorSettingsPage.css";
import { filterSections } from "../settings-search";

const FONT_CANDIDATES = [
  "Cascadia Code",
  "Cascadia Mono",
  "Consolas",
  "Courier New",
  "DejaVu Sans Mono",
  "Fantasque Sans Mono",
  "Fira Code",
  "Fira Mono",
  "Hack",
  "IBM Plex Mono",
  "Inconsolata",
  "JetBrains Mono",
  "Liberation Mono",
  "Menlo",
  "Monaco",
  "Monaspace Neon",
  "Operator Mono",
  "Roboto Mono",
  "SF Mono",
  "Source Code Pro",
  "Ubuntu Mono",
  "Victor Mono",
];

function detectInstalledFonts(candidates: string[]): string[] {
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return candidates;
    // Compare each candidate against the sans-serif fallback. All our candidates
    // are monospace, so an installed font always measures wider than sans-serif
    // for the same string. If the measurement matches sans-serif, the browser
    // fell back — the font isn't installed.
    const probe = "mmmmmmmmmmlli";
    ctx.font = `16px sans-serif`;
    const sansWidth = ctx.measureText(probe).width;
    return candidates.filter((font) => {
      ctx.font = `16px "${font}", sans-serif`;
      return ctx.measureText(probe).width !== sansWidth;
    });
  } catch {
    return candidates;
  }
}

function FontFamilyPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState(FONT_CANDIDATES);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setAvailable(detectInstalledFonts(FONT_CANDIDATES));
  }, []);

  const filtered = value.trim()
    ? available.filter((f) => f.toLowerCase().includes(value.toLowerCase()))
    : available;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div
      ref={containerRef}
      className={`es-font-picker${value ? " es-font-picker--has-value" : ""}`}
      onBlur={(e) => {
        if (!containerRef.current?.contains(e.relatedTarget as Node)) {
          setOpen(false);
        }
      }}
    >
      <input
        ref={inputRef}
        className="es-text es-font-picker-input"
        type="text"
        placeholder="e.g. JetBrains Mono, Fira Code"
        value={value}
        spellCheck={false}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            inputRef.current?.blur();
          }
        }}
      />
      {value && (
        <button
          className="es-font-picker-clear"
          tabIndex={-1}
          aria-label="Clear font family"
          onPointerDown={(e) => {
            e.preventDefault();
            onChange("");
            setOpen(false);
            inputRef.current?.focus();
          }}
        >
          ✕
        </button>
      )}
      <button
        className="es-font-picker-arrow"
        tabIndex={-1}
        aria-label="Show font list"
        onPointerDown={(e) => {
          e.preventDefault();
          setOpen((o) => !o);
        }}
      >
        ▾
      </button>
      {open && filtered.length > 0 && (
        <ul className="es-font-picker-list" role="listbox">
          {filtered.map((font) => (
            <li
              key={font}
              role="option"
              aria-selected={font === value}
              className={`es-font-picker-item${font === value ? " es-font-picker-item--selected" : ""}`}
              onPointerDown={(e) => {
                e.preventDefault();
                onChange(font);
                setOpen(false);
              }}
            >
              {font}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

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

interface RowDef {
  label: string;
  hint?: string;
  control: ReactNode;
}

interface SectionDef {
  title: string;
  rows: RowDef[];
}

// A module of the core.terminal extension, registered from its activate as the
// "terminal" settings page.
export function TerminalSettingsPage() {
  const snap = useSnapshot(store);
  const s = snap.terminalSettings;
  const [query, setQuery] = useState("");

  const toggle = (key: keyof TerminalSettings) => (next: boolean) =>
    setTerminalSetting(key, next as TerminalSettings[typeof key]);

  // Settings described as data so the search box can filter rows and drop
  // sections that end up empty. Controls close over the current snapshot.
  const sections: SectionDef[] = [
    {
      title: "Display",
      rows: [
        {
          label: "Breadcrumbs",
          hint: "Show the working-directory bar at the top of the terminal.",
          control: (
            <Toggle
              label="Breadcrumbs"
              checked={s.breadcrumbs}
              onChange={toggle("breadcrumbs")}
            />
          ),
        },
        {
          label: "Cursor style",
          control: (
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
          ),
        },
      ],
    },
    {
      title: "Font",
      rows: [
        {
          label: "Font family",
          hint: "Monospace font for the terminal. Leave empty to use the platform default.",
          control: (
            <FontFamilyPicker
              value={s.fontFamily}
              onChange={(v) => setTerminalSetting("fontFamily", v)}
            />
          ),
        },
        {
          label: "Font size",
          hint: "Offset from the UI font size in px.",
          control: (
            <input
              className="es-number"
              type="number"
              min={-4}
              max={10}
              step={1}
              value={s.fontSizeOffset}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n) && n >= -4 && n <= 10) {
                  setTerminalSetting("fontSizeOffset", n);
                }
              }}
            />
          ),
        },
      ],
    },
    {
      title: "Behavior",
      rows: [
        {
          label: "Copy on selection",
          hint: "Copy selected text to the clipboard automatically.",
          control: (
            <Toggle
              label="Copy on selection"
              checked={s.copyOnSelect}
              onChange={toggle("copyOnSelect")}
            />
          ),
        },
        {
          label: "Paste on right-click",
          hint: "Right-click pastes the clipboard instead of opening the context menu.",
          control: (
            <Toggle
              label="Paste on right-click"
              checked={s.pasteOnRightClick}
              onChange={toggle("pasteOnRightClick")}
            />
          ),
        },
      ],
    },
    {
      title: "Shell",
      rows: [
        {
          label: "Shell path",
          hint: "Program to launch. Leave empty to use your $SHELL. Applies to new terminals.",
          control: (
            <input
              className="es-text"
              type="text"
              placeholder="$SHELL"
              value={s.shell}
              spellCheck={false}
              onChange={(e) => setTerminalSetting("shell", e.target.value)}
            />
          ),
        },
        {
          label: "Shell arguments",
          hint: "Whitespace-separated args (e.g. -l for a login shell). Applies to new terminals.",
          control: (
            <input
              className="es-text"
              type="text"
              placeholder="-l"
              value={s.shellArgs}
              spellCheck={false}
              onChange={(e) => setTerminalSetting("shellArgs", e.target.value)}
            />
          ),
        },
      ],
    },
  ];

  const visible = filterSections(sections, query.trim().toLowerCase());

  return (
    <div className="es-page">
      <div className="es-header">
        <h2>Terminal</h2>
      </div>
      <input
        className="es-search"
        type="text"
        placeholder="Search settings…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />
      <div className="es-scroll">
        {visible.map((sec) => (
          <section key={sec.title} className="es-section">
            <h3 className="es-section-title">{sec.title}</h3>
            <div className="es-rows">
              {sec.rows.map((row) => (
                <div key={row.label} className="es-row">
                  <div className="es-row-text">
                    <span className="es-label">{row.label}</span>
                    {row.hint && <span className="es-hint">{row.hint}</span>}
                  </div>
                  <div className="es-control">{row.control}</div>
                </div>
              ))}
            </div>
          </section>
        ))}
        {visible.length === 0 && (
          <div className="es-empty">No settings match "{query}".</div>
        )}
      </div>
    </div>
  );
}
