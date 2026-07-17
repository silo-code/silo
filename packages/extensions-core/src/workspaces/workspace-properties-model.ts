import type { WorkspacePropertyPage } from "@silo-code/sdk";
import type { Workspace } from "./workspace-helpers";

/** Result of validating a candidate workspace name. */
export type NameValidation =
  | { ok: true; value: string }
  | { ok: false; error: string };

/**
 * Trims and validates a candidate workspace name. Unlike the old staged-form
 * behavior (which silently kept the previous name on empty submit), the
 * edit-mode component surfaces this as an inline error instead — see
 * "Workspace properties modal redesign" in RFC 0015.
 */
export function validateWorkspaceName(input: string): NameValidation {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: "Name can't be empty." };
  return { ok: true, value: trimmed };
}

/** Registered property pages relevant to `ws`, in the registry's order. */
export function visiblePropertyPages(
  pages: WorkspacePropertyPage[],
  ws: Workspace,
): WorkspacePropertyPage[] {
  return pages.filter((p) => p.visible?.(ws) ?? true);
}
