import { useState, type ReactNode } from "react";
import { useSnapshot } from "valtio";
import {
  store,
  setEditorSetting,
  type EditorSettings,
  type RenderLineHighlight,
  type RenderWhitespace,
} from "@silo-code/extension-host/internal";
import "./EditorSettingsPage.css";
import { filterSections } from "../settings-search";

interface RowDef {
  label: string;
  hint?: string;
  control: ReactNode;
}

interface SectionDef {
  title: string;
  rows: RowDef[];
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

// A module of the core.editor extension (registered from its activate as the
// "editor" settings page) — the editor surface's own settings, text and diff
// alike.
export function EditorSettingsPage() {
  const snap = useSnapshot(store);
  const s = snap.editorSettings;
  const [query, setQuery] = useState("");

  const toggle = (key: keyof EditorSettings) => (next: boolean) =>
    setEditorSetting(key, next as EditorSettings[typeof key]);

  // Settings described as data so the search box can filter rows and drop
  // sections that end up empty. Controls close over the current snapshot.
  const sections: SectionDef[] = [
    {
      title: "Formatting",
      rows: [
        {
          label: "Format on save",
          hint: "Run Format Document before writing to disk. No-ops for file types without a formatter (e.g. Markdown, Python).",
          control: (
            <Toggle
              label="Format on save"
              checked={s.formatOnSave}
              onChange={toggle("formatOnSave")}
            />
          ),
        },
        {
          label: "Format on type",
          hint: "Reformat the current line as you type.",
          control: (
            <Toggle
              label="Format on type"
              checked={s.formatOnType}
              onChange={toggle("formatOnType")}
            />
          ),
        },
        {
          label: "Format on paste",
          hint: "Reformat pasted text.",
          control: (
            <Toggle
              label="Format on paste"
              checked={s.formatOnPaste}
              onChange={toggle("formatOnPaste")}
            />
          ),
        },
      ],
    },
    {
      title: "Indentation",
      rows: [
        {
          label: "Tab size",
          hint: "Spaces per indentation level.",
          control: (
            <input
              className="es-number"
              type="number"
              min={1}
              max={8}
              value={s.tabSize}
              onChange={(e) => {
                const n = Math.round(Number(e.target.value));
                if (Number.isFinite(n) && n >= 1 && n <= 8) {
                  setEditorSetting("tabSize", n);
                }
              }}
            />
          ),
        },
        {
          label: "Insert spaces",
          hint: "Indent with spaces instead of tab characters.",
          control: (
            <Toggle
              label="Insert spaces"
              checked={s.insertSpaces}
              onChange={toggle("insertSpaces")}
            />
          ),
        },
      ],
    },
    {
      title: "Display",
      rows: [
        {
          label: "Word wrap",
          hint: "Soft-wrap long lines at the viewport edge.",
          control: (
            <Toggle
              label="Word wrap"
              checked={s.wordWrap}
              onChange={toggle("wordWrap")}
            />
          ),
        },
        {
          label: "Minimap",
          hint: "Show the code overview on the right edge.",
          control: (
            <Toggle
              label="Minimap"
              checked={s.minimap}
              onChange={toggle("minimap")}
            />
          ),
        },
        {
          label: "Breadcrumbs",
          hint: "Show the file path bar at the top of the editor.",
          control: (
            <Toggle
              label="Breadcrumbs"
              checked={s.breadcrumbs}
              onChange={toggle("breadcrumbs")}
            />
          ),
        },
        {
          label: "Render whitespace",
          control: (
            <select
              className="es-select"
              value={s.renderWhitespace}
              onChange={(e) =>
                setEditorSetting(
                  "renderWhitespace",
                  e.target.value as RenderWhitespace,
                )
              }
            >
              <option value="none">None</option>
              <option value="boundary">Boundary</option>
              <option value="selection">Selection</option>
              <option value="trailing">Trailing</option>
              <option value="all">All</option>
            </select>
          ),
        },
        {
          label: "Line highlight",
          control: (
            <select
              className="es-select"
              value={s.renderLineHighlight}
              onChange={(e) =>
                setEditorSetting(
                  "renderLineHighlight",
                  e.target.value as RenderLineHighlight,
                )
              }
            >
              <option value="none">None</option>
              <option value="gutter">Gutter</option>
              <option value="line">Line</option>
              <option value="all">All</option>
            </select>
          ),
        },
        {
          label: "Smooth scrolling",
          hint: "Animate scroll position changes.",
          control: (
            <Toggle
              label="Smooth scrolling"
              checked={s.smoothScrolling}
              onChange={toggle("smoothScrolling")}
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
        <h2>Editor</h2>
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
          <div className="es-empty">No settings match “{query}”.</div>
        )}
      </div>
    </div>
  );
}
