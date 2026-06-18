import { describe, it, expect } from "vitest";
import { parseArgs } from "./args.js";

describe("parseArgs", () => {
  it("returns empty object for bare invocation", () => {
    expect(parseArgs([])).toEqual({});
  });

  it("parses --key value", () => {
    expect(parseArgs(["--id", "dave.clock"])).toMatchObject({
      id: "dave.clock",
    });
  });

  it("parses --key=value", () => {
    expect(parseArgs(["--id=dave.clock"])).toMatchObject({ id: "dave.clock" });
  });

  it("parses all known flags", () => {
    expect(
      parseArgs([
        "--id",
        "dave.clock",
        "--path",
        "/tmp/my-ext",
        "--name",
        "Clock",
        "--publisher",
        "Dave",
        "--description",
        "Shows the time",
      ]),
    ).toEqual({
      id: "dave.clock",
      path: "/tmp/my-ext",
      name: "Clock",
      publisher: "Dave",
      description: "Shows the time",
    });
  });

  it("ignores unknown flags", () => {
    expect(parseArgs(["--unknown", "value", "--id", "dave.foo"])).toMatchObject(
      { id: "dave.foo" },
    );
  });

  it("does not consume a following flag as a value", () => {
    // --name has no value; the next token is another flag
    const result = parseArgs(["--name", "--id", "dave.foo"]);
    expect(result.name).toBeUndefined();
    expect(result.id).toBe("dave.foo");
  });

  it("mixed --key value and --key=value", () => {
    expect(parseArgs(["--id=dave.clock", "--publisher", "Dave"])).toEqual({
      id: "dave.clock",
      publisher: "Dave",
    });
  });
});
