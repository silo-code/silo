// The two origin wordings, which read in different grammatical positions and
// so can't share one string — see source-meta.tsx.

import { describe, it, expect } from "vitest";
import type { InstallSource } from "@silo-code/extension-host/internal";
import { sourceBadgeLabel, sourceOriginLabel } from "./source-meta";

const KINDS: InstallSource["kind"][] = ["folder", "url", "npm", "registry"];

describe("sourceOriginLabel", () => {
  it("completes the sentence 'Installed from …'", () => {
    expect(`Installed from ${sourceOriginLabel("folder")}`).toBe(
      "Installed from a folder",
    );
    expect(`Installed from ${sourceOriginLabel("registry")}`).toBe(
      "Installed from the registry",
    );
  });

  it("covers every install kind", () => {
    for (const kind of KINDS) expect(sourceOriginLabel(kind)).toBeTruthy();
  });
});

describe("sourceBadgeLabel", () => {
  it("stands alone as a noun phrase, unlike the inline wording", () => {
    expect(sourceBadgeLabel("folder")).toBe("Folder Install");
    expect(sourceBadgeLabel("url")).toBe("URL Install");
  });

  it("covers every install kind", () => {
    for (const kind of KINDS) expect(sourceBadgeLabel(kind)).toBeTruthy();
  });

  it("never reuses the sentence-fragment wording", () => {
    // "a folder" in a pill reads as a typo; the split exists to prevent that.
    for (const kind of KINDS) {
      expect(sourceBadgeLabel(kind)).not.toBe(sourceOriginLabel(kind));
    }
  });
});
