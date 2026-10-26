import { describe, expect, it } from "vitest";
import {
  EXIT_PLAN_TOOL_NAME,
  modeAfterPlanApproval,
  permissionToolName,
} from "./exit-plan-mode";

/** The modes `claude-agent-acp` offers on a session with bypass allowed. */
const CLAUDE_MODES = [
  "default",
  "acceptEdits",
  "plan",
  "auto",
  "bypassPermissions",
];

describe("permissionToolName", () => {
  it("reads the adapter's toolCall.name", () => {
    expect(
      permissionToolName({
        toolCall: { toolCallId: "tc1", name: "ExitPlanMode" },
      }),
    ).toBe("ExitPlanMode");
  });

  it("is undefined when the agent sent no toolCall, or no name on it", () => {
    expect(permissionToolName({})).toBeUndefined();
    expect(permissionToolName({ toolCall: null })).toBeUndefined();
    expect(permissionToolName({ toolCall: "Write" })).toBeUndefined();
    expect(permissionToolName({ toolCall: {} })).toBeUndefined();
    expect(permissionToolName({ toolCall: { name: "" } })).toBeUndefined();
    expect(permissionToolName({ toolCall: { name: 7 } })).toBeUndefined();
  });
});

describe("modeAfterPlanApproval", () => {
  const forOption = (optionId: string, availableModes = CLAUDE_MODES) =>
    modeAfterPlanApproval({
      toolName: EXIT_PLAN_TOOL_NAME,
      optionId,
      availableModes,
    });

  it("maps every accept the adapter offers to the mode it leaves behind", () => {
    expect(forOption("exit-plan-default")).toBe("default");
    expect(forOption("exit-plan-accept-edits")).toBe("acceptEdits");
    expect(forOption("exit-plan-auto")).toBe("auto");
    expect(forOption("exit-plan-bypass")).toBe("bypassPermissions");
  });

  it("maps the clear-context accepts to the same modes", () => {
    // These also publish their own `current_mode_update`; mapping them keeps
    // the two paths agreeing rather than racing to different values.
    expect(forOption("exit-plan-clear-accept-edits")).toBe("acceptEdits");
    expect(forOption("exit-plan-clear-auto")).toBe("auto");
    expect(forOption("exit-plan-clear-bypass")).toBe("bypassPermissions");
  });

  it("says nothing about the mode when the user keeps planning", () => {
    expect(forOption("reject")).toBeUndefined();
  });

  it("ignores an option id it does not know", () => {
    expect(forOption("allow-once")).toBeUndefined();
    expect(forOption("")).toBeUndefined();
  });

  it("only fires for ExitPlanMode, never another tool reusing an id", () => {
    expect(
      modeAfterPlanApproval({
        toolName: "Write",
        optionId: "exit-plan-accept-edits",
        availableModes: CLAUDE_MODES,
      }),
    ).toBeUndefined();
    expect(
      modeAfterPlanApproval({
        toolName: undefined,
        optionId: "exit-plan-accept-edits",
        availableModes: CLAUDE_MODES,
      }),
    ).toBeUndefined();
  });

  it("refuses a mode this session does not offer", () => {
    // `bypassPermissions` is absent when the adapter was built without it —
    // applying it would leave the picker on a value it cannot render.
    expect(
      forOption("exit-plan-bypass", ["default", "acceptEdits", "plan"]),
    ).toBeUndefined();
    expect(forOption("exit-plan-accept-edits", [])).toBeUndefined();
  });
});
