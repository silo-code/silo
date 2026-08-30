import { describe, it, expect } from "vitest";
import {
  formatBytes,
  formatDataSummary,
  resolveUninstallOutcome,
} from "./uninstall-model";

describe("resolveUninstallOutcome", () => {
  it("uninstalls and deletes when the box was checked", () => {
    expect(resolveUninstallOutcome("uninstall", true)).toEqual({
      uninstall: true,
      deleteData: true,
    });
  });

  it("uninstalls and keeps the data when the box was not checked", () => {
    expect(resolveUninstallOutcome("uninstall", false)).toEqual({
      uninstall: true,
      deleteData: false,
    });
  });

  it("does nothing on cancel, even with the box checked", () => {
    expect(resolveUninstallOutcome("cancel", true)).toEqual({
      uninstall: false,
      deleteData: false,
    });
  });

  it("treats a dismissal the same as cancel", () => {
    expect(resolveUninstallOutcome(undefined, true)).toEqual({
      uninstall: false,
      deleteData: false,
    });
  });
});

describe("formatBytes", () => {
  it("uses bytes below 1 KB", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(812)).toBe("812 B");
  });

  it("steps up through the units", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1_258_291)).toBe("1.2 MB");
    expect(formatBytes(5 * 1024 ** 3)).toBe("5.0 GB");
  });

  it("drops the decimal once the number is big enough to carry itself", () => {
    expect(formatBytes(64 * 1024)).toBe("64 KB");
  });
});

describe("formatDataSummary", () => {
  it("agrees in number with the file count", () => {
    expect(formatDataSummary({ files: 1, bytes: 10, truncated: false })).toBe(
      "1 file, 10 B",
    );
    expect(
      formatDataSummary({ files: 3, bytes: 1_258_291, truncated: false }),
    ).toBe("3 files, 1.2 MB");
  });

  it("says the size is unknown rather than reporting a floor as fact", () => {
    expect(formatDataSummary({ files: 5000, bytes: 1, truncated: true })).toBe(
      "size unknown",
    );
  });
});
