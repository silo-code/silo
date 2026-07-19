import { useState, type ReactNode } from "react";
import { useSnapshot } from "valtio";
import {
  EmptyState,
  Input,
  SearchInput,
  Section,
  Select,
  SettingRow,
  Switch,
} from "@silo-code/sdk";
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
            <Switch
              checked={s.formatOnSave}
              onChange={toggle("formatOnSave")}
              aria-label="Format on save"
            />
          ),
        },
        {
          label: "Format on type",
          hint: "Reformat the current line as you type.",
          control: (
            <Switch
              checked={s.formatOnType}
              onChange={toggle("formatOnType")}
              aria-label="Format on type"
            />
          ),
        },
        {
          label: "Format on paste",
          hint: "Reformat pasted text.",
          control: (
            <Switch
              checked={s.formatOnPaste}
              onChange={toggle("formatOnPaste")}
              aria-label="Format on paste"
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
            <Input
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
            <Switch
              checked={s.insertSpaces}
              onChange={toggle("insertSpaces")}
              aria-label="Insert spaces"
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
            <Switch
              checked={s.wordWrap}
              onChange={toggle("wordWrap")}
              aria-label="Word wrap"
            />
          ),
        },
        {
          label: "Minimap",
          hint: "Show the code overview on the right edge.",
          control: (
            <Switch
              checked={s.minimap}
              onChange={toggle("minimap")}
              aria-label="Minimap"
            />
          ),
        },
        {
          label: "Breadcrumbs",
          hint: "Show the file path bar at the top of the editor.",
          control: (
            <Switch
              checked={s.breadcrumbs}
              onChange={toggle("breadcrumbs")}
              aria-label="Breadcrumbs"
            />
          ),
        },
        {
          label: "Render whitespace",
          control: (
            <Select
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
            </Select>
          ),
        },
        {
          label: "Line highlight",
          control: (
            <Select
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
            </Select>
          ),
        },
        {
          label: "Smooth scrolling",
          hint: "Animate scroll position changes.",
          control: (
            <Switch
              checked={s.smoothScrolling}
              onChange={toggle("smoothScrolling")}
              aria-label="Smooth scrolling"
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
      <SearchInput
        value={query}
        onValueChange={setQuery}
        placeholder="Search settings…"
        autoFocus
      />
      <div className="es-scroll silo-scroll">
        {visible.map((sec) => (
          <Section key={sec.title} label={sec.title}>
            {sec.rows.map((row) => (
              <SettingRow key={row.label} label={row.label} hint={row.hint}>
                {row.control}
              </SettingRow>
            ))}
          </Section>
        ))}
        {visible.length === 0 && (
          <EmptyState title={`No settings match “${query}”.`} />
        )}
      </div>
    </div>
  );
}
