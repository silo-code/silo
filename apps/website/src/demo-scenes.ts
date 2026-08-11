import type { DemoScriptStep } from "./demo-config";
import {
  demoScript,
  extensionTodosRecordScript,
  navigatorDemoScript,
  terminalsFirstRecordScript,
  worktreeToastRecordScript,
} from "./demo-config";

/**
 * An isolated mini-demo: which workspaces exist, which start open (layout
 * comes from each workspace's `config.json`), and one or more scripts that
 * orchestrate that layout for the homepage embed or the vignette recorder.
 *
 * Add a new demo by:
 * 1. Authoring `workspaces/<id>/` (config + files + terminals),
 * 2. Declaring a scene here with those ids + scripts,
 * 3. Embedding `<DemoWorkspace scene={…} />` and/or adding a recorder preset.
 */
export type DemoScene = {
  id: string;
  label: string;
  /**
   * Subset of the global workspace catalog visible in this demo.
   * Other workspaces do not appear in the Navigator or the + menu.
   */
  workspaceIds: string[];
  /** Which of `workspaceIds` start open. The first id is the active workspace. */
  initialOpenIds: string[];
  /** Named orchestration scripts for this layout. */
  scripts: Record<string, DemoScriptStep[]>;
  /** Key in `scripts` used when no `scriptKey` override is passed. */
  defaultScript: string;
};

export function sceneScript(
  scene: DemoScene,
  scriptKey?: string,
): DemoScriptStep[] {
  const key = scriptKey ?? scene.defaultScript;
  const script = scene.scripts[key];
  if (!script) {
    throw new Error(
      `Demo scene "${scene.id}" has no script "${key}" (have: ${Object.keys(scene.scripts).join(", ")})`,
    );
  }
  return script;
}

/** Homepage hero — multi-workspace tour with the full interactive script. */
export const heroScene: DemoScene = {
  id: "hero",
  label: "Hero · full demo",
  workspaceIds: ["website", "docs", "api", "build-server", "mobile"],
  initialOpenIds: ["website", "docs", "api"],
  scripts: { main: demoScript },
  defaultScript: "main",
};

/** Cropped Navigator vignette — slow workspace switching. */
export const navigatorScene: DemoScene = {
  id: "navigator",
  label: "Navigator · workspaces",
  workspaceIds: ["website", "docs", "api"],
  initialOpenIds: ["website", "docs", "api"],
  scripts: { main: navigatorDemoScript },
  defaultScript: "main",
};

/** Git worktree-detect toast — website layout with Git panel. */
export const worktreeToastScene: DemoScene = {
  id: "worktree-toast",
  label: "Git · worktree toast",
  workspaceIds: ["website", "docs", "api"],
  initialOpenIds: ["website", "docs", "api"],
  scripts: { main: worktreeToastRecordScript },
  defaultScript: "main",
};

/**
 * Extensions story — isolated `extension-demo` workspace only.
 * Layout is entirely from that folder's config.json; script reveals TODOs.
 */
export const extensionTodosScene: DemoScene = {
  id: "extension-todos",
  label: "Extensions · TODOs panel",
  workspaceIds: ["extension-demo"],
  initialOpenIds: ["extension-demo"],
  scripts: { main: extensionTodosRecordScript },
  defaultScript: "main",
};

/**
 * Terminals-first story — Cursor | Claude 50/50 (Cursor first), then Codex on
 * the left. Rails collapsed so the center docks fill the crop.
 */
export const terminalsFirstScene: DemoScene = {
  id: "terminals-first",
  label: "Terminals · agents first",
  workspaceIds: ["terminals-demo"],
  initialOpenIds: ["terminals-demo"],
  scripts: { main: terminalsFirstRecordScript },
  defaultScript: "main",
};

export const DEMO_SCENES: DemoScene[] = [
  heroScene,
  navigatorScene,
  worktreeToastScene,
  extensionTodosScene,
  terminalsFirstScene,
];

export function findDemoScene(id: string): DemoScene {
  return DEMO_SCENES.find((scene) => scene.id === id) ?? heroScene;
}
