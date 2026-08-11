import { describe, expect, it } from "vitest";
import {
  DEMO_SCENES,
  extensionTodosScene,
  heroScene,
  sceneScript,
  terminalsFirstScene,
} from "./demo-scenes";

describe("demo scenes", () => {
  it("keeps the hero catalog free of extension-demo", () => {
    expect(heroScene.workspaceIds).not.toContain("extension-demo");
    expect(heroScene.initialOpenIds).toEqual(["website", "docs", "api"]);
  });

  it("isolates the extensions vignette to extension-demo only", () => {
    expect(extensionTodosScene.workspaceIds).toEqual(["extension-demo"]);
    expect(extensionTodosScene.initialOpenIds).toEqual(["extension-demo"]);
    expect(sceneScript(extensionTodosScene)[0]).toMatchObject({
      action: "reveal-todos-panel",
    });
  });

  it("registers every scene with a resolvable default script", () => {
    for (const scene of DEMO_SCENES) {
      expect(sceneScript(scene).length).toBeGreaterThan(0);
    }
  });

  it("isolates the terminals-first vignette", () => {
    expect(terminalsFirstScene.workspaceIds).toEqual(["terminals-demo"]);
    expect(sceneScript(terminalsFirstScene)).toEqual([
      { afterMs: 5_000, action: "start-claude-terminal" },
      { afterMs: 7_000, action: "reveal-codex-tab" },
    ]);
  });
});
