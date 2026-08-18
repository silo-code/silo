import { describe, it, expect } from "vitest";
import {
  MAX_LISTED_FILES,
  removeConfirmLabel,
  removeWorktreeDialogModel,
} from "./remove-worktree-model";

const base = {
  worktreePath: "/w/repo-feat",
  locked: null,
  dirtyFiles: [] as string[] | null,
};

describe("removeWorktreeDialogModel", () => {
  it("states only the deletion for a plain worktree", () => {
    const m = removeWorktreeDialogModel(base);
    expect(m.title).toBe('Remove worktree "repo-feat"?');
    expect(m.confirmLabel).toBe("Remove");
    expect(m.effects).toEqual([
      { kind: "delete", text: "Delete /w/repo-feat", destructive: true },
    ]);
  });

  it("leads with the lock, and names its reason", () => {
    const m = removeWorktreeDialogModel({ ...base, locked: "pinned by CI" });
    expect(m.effects.map((e) => e.kind)).toEqual(["unlock", "delete"]);
    expect(m.effects[0]).toMatchObject({
      text: "Remove the lock (pinned by CI)",
      // Reversible, and restored if the removal doesn't go through.
      destructive: false,
    });
    expect(m.confirmLabel).toBe("Unlock and Remove");
  });

  it("omits the parenthetical for a lock with no reason", () => {
    const m = removeWorktreeDialogModel({ ...base, locked: "" });
    expect(m.effects[0]!.text).toBe("Remove the lock");
  });

  it("counts uncommitted files and lists them", () => {
    const m = removeWorktreeDialogModel({
      ...base,
      dirtyFiles: ["a.txt", "b.txt"],
    });
    expect(m.effects.map((e) => e.text)).toEqual([
      "Discard 2 uncommitted files",
      "Delete /w/repo-feat",
    ]);
    expect(m.files).toEqual(["a.txt", "b.txt"]);
    expect(m.moreFiles).toBe(0);
    expect(m.confirmLabel).toBe("Discard and Remove");
  });

  it("says “file”, not “files”, for exactly one", () => {
    const m = removeWorktreeDialogModel({ ...base, dirtyFiles: ["a.txt"] });
    expect(m.effects[0]!.text).toBe("Discard 1 uncommitted file");
  });

  it("caps the listed files and counts the overflow", () => {
    const files = Array.from(
      { length: MAX_LISTED_FILES + 3 },
      (_, i) => `${i}`,
    );
    const m = removeWorktreeDialogModel({ ...base, dirtyFiles: files });
    expect(m.files).toHaveLength(MAX_LISTED_FILES);
    expect(m.moreFiles).toBe(3);
    // The count in the effect line is the real total, not the capped list.
    expect(m.effects[0]!.text).toBe(
      `Discard ${MAX_LISTED_FILES + 3} uncommitted files`,
    );
  });

  it("orders both obstacles the way git hits them", () => {
    const m = removeWorktreeDialogModel({
      ...base,
      locked: "pinned by CI",
      dirtyFiles: ["a.txt"],
    });
    expect(m.effects.map((e) => e.kind)).toEqual([
      "unlock",
      "discard",
      "delete",
    ]);
    expect(m.confirmLabel).toBe("Unlock, Discard and Remove");
  });

  it("says nothing about changes when the status couldn't be read", () => {
    const m = removeWorktreeDialogModel({ ...base, dirtyFiles: null });
    // Never claims the removal will be clean — it just doesn't warn.
    expect(m.effects.map((e) => e.kind)).toEqual(["delete"]);
    expect(m.files).toEqual([]);
    expect(m.confirmLabel).toBe("Remove");
  });
});

describe("removeConfirmLabel", () => {
  it("names every irreversible step the button takes", () => {
    expect(removeConfirmLabel(false, false)).toBe("Remove");
    expect(removeConfirmLabel(true, false)).toBe("Unlock and Remove");
    expect(removeConfirmLabel(false, true)).toBe("Discard and Remove");
    expect(removeConfirmLabel(true, true)).toBe("Unlock, Discard and Remove");
  });
});
