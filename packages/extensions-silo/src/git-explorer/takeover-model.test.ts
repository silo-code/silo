import { describe, it, expect } from "vitest";
import {
  detailPaneSlot,
  listPaneSlot,
  shouldExitTakeover,
  shouldPushCommitsOnOpen,
} from "./takeover-model";
import { ROOT_VIEW, type PanelView } from "./view-stack";

const COMMITS: PanelView = { kind: "commits" };
const DETAIL: PanelView = { kind: "commit-detail", hash: "abc123" };

describe("shouldPushCommitsOnOpen", () => {
  it("pushes a fresh commits view when the repo's stack is at root", () => {
    expect(shouldPushCommitsOnOpen(ROOT_VIEW)).toBe(true);
  });

  it("does not push when the repo was left mid-drill — resumes as-is", () => {
    expect(shouldPushCommitsOnOpen(COMMITS)).toBe(false);
    expect(shouldPushCommitsOnOpen(DETAIL)).toBe(false);
  });
});

describe("shouldExitTakeover", () => {
  it("exits once the active repo's stack pops back to root", () => {
    expect(shouldExitTakeover(true, ROOT_VIEW)).toBe(true);
  });

  it("stays open while the active repo is mid-drill", () => {
    expect(shouldExitTakeover(true, COMMITS)).toBe(false);
    expect(shouldExitTakeover(true, DETAIL)).toBe(false);
  });

  it("never exits a repo that isn't the active takeover", () => {
    expect(shouldExitTakeover(false, ROOT_VIEW)).toBe(false);
    expect(shouldExitTakeover(false, COMMITS)).toBe(false);
  });
});

describe("listPaneSlot / detailPaneSlot", () => {
  it("centers the list and parks detail off-screen right at the commits view", () => {
    expect(listPaneSlot(COMMITS)).toBe("current");
    expect(detailPaneSlot(COMMITS)).toBe("parked-right");
  });

  it("centers detail and parks the list off-screen left at commit-detail", () => {
    expect(listPaneSlot(DETAIL)).toBe("parked-left");
    expect(detailPaneSlot(DETAIL)).toBe("current");
  });

  it("parks detail off-screen right at root too (nothing pushed yet)", () => {
    expect(listPaneSlot(ROOT_VIEW)).toBe("current");
    expect(detailPaneSlot(ROOT_VIEW)).toBe("parked-right");
  });
});
