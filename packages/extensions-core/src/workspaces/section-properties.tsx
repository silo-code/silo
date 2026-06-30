import { useLayoutEffect, useRef, useState } from "react";
import { ModalActions } from "@silo-code/extension-host/internal";
import {
  renameSection,
  setSectionColor,
} from "@silo-code/extension-host/internal";
import type { ExtensionContext } from "@silo-code/sdk";

// Accepts both the mutable type and valtio's readonly snapshot form.
export interface SectionSnapshot {
  id: string;
  name: string;
  color?: string;
  collapsed: boolean;
  workspaceOrder: readonly string[] | string[];
}

interface SectionPropertiesChanges {
  name: string;
  color: string | undefined;
}

const PALETTE: Array<{ label: string; value: string | undefined }> = [
  { label: "None", value: undefined },
  { label: "Red", value: "#e06c75" },
  { label: "Orange", value: "#e09070" },
  { label: "Yellow", value: "#e5c07b" },
  { label: "Green", value: "#98c379" },
  { label: "Teal", value: "#56b6c2" },
  { label: "Blue", value: "#61afef" },
  { label: "Purple", value: "#c678dd" },
  { label: "Pink", value: "#ff7eb6" },
];

function SectionPropertiesContent({
  sec,
  onCancel,
  onSave,
}: {
  sec: SectionSnapshot;
  onCancel: () => void;
  onSave: (changes: SectionPropertiesChanges) => void;
}) {
  const [name, setName] = useState(sec.name);
  const [color, setColor] = useState<string | undefined>(sec.color);
  const nameRef = useRef<HTMLInputElement | null>(null);

  useLayoutEffect(() => {
    nameRef.current?.focus();
    nameRef.current?.select();
  }, []);

  const trimmed = name.trim();
  const nameDirty = trimmed.length > 0 && trimmed !== sec.name;
  const colorDirty = color !== sec.color;
  const dirty = nameDirty || colorDirty;

  function commit() {
    if (dirty) onSave({ name: trimmed || sec.name, color });
    else onCancel();
  }

  return (
    <form
      className="ws-props-form"
      onSubmit={(e) => {
        e.preventDefault();
        commit();
      }}
    >
      <div className="ws-prop-section">
        <label className="ws-prop-label" htmlFor="sec-prop-name">
          Name
        </label>
        <input
          id="sec-prop-name"
          ref={nameRef}
          className="ws-rename-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="ws-prop-section">
        <span className="ws-prop-label">Color</span>
        <div className="ws-sec-palette">
          {PALETTE.map((entry) => (
            <button
              key={entry.value ?? "__none__"}
              type="button"
              className={`ws-sec-swatch${color === entry.value ? " selected" : ""}`}
              style={
                entry.value
                  ? { background: entry.value }
                  : undefined
              }
              aria-label={entry.label}
              aria-pressed={color === entry.value}
              onClick={() => setColor(entry.value)}
            />
          ))}
        </div>
      </div>

      <ModalActions>
        <button type="button" className="silo-button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="silo-button-primary" disabled={!dirty}>
          Save
        </button>
      </ModalActions>
    </form>
  );
}

export async function openSectionProperties(
  ctx: ExtensionContext,
  sec: SectionSnapshot,
): Promise<void> {
  const changes = await ctx.ui.showModal<SectionPropertiesChanges>(
    (close) => (
      <SectionPropertiesContent
        sec={sec}
        onCancel={() => close()}
        onSave={(c) => close(c)}
      />
    ),
    { title: "Section Properties", size: "sm" },
  );
  if (changes) {
    if (changes.name !== sec.name) renameSection(sec.id, changes.name);
    if (changes.color !== sec.color) setSectionColor(sec.id, changes.color);
  }
}
