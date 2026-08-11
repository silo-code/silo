/** Public demo engine surface for `@silo-code/website-recorder`. */

export { DemoWorkspace, type DemoWorkspaceProps } from "./DemoWorkspace";
export {
  DEMO_SCENES,
  extensionTodosScene,
  findDemoScene,
  heroScene,
  navigatorScene,
  sceneScript,
  terminalsFirstScene,
  worktreeToastScene,
  type DemoScene,
} from "./demo-scenes";
export {
  isDemoScriptClickStep,
  navigatorDemoScript,
  worktreeToastRecordScript,
  type DemoScriptStep,
  type Workspace,
} from "./demo-config";
export { baseWorkspaces } from "./workspace-loader";
export { allWorkspaces } from "./workspace-loader-all";
export {
  cursorTravelProgress,
  planScriptSeek,
  scriptDurationMs,
  SCRIPT_CLICK_RELEASE_MS,
  SCRIPT_CURSOR_TOP_Y_PCT,
  SCRIPT_DEFAULT_HOLD_MS,
  type ScriptCursorPlan,
  type ScriptSeekPlan,
} from "./demo-script-timing";
