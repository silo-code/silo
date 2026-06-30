import { useLayoutEffect, useRef, useState } from "react";
import { ModalActions } from "@silo-code/extension-host/internal";
import {
  renameGroup,
  setGroupColor,
} from "@silo-code/extension-host/internal";
import type { ExtensionContext } from "@silo-code/sdk";

// Accepts both the mutable type and valtio's readonly snapshot form.
export interface GroupSnapshot {
  id: string;
  name: string;
  color?: string;
  collapsed: boolean;
  workspaceOrder: readonly string[] | string[];
}

interface GroupPropertiesChanges {
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

function GroupPropertiesContent({
  group,
  onCancel,
  onSave,
}: {
  group: GroupSnapshot;
  onCancel: () => void;
  onSave: (changes: GroupPropertiesChanges) => void;
}) {
  const [name, setName] = useState(group.name);
  const [color, setColor] = useState<string | undefined>(group.color);
  const nameRef = useRef<HTMLInputElement | null>(null);

  useLayoutEffect(() => {
    nameRef.current?.focus();
    nameRef.current?.select();
  }, []);

  const trimmed = name.trim();
  const nameDirty = trimmed.length > 0 && trimmed !== group.name;
  const colorDirty = color !== group.color;
  const dirty = nameDirty || colorDirty;

  function commit() {
    if (dirty) onSave({ name: trimmed || group.name, color });
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
        <label className="ws-prop-label" htmlFor="group-prop-name">
          Name
        </label>
        <input
          id="group-prop-name"
          ref={nameRef}
          className="ws-rename-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="ws-prop-section">
        <span className="ws-prop-label">Color</span>
        <div className="ws-group-palette">
          {PALETTE.map((entry) => (
            <button
              key={entry.value ?? "__none__"}
              type="button"
              className={`ws-group-swatch${color === entry.value ? " selected" : ""}`}
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

export async function openGroupProperties(
  ctx: ExtensionContext,
  group: GroupSnapshot,
): Promise<void> {
  const changes = await ctx.ui.showModal<GroupPropertiesChanges>(
    (close) => (
      <GroupPropertiesContent
        group={group}
        onCancel={() => close()}
        onSave={(c) => close(c)}
      />
    ),
    { title: "Group Properties", size: "sm" },
  );
  if (changes) {
    if (changes.name !== group.name) renameGroup(group.id, changes.name);
    if (changes.color !== group.color) setGroupColor(group.id, changes.color);
  }
}
