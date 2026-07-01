export interface GroupDraft {
  name: string;
  color: string | undefined;
}

/**
 * Pure decision for the group properties form, shared by the create and edit
 * flows.
 *
 * - `create`: the submit is enabled as soon as there is a non-empty name; the
 *   trimmed values are what get committed.
 * - `edit`: the submit is enabled only when the name (non-empty and different)
 *   or the color changed; a blank name reverts to the original.
 */
export function resolveGroupProps(
  mode: "create" | "edit",
  initial: GroupDraft,
  draft: GroupDraft,
): { canSubmit: boolean; changes: GroupDraft } {
  const trimmed = draft.name.trim();
  const hasName = trimmed.length > 0;
  if (mode === "create") {
    return {
      canSubmit: hasName,
      changes: { name: trimmed, color: draft.color },
    };
  }
  const nameChanged = hasName && trimmed !== initial.name;
  const colorChanged = draft.color !== initial.color;
  return {
    canSubmit: nameChanged || colorChanged,
    changes: { name: hasName ? trimmed : initial.name, color: draft.color },
  };
}
