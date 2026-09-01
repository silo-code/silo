import { describe, it, expect } from "vitest";
import type { TerminalRecord, WorkspaceInternal } from "./types";
import { normalizeTerminalKinds } from "./terminal-kind-migration";

function ws(terminals: TerminalRecord[]): WorkspaceInternal {
  return {
    id: "w",
    name: "w",
    folder: "/w",
    createdAt: "",
    lastOpenedAt: "",
    terminals,
    editors: [],
    dockLayout: null,
    previewEditorId: null,
  };
}

const t = (id: string, kind: TerminalRecord["kind"]): TerminalRecord => ({
  id,
  sessionId: "s",
  kind,
  title: "T",
});

describe("normalizeTerminalKinds", () => {
  it("rewrites deprecated claude/pi kinds to shell, leaving other fields", () => {
    const out = normalizeTerminalKinds(
      ws([
        { ...t("a", "claude"), customName: "x" },
        t("b", "pi"),
        t("c", "shell"),
      ]),
    );
    expect(out.terminals.map((x) => x.kind)).toEqual([
      "shell",
      "shell",
      "shell",
    ]);
    expect(out.terminals[0].customName).toBe("x");
    expect(out.terminals[0].id).toBe("a");
  });

  it("returns the same object when nothing needs changing", () => {
    const input = ws([t("a", "shell")]);
    expect(normalizeTerminalKinds(input)).toBe(input);
  });

  it("does not synthesize a profileId", () => {
    const out = normalizeTerminalKinds(ws([t("a", "claude")]));
    expect(out.terminals[0].profileId).toBeUndefined();
  });
});
