import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { IconButton } from "./IconButton";
import { Input } from "./Input";
import { Textarea } from "./Textarea";
import { Tooltip } from "./Tooltip";
import {
  inlineEditDisplayClass,
  inlineEditRowClass,
} from "./inline-edit-classes";
import { setActiveInlineEditCancel } from "./inline-edit-controller";

/**
 * Result of an {@link InlineEdit} `validate` callback.
 *
 * @category Core Types
 * @public
 */
export type InlineEditValidation =
  | { ok: true; value: string }
  | { ok: false; error: string };

function PencilIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M11.1 2.4a1.4 1.4 0 0 1 2 2L5.5 12l-2.8.8.8-2.8 7.6-7.6z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 8.5l3 3 7-7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M4 4l8 8M12 4l-8 8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Click-to-edit a value in place — a static display with a pencil affordance
 * that swaps to a field with explicit ✓ Save / ✗ Cancel buttons. Use it for
 * values where committing an empty/invalid value would be visibly broken
 * elsewhere; everything else in a modal should save as you type instead.
 *
 * **Escape is two-stage**: the first Esc cancels the edit; the next Esc
 * closes the modal. The host coordinates this via the SDK's
 * `setActiveInlineEditCancel` hook — do not add your own Escape handler.
 *
 * Styled purely via host-provided `.silo-inline-edit*` classes — no
 * stylesheet import is needed in the extension.
 *
 * @example
 * ```tsx
 * <InlineEdit
 *   value={ws.name}
 *   onSave={(name) => ctx.workspaces.rename(ws.id, name)}
 *   validate={validateWorkspaceName}
 *   aria-label="Rename workspace"
 * />
 *
 * <InlineEdit
 *   multiline
 *   value={description}
 *   onSave={setDescription}
 *   aria-label="Edit description"
 * />
 * ```
 *
 * @category Consumer Services
 * @public
 */
export function InlineEdit({
  value,
  onSave,
  validate,
  multiline = false,
  "aria-label": ariaLabel,
}: {
  /** The committed value. */
  value: string;
  /**
   * Called with the trimmed, validated value; not called if unchanged.
   */
  onSave: (value: string) => void;
  /**
   * Optional — failure shows the error inline and blocks the save.
   */
  validate?: (v: string) => InlineEditValidation;
  /** Textarea-based editing. */
  multiline?: boolean;
  "aria-label": string;
}): ReactNode {
  // null = not editing; a string = the staged edit-mode value.
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const editing = draft !== null;

  function cancel() {
    setDraft(null);
    setError(null);
  }

  function save() {
    const raw = draft ?? "";
    const result = validate
      ? validate(raw)
      : { ok: true as const, value: raw.trim() };
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (result.value !== value) onSave(result.value);
    setDraft(null);
    setError(null);
  }

  useLayoutEffect(() => {
    if (!editing) return;
    const el = multiline ? textareaRef.current : inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [editing, multiline]);

  // Register with the host's two-stage Escape yield while editing.
  useEffect(() => {
    if (!editing) return;
    setActiveInlineEditCancel(cancel);
    return () => setActiveInlineEditCancel(null);
  }, [editing]);

  function onFieldKeyDown(
    e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) {
    if (multiline) {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        save();
      }
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      save();
    }
  }

  if (!editing) {
    return (
      <div className="silo-inline-edit">
        <div className={inlineEditDisplayClass(multiline)}>
          <span className="silo-inline-edit-value">{value}</span>
          <Tooltip content="Edit">
            <IconButton
              size="sm"
              aria-label={ariaLabel}
              onClick={() => {
                setDraft(value);
                setError(null);
              }}
            >
              <PencilIcon />
            </IconButton>
          </Tooltip>
        </div>
      </div>
    );
  }

  return (
    <div className="silo-inline-edit">
      <div className={inlineEditRowClass(multiline)}>
        {multiline ? (
          <Textarea
            ref={textareaRef}
            value={draft ?? ""}
            aria-label={ariaLabel}
            onChange={(e) => {
              setDraft(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={onFieldKeyDown}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
        ) : (
          <Input
            ref={inputRef}
            value={draft ?? ""}
            aria-label={ariaLabel}
            onChange={(e) => {
              setDraft(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={onFieldKeyDown}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
        )}
        <Tooltip content="Save">
          <IconButton size="sm" aria-label="Save" onClick={save}>
            <CheckIcon />
          </IconButton>
        </Tooltip>
        <Tooltip content="Cancel">
          <IconButton size="sm" aria-label="Cancel" onClick={cancel}>
            <XIcon />
          </IconButton>
        </Tooltip>
      </div>
      {error && <span className="silo-inline-edit-error">{error}</span>}
    </div>
  );
}
