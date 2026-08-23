import { describe, it, expect } from "vitest";
import { buildSessionEnv, stripReservedEnv } from "./session-env";

describe("stripReservedEnv", () => {
  it("keeps ordinary variables untouched", () => {
    const { env, dropped } = stripReservedEnv({
      NO_COLOR: "1",
      LANG: "en_US.UTF-8",
    });
    expect(env).toEqual({ NO_COLOR: "1", LANG: "en_US.UTF-8" });
    expect(dropped).toEqual([]);
  });

  it("drops the reserved prefix and reports what it dropped", () => {
    const { env, dropped } = stripReservedEnv({
      SILO_TERMINAL_ID: "spoofed",
      SILO_WORKSPACE_ID: "spoofed",
      EDITOR: "vim",
    });
    expect(env).toEqual({ EDITOR: "vim" });
    expect(dropped).toEqual(["SILO_TERMINAL_ID", "SILO_WORKSPACE_ID"]);
  });

  it("drops the bare SILO flag too, so `SILO=1` can't be forged", () => {
    const { env, dropped } = stripReservedEnv({ SILO: "1" });
    expect(env).toEqual({});
    expect(dropped).toEqual(["SILO"]);
  });

  it("does not drop variables that merely start with the letters SILO", () => {
    // `SILOH` is not in the namespace — only `SILO` and `SILO_*` are.
    const { env, dropped } = stripReservedEnv({ SILOH: "x", SILOS: "y" });
    expect(env).toEqual({ SILOH: "x", SILOS: "y" });
    expect(dropped).toEqual([]);
  });

  it("drops any casing — Windows env lookup ignores case, so `silo_` is ours too", () => {
    // Without this, an extension on Windows could set `silo_terminal_id` and
    // have the child read it back as `SILO_TERMINAL_ID`, defeating the guard —
    // and with both spellings present, which one wins is undefined.
    const { env, dropped } = stripReservedEnv({
      silo_terminal_id: "t_victim",
      Silo_Workspace_Id: "ws_victim",
      sIlO: "0",
    });
    expect(env).toEqual({});
    expect(dropped).toEqual(["silo_terminal_id", "Silo_Workspace_Id", "sIlO"]);
  });

  it("treats an absent map as empty", () => {
    expect(stripReservedEnv(undefined)).toEqual({ env: {}, dropped: [] });
  });
});

describe("buildSessionEnv", () => {
  const identity = {
    terminalId: "term_3bdbda1b-234e-4e9a-aae3-b3fd9c91e65c",
    workspaceId: "ws_1",
    workspacePath: "/Users/x/proj",
  };

  it("stamps the full identity for a terminal Silo owns", () => {
    const { env } = buildSessionEnv(identity);
    expect(env).toEqual({
      SILO: "1",
      SILO_TERMINAL_ID: "term_3bdbda1b-234e-4e9a-aae3-b3fd9c91e65c",
      SILO_WORKSPACE_ID: "ws_1",
      SILO_WORKSPACE_PATH: "/Users/x/proj",
    });
  });

  it("merges caller variables underneath the identity", () => {
    const { env } = buildSessionEnv(identity, { NO_COLOR: "1" });
    expect(env.NO_COLOR).toBe("1");
    expect(env.SILO_TERMINAL_ID).toBe(
      "term_3bdbda1b-234e-4e9a-aae3-b3fd9c91e65c",
    );
  });

  it("ignores a caller trying to claim someone else's terminal", () => {
    const { env, dropped } = buildSessionEnv(identity, {
      SILO_TERMINAL_ID: "t_victim",
    });
    expect(env.SILO_TERMINAL_ID).toBe(
      "term_3bdbda1b-234e-4e9a-aae3-b3fd9c91e65c",
    );
    expect(dropped).toEqual(["SILO_TERMINAL_ID"]);
  });

  it("still marks the session as Silo's when a caller forges the flag", () => {
    const { env, dropped } = buildSessionEnv(identity, { SILO: "0" });
    expect(env.SILO).toBe("1");
    expect(dropped).toEqual(["SILO"]);
  });

  it("omits a terminal id for a session spawned through public `spawn`", () => {
    // Third-party extensions reach `ctx.process.spawn`, which has no tab to
    // name — they get the workspace facts and the flag, never an id.
    const { env } = buildSessionEnv({
      workspaceId: "ws_1",
      workspacePath: "/Users/x/proj",
    });
    expect(env).toEqual({
      SILO: "1",
      SILO_WORKSPACE_ID: "ws_1",
      SILO_WORKSPACE_PATH: "/Users/x/proj",
    });
    expect("SILO_TERMINAL_ID" in env).toBe(false);
  });

  it("omits workspace facts when there is no active workspace", () => {
    const { env } = buildSessionEnv({});
    expect(env).toEqual({ SILO: "1" });
  });

  it("never emits an empty-string identity value", () => {
    // An empty id would satisfy a naive `[ -n "$SILO_TERMINAL_ID" ]`-style
    // guard's *presence* check while naming no terminal at all.
    const { env } = buildSessionEnv({ terminalId: "", workspaceId: "" });
    expect("SILO_TERMINAL_ID" in env).toBe(false);
    expect("SILO_WORKSPACE_ID" in env).toBe(false);
  });
});
