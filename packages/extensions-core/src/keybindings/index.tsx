import { useEffect, useReducer, useState } from "react";
import type { Extension, ExtensionContext } from "@silo-code/sdk";
import {
  commandRegistry,
  keybindingRegistry,
  displayKey,
  effectiveKey,
  keybindingsPath,
  onKeymapChange,
} from "@silo-code/extension-host/internal";
import "./KeybindingsPage.css";

const STARTER = `// Keyboard shortcuts — your overrides win over the defaults.
// Examples:
//   { "key": "cmd+j", "command": "view.toggleLeftPanel" }
//   { "key": "cmd+alt+]", "command": "-view.toggleRightPanel" }  // unbind a default
[]
`;

async function openKeybindingsFile(ctx: ExtensionContext): Promise<void> {
  const path = await keybindingsPath();
  if (!(await ctx.files.pathExists(path))) {
    await ctx.files.writeText(path, STARTER);
  }
  ctx.editors.open(path);
  ctx.executeCommand("settings.close");
}

function makePage(ctx: ExtensionContext) {
  return function KeybindingsPage() {
    const [, force] = useReducer((x: number) => x + 1, 0);
    const [query, setQuery] = useState("");

    // Re-render when commands, keybindings, or the keymap (overrides) change.
    useEffect(() => {
      const d1 = commandRegistry.onChange(force);
      const d2 = onKeymapChange(force);
      const d3 = keybindingRegistry.onChange(force);
      return () => {
        d1.dispose();
        d2.dispose();
        d3.dispose();
      };
    }, []);

    const q = query.trim().toLowerCase();
    const rows = commandRegistry
      .list()
      .filter(
        (c) =>
          !q ||
          c.label.toLowerCase().includes(q) ||
          c.id.toLowerCase().includes(q),
      )
      .sort((a, b) => a.label.localeCompare(b.label));

    return (
      <div className="kb-page">
        <div className="kb-header">
          <h2>Keyboard Shortcuts</h2>
          <button
            className="kb-edit-btn"
            onClick={() => void openKeybindingsFile(ctx)}
          >
            Edit keybindings.json
          </button>
        </div>
        <input
          className="kb-search"
          type="text"
          placeholder="Search commands…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <div className="kb-list">
          {rows.map((c) => {
            const eff = effectiveKey(c.id);
            return (
              <div key={c.id} className="kb-row">
                <div className="kb-cmd">
                  <span className="kb-label">{c.label}</span>
                  <span className="kb-id">{c.id}</span>
                </div>
                {eff ? (
                  <kbd className="kb-key">{displayKey(eff)}</kbd>
                ) : (
                  <span className="kb-unbound">—</span>
                )}
              </div>
            );
          })}
          {rows.length === 0 && (
            <div className="kb-empty">No commands match “{query}”.</div>
          )}
        </div>
      </div>
    );
  };
}

export const extension: Extension = {
  id: "core.keybindings",
  activate(ctx) {
    ctx.registerSettingsPage({
      id: "keybindings",
      title: "Keyboard Shortcuts",
      group: "1_general",
      order: 0,
      component: makePage(ctx),
    });
  },
};
