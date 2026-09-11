import { describe, expect, it } from "vitest";
import type { AgentSessionConfigOption } from "@silo-code/sdk";
import {
  pruneSessionConfig,
  sessionConfigToApply,
} from "./profile-session-config";

const modeOption: AgentSessionConfigOption = {
  id: "mode",
  name: "Mode",
  category: "mode",
  type: "select",
  currentValue: "default",
  options: [
    { value: "default", name: "Manual" },
    { value: "bypassPermissions", name: "Auto" },
  ],
};

const modelOption: AgentSessionConfigOption = {
  id: "model",
  name: "Model",
  category: "model",
  type: "select",
  currentValue: "auto",
  options: [
    { value: "auto", name: "Auto" },
    { value: "opus", name: "Opus" },
  ],
};

describe("sessionConfigToApply", () => {
  it("returns nothing when sessionConfig is absent", () => {
    expect(sessionConfigToApply(undefined, [modeOption])).toEqual([]);
  });

  it("skips keys the agent did not advertise", () => {
    expect(sessionConfigToApply({ unknown: "x" }, [modeOption])).toEqual([]);
  });

  it("skips invalid values and values already in effect", () => {
    expect(
      sessionConfigToApply({ mode: "default", model: "nope" }, [
        modeOption,
        modelOption,
      ]),
    ).toEqual([]);
  });

  it("returns only defaults that still need applying", () => {
    expect(
      sessionConfigToApply({ mode: "bypassPermissions", model: "opus" }, [
        modeOption,
        modelOption,
      ]),
    ).toEqual([
      { id: "mode", value: "bypassPermissions" },
      { id: "model", value: "opus" },
    ]);
  });
});

describe("pruneSessionConfig", () => {
  it("drops stale keys and invalid values", () => {
    expect(
      pruneSessionConfig(
        { mode: "bypassPermissions", gone: "x", model: "nope" },
        [modeOption, modelOption],
      ),
    ).toEqual({ mode: "bypassPermissions" });
  });
});
