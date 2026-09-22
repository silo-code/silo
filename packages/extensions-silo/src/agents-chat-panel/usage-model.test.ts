import { describe, expect, it } from "vitest";
import {
  formatTokenCount,
  usagePercent,
  usageTone,
  usageValueText,
} from "./usage-model";

describe("formatTokenCount", () => {
  it("keeps small counts exact", () => {
    expect(formatTokenCount(512)).toBe("512");
    expect(formatTokenCount(0)).toBe("0");
  });

  it("compacts four-digit-and-up counts to one decimal of k", () => {
    expect(formatTokenCount(13500)).toBe("13.5k");
    expect(formatTokenCount(8192)).toBe("8.2k");
  });

  it("drops the trailing .0 for a whole multiple of 1000", () => {
    expect(formatTokenCount(200000)).toBe("200k");
  });
});

describe("usagePercent", () => {
  it("rounds used/size to a whole percent", () => {
    expect(usagePercent({ used: 13500, size: 200000 })).toBe(7);
  });

  it("reads 0% for a size of zero rather than dividing by zero", () => {
    expect(usagePercent({ used: 5, size: 0 })).toBe(0);
  });

  it("clamps a used past size to 100%", () => {
    expect(usagePercent({ used: 9000, size: 8192 })).toBe(100);
  });
});

describe("usageTone", () => {
  it("is neutral under 70%, warn from 70%, err from 90%", () => {
    expect(usageTone(0)).toBe("neutral");
    expect(usageTone(69)).toBe("neutral");
    expect(usageTone(70)).toBe("warn");
    expect(usageTone(89)).toBe("warn");
    expect(usageTone(90)).toBe("err");
    expect(usageTone(100)).toBe("err");
  });
});

describe("usageValueText", () => {
  it("composes the Context option's value text", () => {
    expect(usageValueText({ used: 13500, size: 200000 })).toBe(
      "13.5k/200k (7%)",
    );
  });
});
