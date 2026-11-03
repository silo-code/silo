import { describe, it, expect } from "vitest";
import { DND_MIME } from "@silo-code/sdk";
import { fileDropPaths } from "./file-drop";

const file = (value: string) => ({ mime: DND_MIME.filePath, value });

describe("fileDropPaths", () => {
  it("stages the dropped paths on a Shift-held drop", () => {
    expect(
      fileDropPaths({
        mode: "paste",
        items: [file("/a/one.ts"), file("/a/two.ts")],
        inputEnabled: true,
      }),
    ).toEqual(["/a/one.ts", "/a/two.ts"]);
  });

  it("lets a plain copy-mode drop fall through to the dock", () => {
    expect(
      fileDropPaths({
        mode: "copy",
        items: [file("/a/one.ts")],
        inputEnabled: true,
      }),
    ).toBeNull();
  });

  it("ignores a drop while the composer is not writable", () => {
    expect(
      fileDropPaths({
        mode: "paste",
        items: [file("/a/one.ts")],
        inputEnabled: false,
      }),
    ).toBeNull();
  });

  it("ignores items of other MIME types", () => {
    expect(
      fileDropPaths({
        mode: "paste",
        items: [{ mime: "text/plain", value: "hello" }],
        inputEnabled: true,
      }),
    ).toBeNull();
  });

  it("keeps only the file-path items from a mixed drag", () => {
    expect(
      fileDropPaths({
        mode: "paste",
        items: [{ mime: "text/plain", value: "hello" }, file("/a/one.ts")],
        inputEnabled: true,
      }),
    ).toEqual(["/a/one.ts"]);
  });

  it("falls through on an empty drag", () => {
    expect(
      fileDropPaths({ mode: "paste", items: [], inputEnabled: true }),
    ).toBeNull();
  });
});
