import { useLayoutEffect, useRef, useState } from "react";
import { Check, PencilSimple, X } from "@phosphor-icons/react";
import { Tooltip } from "@silo-code/sdk";
import { validateWorkspaceName } from "./workspace-properties-model";

export interface EditableWorkspaceNameProps {
  name: string;
  /** Called with the trimmed, validated, changed name. Not called if unchanged. */
  onSave: (name: string) => void;
}

/**
 * Static name display with a pencil-icon affordance that enters edit mode —
 * the one field in the workspace properties modal with explicit Save/Cancel
 * rather than immediate per-keystroke persistence, because an empty workspace
 * name would be visibly broken everywhere it's rendered (tabs, sidebar,
 * window title). See "Workspace properties modal redesign" in RFC 0015.
 *
 * Modeled on the file-explorer inline-rename pattern (`Tree.tsx` /
 * `TreeNodes.tsx`), with two deliberate deviations: Save shows an inline
 * error on an empty value instead of silently discarding, and there is no
 * Escape-to-cancel handler here — the enclosing modal's own `dismissible`
 * Escape/backdrop-click already closes the whole modal (discarding an
 * in-progress edit, per the agreed "closing cancels the edit" rule), and
 * that handler is a document-level, capture-phase listener registered at
 * modal-mount time — always ahead of anything this component could attach,
 * so a local interception here would be unreliable rather than deliberate.
 */
export function EditableWorkspaceName({
  name,
  onSave,
}: EditableWorkspaceNameProps) {
  // null = not editing; a string = the staged edit-mode value.
  const [value, setValue] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const editing = value !== null;

  useLayoutEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  function startEdit() {
    setValue(name);
    setError(null);
  }

  function cancel() {
    setValue(null);
    setError(null);
  }

  function save() {
    const result = validateWorkspaceName(value ?? "");
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (result.value !== name) onSave(result.value);
    setValue(null);
    setError(null);
  }

  if (!editing) {
    return (
      <div className="ws-name-display">
        <span className="ws-name-text">{name}</span>
        <Tooltip content="Rename">
          <button
            type="button"
            className="ws-name-edit-btn"
            aria-label="Rename workspace"
            onClick={startEdit}
          >
            <PencilSimple size={14} />
          </button>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="ws-name-edit">
      <div className="ws-name-edit-row">
        <input
          ref={inputRef}
          className="ws-rename-input"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save();
            }
          }}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <Tooltip content="Save">
          <button
            type="button"
            className="ws-name-edit-icon ws-name-edit-save"
            aria-label="Save name"
            onClick={save}
          >
            <Check size={14} weight="bold" />
          </button>
        </Tooltip>
        <Tooltip content="Cancel">
          <button
            type="button"
            className="ws-name-edit-icon ws-name-edit-cancel"
            aria-label="Cancel rename"
            onClick={cancel}
          >
            <X size={14} weight="bold" />
          </button>
        </Tooltip>
      </div>
      {error && <span className="ws-name-edit-error">{error}</span>}
    </div>
  );
}
